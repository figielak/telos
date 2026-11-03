#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { UsageError } from '../lib/errors.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { ensureMirrors, guardWorkDir, prepareCopy } from './lib/workspace.mjs';

// Acceptance calibration (bench/PROTOCOL.md §4.2). An acceptance script runs with the work tree as cwd and exits
// 0 = accepted, 1 = behavioural check fails, 2 = regression check fails. Per task it must exit 1 at the start commit
// (regression passing), 0 at the reference (start tree + the task commit's own diff, §3.5), and 0 on every
// alternative implementation (`<acceptance dir>/<script name>.alt/*.patch`, applied to the start). Copies are set up
// with the `suites.json` recipe of their repository (with network) unless `--no-setup`; `suites.json` `_pathPrepend`
// lists toolchain directories (go) put in front of PATH for setup and grading.

const GRADE_MS = 10 * 60 * 1000;
const USAGE = 'usage: node bench/calibrate.mjs --manifest <dir> [--task <id>]… [--work <dir>] [--no-setup]';

const git = (dir, args, input) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', input, maxBuffer: 256 << 20, stdio: ['pipe', 'pipe', 'pipe'] });

/** `PATH` with the toolchain directories of `suites.json` (`_pathPrepend`, `~/` allowed) in front. */
const withToolchain = (dirs = []) => [...dirs.map((d) => d.replace(/^~(?=\/)/, homedir())), process.env.PATH ?? ''].filter(Boolean).join(':');

/** Run the acceptance script on a copy the way the grader does: from a temporary place outside the copy. */
function grade(script, dir, path = process.env.PATH) {
  const tmp = mkdtempSync(join(tmpdir(), 'telos-bench-grade-'));
  try {
    const copy = join(tmp, basename(script));
    copyFileSync(script, copy);
    const r = spawnSync(process.execPath, [copy], { cwd: dir, encoding: 'utf8', timeout: GRADE_MS, maxBuffer: 64 << 20,
      env: { ...process.env, PATH: path, CI: '1' } });
    return { exit: r.status ?? -1, tail: `${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-2000) };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** `*.patch` files of the task's alternative implementations, sorted by name. */
function alternativesOf(manifest, task) {
  const script = join(manifest.dir, task.acceptance);
  const dir = join(dirname(script), `${basename(script).replace(/\.[^.]+$/, '')}.alt`);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.patch')).sort().map((f) => ({ name: f.slice(0, -'.patch'.length), file: join(dir, f) }));
}

function apply(dir, patch) {
  git(dir, ['apply', '--whitespace=nowarn', '-'], patch);
}

/**
 * Calibrate `manifest` tasks (all, or `only`) in disposable copies under `workDir` → `{ rows, ok }`.
 * `setup(dir, repo)` prepares a copy (dependencies) before grading; `path` is the PATH the acceptance scripts run with. A row: `{ task, repo, atStart, atReference,
 * alternatives: [{ name, exit }], verdict, detail? }`; verdict `OK` or `invalid: <reason>`, `detail` the output tail of the failing run.
 */
export function calibrate(manifest, { workDir, only = [], setup = () => {}, path = process.env.PATH } = {}) {
  for (const id of only) if (!manifest.tasks.some((t) => t.id === id)) throw new UsageError(`unknown task ${id}`);
  const root = guardWorkDir(workDir, manifest.repos.map((r) => r.url));
  mkdirSync(root, { recursive: true });
  const local = ensureMirrors(manifest, root);
  const rows = [];
  for (const task of manifest.tasks.filter((t) => !only.length || only.includes(t.id))) {
    const repo = manifest.repos.find((r) => r.id === task.repo);
    const script = join(manifest.dir, task.acceptance);
    const row = { task: task.id, repo: task.repo, atStart: null, atReference: null, alternatives: [], verdict: 'OK' };
    rows.push(row);
    const copy = (suffix) => {
      const made = prepareCopy({ id: `${task.id}-${suffix}`, task: task.id, variant: 'A' }, local, { workDir: root });
      setup(made.dir, repo);
      return made.dir;
    };

    const start = copy('start');
    const atStart = grade(script, start, path);
    row.atStart = atStart.exit;
    row.detail = atStart.tail;
    if (row.atStart === 2) { row.verdict = 'invalid: regression fails at start'; continue; }
    if (row.atStart === 0) { row.verdict = 'invalid: passes at start'; continue; }
    if (row.atStart !== 1) { row.verdict = `invalid: acceptance error at start (exit ${row.atStart})`; continue; }

    const bare = local.repos.find((r) => r.id === task.repo).url;
    const diff = git(bare, ['diff', '--binary', `${task.reference}^1`, task.reference]);
    const ref = copy('reference');
    try { apply(ref, diff); } catch { row.verdict = 'invalid: reference does not apply to the start'; continue; }
    const atReference = grade(script, ref, path);
    row.atReference = atReference.exit;
    row.detail = atReference.tail;
    if (row.atReference !== 0) { row.verdict = 'invalid: fails at reference'; continue; }

    for (const alt of alternativesOf(manifest, task)) {
      const dir = copy(`alt-${alt.name}`);
      let exit;
      try {
        apply(dir, readFileSync(alt.file, 'utf8'));
        const graded = grade(script, dir, path);
        exit = graded.exit;
        if (exit !== 0) row.detail = graded.tail;
      } catch (err) { exit = -1; row.detail = String(err.message ?? err); }
      row.alternatives.push({ name: alt.name, exit });
    }
    const failed = row.alternatives.find((a) => a.exit !== 0);
    if (failed) row.verdict = `invalid: alternative ${failed.name} fails`;
    if (row.verdict === 'OK') delete row.detail;
  }
  return { rows, ok: rows.every((r) => r.verdict === 'OK') };
}

/** Markdown table: exit codes at start and reference, passing/total alternatives, verdict. */
export function formatTable(rows) {
  const head = ['task', 'repo', 'start', 'reference', 'alternatives', 'verdict'];
  const body = rows.map((r) => [r.task, r.repo, String(r.atStart ?? '-'), String(r.atReference ?? '-'),
    `${r.alternatives.filter((a) => a.exit === 0).length}/${r.alternatives.length}`, r.verdict]);
  const width = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => `| ${cells.map((c, i) => c.padEnd(width[i])).join(' | ')} |`;
  return [line(head), `| ${width.map((w) => '-'.repeat(w)).join(' | ')} |`, ...body.map(line)].join('\n');
}

/** Run a suites.json setup recipe (with network) in a copy; the host caches live under the copy's parent. */
function recipeSetup(suites, path) {
  return (dir, repo) => {
    const recipe = suites[repo.id]?.setup;
    if (!recipe) return;
    const home = join(dirname(dir), 'home');
    mkdirSync(home, { recursive: true });
    const r = spawnSync('bash', ['-c', recipe], { cwd: dir, encoding: 'utf8', timeout: 15 * 60 * 1000,
      env: { ...process.env, PATH: path, CI: '1', GOTOOLCHAIN: 'local', GOPATH: join(home, 'gopath'), GOCACHE: join(home, 'gocache') } });
    if (r.status !== 0) throw new Error(`setup for ${repo.id} failed: ${(r.stderr ?? '').slice(-400)}`);
  };
}

function parseArgs(argv) {
  const o = { manifest: null, only: [], work: null, setup: true };
  const value = (i) => { if (i >= argv.length || argv[i].startsWith('--')) throw new UsageError(`${argv[i - 1]} needs a value\n${USAGE}`); return argv[i]; };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--manifest') o.manifest = value(++i);
    else if (argv[i] === '--task') o.only.push(value(++i));
    else if (argv[i] === '--work') o.work = value(++i);
    else if (argv[i] === '--no-setup') o.setup = false;
    else throw new UsageError(`unknown argument ${argv[i]}\n${USAGE}`);
  }
  if (!o.manifest) throw new UsageError(USAGE);
  return o;
}

export function main(argv, { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  const o = parseArgs(argv);
  const manifest = loadManifest(resolve(o.manifest));
  // default outside /tmp (copies with installed dependencies are large); the repository mirrors are reused
  const workDir = o.work ?? join(homedir(), '.cache', 'telos-bench', 'calibrate');
  const file = join(manifest.dir, 'suites.json');
  const suites = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const path = withToolchain(suites._pathPrepend);
  const result = calibrate(manifest, { workDir, only: o.only, path, setup: o.setup ? recipeSetup(suites, path) : undefined });
  out(`${formatTable(result.rows)}\n`);
  for (const r of result.rows.filter((x) => x.verdict !== 'OK')) err(`invalid: ${r.task} — ${r.verdict}\n${r.detail ?? ''}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = e instanceof UsageError ? 2 : 1;
  }
}
