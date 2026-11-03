#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { UsageError } from '../lib/errors.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { expandMatrix } from './lib/matrix.mjs';
import { runMatrix } from './lib/orchestrate.mjs';
import { applyDeps, clearUserFiles, ensureDeps, exportPlugin, grantSession, handBack, reclaim, revokeSession, sessionEnv } from './lib/sandbox.mjs';
import { baseArgv, runSession } from './lib/session.mjs';
import { runTrajectory } from './lib/transitions.mjs';
import { canonical, ensureSnapshot, lockWorkDir, prepareCopy, TELOS_ROOT, within } from './lib/workspace.mjs';

// Benchmark runner CLI (bench/README.md "Running the matrix"). Exit 0 = every cell ran, 1 = a cell was skipped or
// refused or the run stopped, 2 = usage error.

const USAGE = 'usage: node bench/run.mjs --manifest <dir> --out <dir> --seed <n> --cap-usd <n> --cell-usd <n> [--reps <n>] [--only <task>]… [--variant <V>]… [--config <json>] [--dry-run]';
const RAW = join(TELOS_ROOT, 'bench', 'results', 'raw');

function parseArgs(argv) {
  const o = { only: [], variant: [], dryRun: false };
  const value = (i) => { if (i >= argv.length || argv[i].startsWith('--')) throw new UsageError(`${argv[i - 1]} needs a value\n${USAGE}`); return argv[i]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') o.manifest = value(++i);
    else if (a === '--out') o.out = value(++i);
    else if (a === '--seed') o.seed = value(++i);
    else if (a === '--reps') o.reps = Number(value(++i));
    else if (a === '--only') o.only.push(...value(++i).split(','));
    else if (a === '--variant') o.variant.push(...value(++i).split(','));
    else if (a === '--cap-usd') o.capUsd = Number(value(++i));
    else if (a === '--cell-usd') o.cellUsd = Number(value(++i));
    else if (a === '--config') o.config = value(++i);
    else if (a === '--dry-run') o.dryRun = true;
    else throw new UsageError(`unknown argument ${a}\n${USAGE}`);
  }
  for (const k of ['manifest', 'out', 'seed']) if (!o[k]) throw new UsageError(`--${k} is required\n${USAGE}`);
  if (!(o.capUsd > 0)) throw new UsageError('--cap-usd must be a positive number');
  if (!(o.cellUsd > 0) || o.cellUsd > o.capUsd) throw new UsageError('--cell-usd must be a positive number ≤ --cap-usd');
  if (o.reps !== undefined && !(Number.isInteger(o.reps) && o.reps > 0)) throw new UsageError('--reps must be a positive integer');
  const out = canonical(resolve(o.out));
  if (within(out, canonical(TELOS_ROOT)) && !within(out, canonical(RAW))) throw new UsageError(`--out ${o.out}: raw results stay outside the repository (or in bench/results/raw/)`);
  o.out = out;
  if (!o.dryRun && !o.config) throw new UsageError(`--config <json> is required for a real run (launcher, model, permissionMode, workDir)\n${USAGE}`);
  return o;
}

/** Config file: `{ launcher[], claude[], model, permissionMode, workDir, configTemplate, setupUsd, sessionTimeoutMs, runTimeoutMs, killGraceMs }`. */
function loadConfig(path) {
  let c;
  try { c = JSON.parse(readFileSync(path, 'utf8')); } catch (err) { throw new UsageError(`--config ${path}: ${err.message}`); }
  for (const k of ['model', 'permissionMode', 'workDir']) if (!c[k]) throw new UsageError(`--config ${path}: ${k} is required`);
  if (!Array.isArray(c.launcher) || !c.launcher.length) throw new UsageError(`--config ${path}: launcher (argv prefix for the benchmark OS user, D-08) is required`);
  return { claude: ['claude'], setupUsd: 2, sessionTimeoutMs: 30 * 60_000, runTimeoutMs: 4 * 3600_000, ...c };
}

const prompts = (task, variant) => {
  const telos = variant === 'C' || variant === 'D';
  if (task.type === 'single') return telos ? `/telos:quick ${task.prompt}` : task.prompt;
  return telos ? `/telos:plan ${task.steps.join('\n\n')}` : task.steps.join('\n\n');
};

function dryRun(plan, manifest, config) {
  const lines = [];
  const cells = new Map(plan.cells.map((c) => [c.id, c]));
  for (const item of plan.queue) {
    if (item.kind === 'setup') { lines.push(`setup ${item.id}`); continue; }
    const cell = cells.get(item.id);
    const argv = [...baseArgv(cell.variant, { launcher: config?.launcher ?? ['<launcher>'], claude: config?.claude ?? ['claude'],
      model: config?.model ?? '<model>', permissionMode: config?.permissionMode ?? '<permission-mode>', pluginDir: '<work>/plugin' }),
    '--session-id', '<uuid>', '--max-budget-usd', '<left>', '-p', '--', JSON.stringify(prompts(manifest.tasks.find((t) => t.id === cell.task), cell.variant))];
    lines.push(`cell ${cell.id} ${argv.join(' ')}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Real dependencies: disposable copies, C/D snapshots (telos init + /telos:map), sessions under the launcher. */
function realDeps(manifest, config) {
  const { workDir } = config;
  const plugin = join(workDir, 'plugin');
  let exported = false;
  const ensurePlugin = () => { if (!exported) { exportPlugin(TELOS_ROOT, plugin); exported = true; } };
  const telosArgv = [...config.launcher, join(plugin, 'bin', 'telos')];
  const argvBase = (variant) => baseArgv(variant, { ...config, pluginDir: plugin });
  const built = new Set();
  const suitesFile = join(manifest.dir, 'suites.json');
  const suites = existsSync(suitesFile) ? JSON.parse(readFileSync(suitesFile, 'utf8')) : {};

  /** The `(repo, start)` dependency overlay, built on first use in its own opened copy (PROTOCOL §5.1 item 6). */
  function depsFor(task) {
    const recipe = suites[task.repo]?.setup;
    if (!recipe) return null;
    const cell = { id: `deps.${task.repo}.${task.start}`, task: task.id, variant: 'A' };
    const copy = join(workDir, 'copies', cell.id);
    const open = () => {
      reclaim([copy], config.launcher);
      prepareCopy(cell, manifest, { workDir });
      grantSession([copy], { workDir });
      return copy;
    };
    try { return ensureDeps(`${task.repo}.${task.start}`, recipe, { workDir, copy: open, launcher: config.launcher }); } finally { if (existsSync(copy)) revokeSession([copy]); }
  }

  async function build({ key, repo, start, profile, dir }) {
    const task = manifest.tasks.find((t) => t.repo === repo && t.start === start);
    const cell = { id: `setup.${key}`, task: task.id, variant: 'A' };
    reclaim([join(workDir, 'copies', cell.id), join(workDir, 'config', cell.id)], config.launcher);
    clearUserFiles(config.launcher);
    const copy = prepareCopy(cell, manifest, { workDir }).dir;
    const overlay = depsFor(task);
    if (overlay) applyDeps(overlay, copy);
    const { env } = sessionEnv({ id: cell.id, variant: 'C' }, { configTemplate: config.configTemplate, workDir });
    const session = [copy, env.CLAUDE_CONFIG_DIR];
    grantSession(session, { workDir, readOnly: [plugin] });
    let map;
    try {
      const init = spawnSync(telosArgv[0], [...telosArgv.slice(1), 'init', '--profile', profile], { cwd: copy, env, encoding: 'utf8' });
      if (init.status !== 0) throw new Error(`setup ${key}: telos init exit ${init.status}: ${init.stderr}`);
      map = await runSession({ prompt: '/telos:map', env, cwd: copy, argvBase: argvBase('C'), budgetUsd: config.setupUsd,
        timeoutMs: config.sessionTimeoutMs, killGraceMs: config.killGraceMs });
    } finally {
      handBack(session, config.launcher); // the host copies the untracked overlay below
      revokeSession([...session, plugin]);
    }
    if (map.exit !== 0) throw new Error(`setup ${key}: /telos:map exit ${map.exit}`);
    // the overlay is what init + map added: untracked `.telos/` and CLAUDE.md, ignored ones included (a repo may ignore
    // dotfiles: lazygit's `.*`); placeSnapshot refuses tracked paths, so init's tracked .gitignore edit is not carried
    const added = execFileSync('git', ['-C', copy, '-c', `safe.directory=${copy}`, 'ls-files', '--others', '-z', '--', '.telos', 'CLAUDE.md'],
      { encoding: 'utf8' }).split('\0').filter(Boolean);
    for (const p of added) { mkdirSync(dirname(join(dir, p)), { recursive: true }); cpSync(join(copy, p), join(dir, p)); }
    return { costUsd: map.attempts.reduce((s, a) => s + (a.costUsd ?? config.setupUsd), 0), sessionId: map.sessionId, usage: map.usage };
  }

  return {
    built,
    async prepare(cell) {
      let snapshot;
      let setupUsd = 0;
      if (cell.setup) {
        ensurePlugin();
        let record = null;
        const snap = await ensureSnapshot(cell.setup, { workDir, telosDir: TELOS_ROOT, build: async (a) => (record = await build(a)) });
        if (snap.rebuilt) setupUsd = record.costUsd;
        built.add(cell.setup);
        snapshot = snap.dir;
      }
      reclaim([join(workDir, 'copies', cell.id), join(workDir, 'config', cell.id)], config.launcher); // left by an interrupted attempt
      clearUserFiles(config.launcher);
      const copy = prepareCopy(cell, manifest, { workDir, snapshot });
      const overlay = depsFor(manifest.tasks.find((t) => t.id === cell.task));
      if (overlay) applyDeps(overlay, copy.dir);
      const { env, readable } = sessionEnv(cell, { configTemplate: config.configTemplate, workDir });
      const session = [copy.dir, env.CLAUDE_CONFIG_DIR];
      const readOnly = cell.setup ? [plugin] : [];
      grantSession(session, { workDir, readOnly });
      return { dir: copy.dir, start: copy.start, env, readable, setupUsd, session, readOnly };
    },
    release(cell, ws) {
      handBack(ws.session, config.launcher); // grading also ran as the benchmark user
      revokeSession([...ws.session, ...ws.readOnly]);
    },
    async runTrajectory(cell, ctx) {
      try {
        return await runTrajectory({ id: cell.id, variant: cell.variant, task: ctx.task }, { cwd: ctx.cwd, env: ctx.env, argvBase: argvBase(cell.variant),
          telos: telosArgv, cellBudgetUsd: ctx.cellBudgetUsd, sessionTimeoutMs: config.sessionTimeoutMs, runTimeoutMs: config.runTimeoutMs,
          killGraceMs: config.killGraceMs });
      } finally { handBack([ctx.cwd, ctx.env.CLAUDE_CONFIG_DIR], config.launcher); } // transcripts and patch are read by the host
    },
    versions() {
      const host = spawnSync(config.launcher[0], [...config.launcher.slice(1), ...config.claude, '--version'], { encoding: 'utf8' });
      const telos = spawnSync('git', ['-C', TELOS_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
      return { claude: host.stdout?.trim() || null, telos: telos.stdout?.trim() || null, node: process.version, model: config.model };
    },
  };
}

/** CLI entry: parse flags, print the dry-run queue or run the matrix → exit code (0 ran all, 1 skipped/refused/stopped). */
export async function main(argv, { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  const o = parseArgs(argv);
  const manifest = loadManifest(resolve(o.manifest));
  const config = o.config ? loadConfig(o.config) : null;
  const recDir = join(o.out, 'records');
  const done = existsSync(recDir) ? readdirSync(recDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
  const plan = expandMatrix(manifest, { seed: o.seed, reps: o.reps, only: o.only.length ? o.only : undefined,
    variant: o.variant.length ? o.variant : undefined, done });
  if (o.dryRun) { out(dryRun(plan, manifest, config)); return 0; }

  mkdirSync(config.workDir, { recursive: true });
  const unlock = lockWorkDir(config.workDir);
  process.once('exit', unlock);
  const deps = realDeps(manifest, config);
  const snapshots = join(config.workDir, 'snapshots');
  // a block reserves the setup estimate for every snapshot it still needs (§7.3)
  const reservation = (cell) => o.cellUsd + (cell.setup && !deps.built.has(cell.setup) && !existsSync(join(snapshots, `${cell.setup}.json`)) ? config.setupUsd : 0);
  const res = await runMatrix(plan.cells, manifest, { outDir: o.out, gradeRoot: join(config.workDir, 'grading'), capUsd: o.capUsd, reservation, deps,
    graderArgv: [...config.launcher, config.node ?? 'node'] });
  out(`${JSON.stringify({ records: res.records.length, accepted: res.records.filter((r) => r.accepted).length, skipped: res.skipped,
    spentUsd: res.spentUsd, stopped: res.stopped ?? null }, null, 2)}\n`);
  if (res.stopped) err(`stopped: ${res.stopped}\n`);
  return res.skipped.length || res.stopped || res.records.some((r) => r.status === 'refused') ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = e instanceof UsageError ? 2 : 1;
  });
}
