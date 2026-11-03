import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { UsageError } from '../../lib/errors.mjs';
import { toolEnv } from './sandbox.mjs';
import { round } from './session.mjs';
import { canonical, within, WorkspaceError } from './workspace.mjs';

// Matrix driver (PROTOCOL §4.2, §7.1–§7.4; D-06, D-11, D-12): per cell prepare the copy, run its sessions, grade the
// hidden acceptance only after every session exited, and write one record atomically. Spend lives in an append-only
// ledger (`spend.jsonl`), so a crash never loses what was paid; blocks start only while spend + reservation ≤ cap.

const TAIL = 4000;
const GRADE_TIMEOUT_MS = 30 * 60_000;
/** Attempts per cell: the first and one rerun after an abandoned attempt (§7.4). */
const MAX_ATTEMPTS = 2;

function writeAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const ledgerRows = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

/**
 * The agent's work: start tree vs the copy's working tree incl. untracked files. Git runs as the host user, so it never
 * uses the copy's own repository config (fsmonitor, filters, hooks are agent-controlled): a scratch GIT_DIR with no
 * config borrows the copy's objects through `alternates`, and only the working tree is the copy.
 */
function capturePatch(dir, start) {
  const scratch = mkdtempSync(join(tmpdir(), 'bench-index-'));
  try {
    const gitDir = join(scratch, 'git');
    const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: scratch, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_DIR: gitDir, GIT_WORK_TREE: dir };
    execFileSync('git', ['init', '-q', '--bare', gitDir], { env: { ...env, GIT_DIR: undefined, GIT_WORK_TREE: undefined } });
    writeFileSync(join(gitDir, 'objects', 'info', 'alternates'), `${join(dir, '.git', 'objects')}\n`);
    const git = (...args) => execFileSync('git', ['-c', 'core.bare=false', '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${join(scratch, 'no-hooks')}`, ...args],
      { cwd: dir, encoding: 'utf8', env, maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
    git('read-tree', start);
    git('add', '-A');
    return { patch: git('diff', '--cached', '--binary', start), changedPaths: git('diff', '--cached', '--name-only', start).split('\n').filter(Boolean) };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

/**
 * Copy the grading script into a fresh dir under `root` (default `outDir/grading`), run it with `graderArgv` (the benchmark user's
 * launcher + node in a real run, so agent code never runs as the host user) and cwd = copy, then delete the dir (D-06).
 */
function grade(script, cwd, root, id, graderArgv) {
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, `${id}-`));
  const started = Date.now();
  try {
    const copy = join(dir, basename(script));
    copyFileSync(script, copy);
    if (graderArgv.length > 1) { chmodSync(dir, 0o755); chmodSync(copy, 0o644); } // readable to the launcher's user, only now
    const r = spawnSync(graderArgv[0], [...graderArgv.slice(1), copy], { cwd, encoding: 'utf8', timeout: GRADE_TIMEOUT_MS, maxBuffer: 64 << 20,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: process.env.LANG ?? 'C.UTF-8', ...toolEnv(cwd) } });
    return { exit: r.status, signal: r.signal ?? null, tail: `${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-TAIL), ms: Date.now() - started };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Refuse when the acceptance script lies inside the copy or anything the session user can read (§5, D-06). */
function exposed(script, ws) {
  const real = canonical(script);
  return [ws.dir, ...(ws.readable ?? [])].find((r) => within(real, canonical(r))) ?? null;
}

/**
 * Run `cells` (from expandMatrix, in order) → `{ records, skipped, spentUsd, stopped? }`.
 * `reservation`: USD per cell, or `(cell) => USD`; a `(task, rep)` block starts only if spend + its reservation ≤
 * `capUsd`, and then runs to its end. `deps`: `prepare(cell, manifest)` → `{ dir, start, env, readable, setupUsd }`
 * (may be async), `runTrajectory(cell, ctx)` → `{ status, reason?, sessions, spentUsd }`, `versions()`, and an optional
 * `beforeRecord(cell)` hook and `release(cell, ws)`, called once a prepared cell is graded or refused. `graderArgv`
 * runs the acceptance script (default: this node) from a fresh dir under `gradeRoot` (default `<outDir>/grading`).
 * Records go to `<outDir>/records/<cell>.json`, spend to `<outDir>/spend.jsonl`.
 */
export async function runMatrix(cells, manifest, { outDir, gradeRoot, capUsd, reservation, deps, graderArgv = [process.execPath], now = Date.now } = {}) {
  if (!(capUsd > 0)) throw new UsageError('runMatrix: capUsd must be > 0');
  const reserve = typeof reservation === 'function' ? reservation : () => reservation;
  if (!outDir) throw new UsageError('runMatrix: outDir is required');
  const recDir = join(outDir, 'records');
  mkdirSync(recDir, { recursive: true });
  const ledger = join(outDir, 'spend.jsonl');
  let spent = round(ledgerRows(ledger).reduce((sum, row) => sum + row.usd, 0));
  const charge = (row) => { appendFileSync(ledger, `${JSON.stringify(row)}\n`); spent = round(spent + row.usd); };
  const recordPath = (id) => join(recDir, `${id}.json`);
  const markerPath = (id) => join(recDir, `${id}.inprogress`);
  const result = { records: [], skipped: [], spentUsd: 0 };
  let stopped = null;
  let lastEnd = null;

  // Cells interrupted during their sessions left no trajectory charge: their whole reservation counts (unverified),
  // charged once and before any cap check, so a resumed run never starts a block on understated spend.
  for (const cell of cells) {
    if (existsSync(recordPath(cell.id)) || !existsSync(markerPath(cell.id))) continue;
    const prev = readJson(markerPath(cell.id));
    const rows = ledgerRows(ledger).filter((r) => r.cell === cell.id && r.attempt === prev.attempt);
    if (!rows.some((r) => r.kind === 'trajectory' || r.kind === 'abandoned')) {
      charge({ cell: cell.id, attempt: prev.attempt, kind: 'abandoned', usd: prev.reservedUsd, unverified: true });
    }
  }

  const blocks = [];
  for (const cell of cells) {
    const key = `${cell.task}.${cell.rep}`;
    if (blocks.at(-1)?.key === key) blocks.at(-1).cells.push(cell);
    else blocks.push({ key, cells: [cell] });
  }

  const finish = (cell, base, fields) => {
    deps.beforeRecord?.(cell);
    const record = { ...base, ...fields, endedAt: new Date(now()).toISOString() };
    writeAtomic(recordPath(cell.id), record);
    rmSync(markerPath(cell.id), { force: true });
    result.records.push(record);
    lastEnd = now();
    return record;
  };

  async function runCell(cell) {
    const task = manifest.tasks.find((t) => t.id === cell.task);
    if (!task) throw new UsageError(`cell ${cell.id}: unknown task ${cell.task}`);
    const prev = existsSync(markerPath(cell.id)) ? readJson(markerPath(cell.id)) : null;
    const attempt = (prev?.attempt ?? 0) + 1;
    const started = now();
    const base = { cell: cell.id, task: cell.task, variant: cell.variant, rep: cell.rep, attempt,
      startedAt: new Date(started).toISOString(), gapMs: lastEnd == null ? null : started - lastEnd };
    const priorUsd = round(ledgerRows(ledger).filter((r) => r.cell === cell.id).reduce((s, r) => s + r.usd, 0));
    if (attempt > MAX_ATTEMPTS) {
      return finish(cell, { ...base, attempt: prev.attempt }, { status: 'failed', reason: `abandoned: ${prev.attempt} attempts interrupted`,
        accepted: false, acceptance: null, sessions: [], spentUsd: null, priorAttemptsUsd: priorUsd, spendUnverified: true, versions: deps.versions?.() ?? null });
    }
    const script = join(manifest.dir, task.acceptance);
    if (!existsSync(script)) {
      stopped = `no-acceptance: ${cell.id}`;
      return finish(cell, base, { status: 'failed', reason: 'no-acceptance', accepted: false, acceptance: null, sessions: [], spentUsd: 0 });
    }
    const reservedUsd = reserve(cell);
    writeAtomic(markerPath(cell.id), { attempt, startedAt: base.startedAt, reservedUsd });

    let ws;
    try { ws = await deps.prepare(cell, manifest); } catch (err) {
      if (!(err instanceof WorkspaceError)) throw err;
      stopped = `refused: ${cell.id}`;
      return finish(cell, base, { status: 'refused', reason: err.message, accepted: false, acceptance: null, sessions: [], spentUsd: 0 });
    }
    try { return await useWorkspace(cell, ws, { task, script, base, attempt, priorUsd, reservedUsd }); } finally { deps.release?.(cell, ws); }
  }

  /** Everything after prepare: exposure check, sessions, patch, grading, record (released by the caller). */
  async function useWorkspace(cell, ws, { task, script, base, attempt, priorUsd, reservedUsd }) {
    const setupUsd = ws.setupUsd ?? 0;
    if (setupUsd > 0) charge({ cell: cell.id, attempt, kind: 'setup', usd: setupUsd });
    const seen = exposed(script, ws);
    if (seen) {
      stopped = `refused: ${cell.id}`;
      return finish(cell, base, { status: 'refused', reason: `REFUSED: acceptance ${task.acceptance} is inside the readable set (${seen})`,
        accepted: false, acceptance: null, sessions: [], spentUsd: 0, setupUsd });
    }
    const cellBudgetUsd = round(reservedUsd - setupUsd);
    if (!(cellBudgetUsd > 0)) {
      return finish(cell, base, { status: 'failed', reason: 'budget: setup used the reservation', accepted: false, acceptance: null,
        sessions: [], spentUsd: 0, setupUsd });
    }

    const traj = await deps.runTrajectory(cell, { cwd: ws.dir, env: ws.env, readable: ws.readable, cellBudgetUsd, task });
    const unverified = traj.spentUsd == null;
    charge({ cell: cell.id, attempt, kind: 'trajectory', usd: unverified ? cellBudgetUsd : traj.spentUsd, unverified });
    if (traj.usageLimit) {
      // the account ran out, the agent did not fail: the cost stays on the cell, which runs again from scratch on resume
      stopped = `usage-limit: ${cell.id}`;
      mkdirSync(join(outDir, 'interrupted'), { recursive: true });
      writeAtomic(join(outDir, 'interrupted', `${cell.id}-${now()}.json`), { ...base, status: traj.status, reason: traj.reason,
        sessions: traj.sessions, spentUsd: traj.spentUsd, endedAt: new Date(now()).toISOString() });
      rmSync(markerPath(cell.id), { force: true });
      result.skipped.push(cell.id);
      return null;
    }
    // the sessions have all exited: only now does the acceptance material leave its directory (D-06)
    const { patch, changedPaths } = capturePatch(ws.dir, ws.start);
    const acceptance = traj.status === 'completed' ? grade(script, ws.dir, gradeRoot ?? join(outDir, 'grading'), cell.id, graderArgv) : null;
    return finish(cell, base, { status: traj.status, ...(traj.reason ? { reason: traj.reason } : {}), accepted: acceptance?.exit === 0,
      acceptance, patch, changedPaths, sessions: traj.sessions, spentUsd: unverified ? null : traj.spentUsd, spendUnverified: unverified,
      priorAttemptsUsd: priorUsd, setupUsd, versions: deps.versions?.() ?? null });
  }

  for (const block of blocks) {
    const todo = block.cells.filter((c) => !existsSync(recordPath(c.id)));
    if (!todo.length) continue;
    if (stopped) { result.skipped.push(...todo.map((c) => c.id)); continue; }
    const need = round(todo.reduce((sum, c) => sum + reserve(c), 0));
    if (round(spent + need) > capUsd) {
      stopped = `cap: ${spent} spent + ${need} reserved for block ${block.key} > ${capUsd}`;
      result.skipped.push(...todo.map((c) => c.id));
      continue;
    }
    for (const cell of todo) {
      if (stopped) result.skipped.push(cell.id);
      else await runCell(cell);
    }
  }
  return { ...result, spentUsd: spent, ...(stopped ? { stopped } : {}) };
}
