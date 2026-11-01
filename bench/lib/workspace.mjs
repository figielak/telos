import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync,
  rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UsageError } from '../../lib/errors.mjs';

// Disposable copies and setup snapshots (bench/PROTOCOL.md §5.1, §6.1). Everything a session may see
// is built here; argv arrays only, never a shell. Original repositories are only ever cloned from.

/** This checkout (holds bench/, test/ and .telos/); no work dir may live inside it. */
export const TELOS_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BRANCH = 'bench';
const KEY = /^([a-z0-9][a-z0-9-]*)\.([a-f0-9]{40})\.(deep|standard)$/;
const NATIVE = new Set(['CLAUDE.md', 'CLAUDE.local.md']);

/** A refusal (`REFUSED: <reason>`): the workspace would leak, mix instructions or escape its root. */
export class WorkspaceError extends Error {}
const refuse = (reason) => { throw new WorkspaceError(`REFUSED: ${reason}`); };

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 << 20,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' } });
}
const gitOk = (cwd, args) => { try { git(cwd, args); return true; } catch { return false; } };

/** Absolute path with symlinks resolved as far as the path exists. */
export function canonical(path) {
  const abs = resolve(path);
  let head = abs;
  const tail = [];
  while (!existsSync(head)) {
    tail.unshift(basename(head));
    const up = dirname(head);
    if (up === head) break;
    head = up;
  }
  return join(realpathSync(head), ...tail);
}

/** True when `path` equals `root` or lies below it. */
export function within(path, root) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/** Work dirs live outside this checkout and outside every local source repository (exit 2 otherwise). */
export function guardWorkDir(workDir, sources = []) {
  if (typeof workDir !== 'string' || !workDir) throw new UsageError('workDir is required');
  const dir = canonical(workDir);
  const home = canonical(TELOS_ROOT);
  if (within(dir, home) || within(home, dir)) throw new UsageError(`work dir ${workDir} overlaps the Telos checkout; use a directory outside it`);
  for (const source of sources) {
    if (!existsSync(source)) continue;
    const src = canonical(source);
    if (within(dir, src) || within(src, dir)) throw new UsageError(`work dir ${workDir} overlaps source repository ${source}`);
  }
  return dir;
}

/** Refuse any symlink under `root` (outside `.git`) whose target resolves outside `root`. */
export function checkSymlinks(root, label) {
  const top = canonical(root);
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (full === join(top, '.git')) continue;
      if (entry.isSymbolicLink()) {
        const rel = relative(top, full);
        const target = resolve(dirname(full), readlinkSync(full));
        const real = existsSync(full) ? realpathSync(full) : target;
        if (!within(target, top) || !within(real, top)) refuse(`symlink ${rel} in the ${label} points outside it (${readlinkSync(full)})`);
      } else if (entry.isDirectory()) walk(full);
    }
  };
  walk(top);
}

function nativeInstructions(dir, start) {
  const paths = git(dir, ['ls-tree', '-r', '-z', '--name-only', start]).split('\0').filter(Boolean);
  return paths.find((p) => NATIVE.has(basename(p)) || p.split('/').includes('.claude'));
}

/** Strip the clone to one branch at `start`: no remotes, other refs, tags, reflog or unreachable objects. */
function stripHistory(dir, start) {
  git(dir, ['checkout', '-q', '-B', BRANCH, start]);
  for (const remote of git(dir, ['remote']).split('\n').filter(Boolean)) git(dir, ['remote', 'remove', remote]);
  for (const ref of git(dir, ['for-each-ref', '--format=%(refname)']).split('\n').filter(Boolean)) {
    if (ref !== `refs/heads/${BRANCH}`) git(dir, ['update-ref', '-d', ref]);
  }
  git(dir, ['reflog', 'expire', '--expire=now', '--all']);
  git(dir, ['gc', '-q', '--prune=now']);
}

function leakCheck(dir, task) {
  const refs = git(dir, ['for-each-ref', '--format=%(refname)']).split('\n').filter(Boolean);
  if (refs.length !== 1 || refs[0] !== `refs/heads/${BRANCH}`) refuse(`copy has extra refs (${refs.join(', ')})`);
  if (git(dir, ['remote']).trim()) refuse('copy still has a remote');
  if (git(dir, ['rev-parse', 'HEAD']).trim() !== task.start) refuse(`copy HEAD is not start ${task.start}`);
  if (gitOk(dir, ['cat-file', '-e', `${task.reference}^{commit}`])) {
    refuse(`reference commit ${task.reference} of task ${task.id} is reachable from start (solution leak); pick a start before the reference`);
  }
  const all = git(dir, ['rev-list', '--all', '--reflog']).split('\n').filter(Boolean);
  const ancestry = new Set(git(dir, ['rev-list', task.start]).split('\n').filter(Boolean));
  if (all.some((c) => !ancestry.has(c))) refuse('copy holds commits that are not ancestors of start');
}

function placeB(dir, task, manifest) {
  const expected = `${task.repo}/${task.start}/CLAUDE.md`;
  if (task.b !== expected) refuse(`B file for (${task.repo}, ${task.start}) must be ${expected}, task ${task.id} names ${task.b}`);
  const file = join(manifest.dir, expected);
  if (!existsSync(file) || !lstatSync(file).isFile()) refuse(`missing B file ${expected} for (${task.repo}, ${task.start}); write it before running B`);
  copyFileSync(file, join(dir, 'CLAUDE.md'));
}

function placeSnapshot(dir, cell, snapshot) {
  if (!snapshot) refuse(`${cell.variant} cell ${cell.id} needs its setup snapshot ${cell.setup}; run ensureSnapshot first`);
  let meta;
  try { meta = JSON.parse(readFileSync(`${snapshot}.json`, 'utf8')); } catch { refuse(`setup snapshot ${snapshot} has no readable metadata`); }
  if (meta.key !== cell.setup) refuse(`setup snapshot ${meta.key} does not match cell ${cell.id} (needs ${cell.setup})`);
  let profile;
  try { profile = JSON.parse(readFileSync(join(snapshot, '.telos/config.json'), 'utf8')).profile; } catch { /* checked below */ }
  if (profile !== KEY.exec(cell.setup)[3]) refuse(`setup snapshot ${meta.key} has profile ${profile}, expected ${KEY.exec(cell.setup)[3]}`);
  const tracked = new Set(git(dir, ['ls-files', '-z']).split('\0').filter(Boolean));
  const walk = (from) => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const rel = relative(snapshot, join(from, entry.name));
      if (entry.name === '.git') refuse(`setup snapshot ${meta.key} contains ${rel}; it may only add files`);
      if (tracked.has(rel.split(sep).join('/'))) refuse(`setup snapshot ${meta.key} would overwrite tracked ${rel}`);
      if (entry.isDirectory()) walk(join(from, entry.name));
    }
  };
  walk(snapshot);
  cpSync(snapshot, dir, { recursive: true, verbatimSymlinks: true });
}

/**
 * Disposable copy of the cell's repository at its task's start commit (PROTOCOL §5.1 items 2, 4) with the
 * variant's instructions: A none, B its `(repo, start)` file, C/D the overlay of `snapshot` (from ensureSnapshot).
 * @returns {{dir: string, start: string, refsChecked: true}}
 */
export function prepareCopy(cell, manifest, { workDir, snapshot } = {}) {
  const task = manifest.tasks.find((t) => t.id === cell.task);
  if (!task) refuse(`unknown task ${cell.task} for cell ${cell.id}`);
  const repo = manifest.repos.find((r) => r.id === task.repo);
  if (!repo) refuse(`unknown repo ${task.repo} for task ${task.id}`);
  const root = guardWorkDir(workDir, [repo.url]);
  const dir = join(root, 'copies', cell.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  git(root, ['clone', '-q', '--no-local', '--no-checkout', '--', repo.url, dir]);
  if (!gitOk(dir, ['cat-file', '-e', `${task.start}^{commit}`])) refuse(`start ${task.start} is not a commit of ${task.repo}`);
  const native = nativeInstructions(dir, task.start);
  if (native) refuse(`start ${task.start} of ${task.repo} ships native instructions (${native}); exclude this commit`);
  stripHistory(dir, task.start);
  leakCheck(dir, task);
  if (cell.variant === 'B') placeB(dir, task, manifest);
  else if (cell.variant === 'C' || cell.variant === 'D') placeSnapshot(dir, cell, snapshot);
  else if (cell.variant !== 'A') refuse(`unknown variant ${cell.variant}`);
  checkSymlinks(dir, 'copy');
  return { dir, start: task.start, refsChecked: true };
}

const sha = (value) => createHash('sha256').update(value).digest('hex');

/** Content hash of a setup: start commit, profile, Telos commit and the current map skill files. */
export function snapshotHash(start, profile, telosDir) {
  const commit = git(telosDir, ['rev-parse', 'HEAD']).trim();
  const files = git(telosDir, ['ls-files', '-z']).split('\0').filter(Boolean)
    .filter((p) => p.split('/').some((s) => /^map([-.]|$)/.test(s)))
    .sort()
    .map((p) => [p, existsSync(join(telosDir, p)) ? sha(readFileSync(join(telosDir, p))) : 'missing']);
  return sha(JSON.stringify({ start, profile, commit, files }));
}

/**
 * The C/D setup snapshot for `key` (`<repo>.<start>.<profile>`, PROTOCOL §6.1), reused while its hash is
 * current; otherwise the old one is removed and `build({ key, repo, start, profile, dir, telosDir })`
 * fills a fresh dir with the files init + map leave behind. A thrown or rejected build leaves no snapshot.
 * Its return value is kept as `record` in the metadata. Returns a promise only when `build` does.
 * @returns {{dir: string, hash: string, rebuilt: boolean}}
 */
export function ensureSnapshot(key, { workDir, telosDir, build } = {}) {
  const match = KEY.exec(key ?? '');
  if (!match) throw new UsageError(`invalid setup key ${key}; expected <repo>.<40-hex start>.<deep|standard>`);
  const root = join(guardWorkDir(workDir), 'snapshots');
  if (typeof build !== 'function') throw new UsageError('ensureSnapshot needs a build function');
  const [, repo, start, profile] = match;
  const hash = snapshotHash(start, profile, telosDir);
  const dir = join(root, key);
  const metaPath = `${dir}.json`;
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (meta.key === key && meta.hash === hash && existsSync(dir)) return { dir, hash, rebuilt: false };
  } catch { /* missing or unreadable metadata → rebuild */ }
  rmSync(dir, { recursive: true, force: true });
  rmSync(metaPath, { force: true });
  const tmp = join(root, `.${key}.tmp-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const discard = (err) => { rmSync(tmp, { recursive: true, force: true }); throw err; };
  const finish = (record) => {
    checkSymlinks(tmp, 'setup snapshot');
    renameSync(tmp, dir);
    writeFileSync(`${metaPath}.tmp`, `${JSON.stringify({ key, hash, record: record ?? null }, null, 2)}\n`);
    renameSync(`${metaPath}.tmp`, metaPath);
    return { dir, hash, rebuilt: true };
  };
  let result;
  try { result = build({ key, repo, start, profile, dir: tmp, telosDir }); } catch (err) { discard(err); }
  if (result && typeof result.then === 'function') return result.then((r) => { try { return finish(r); } catch (err) { return discard(err); } }, discard);
  try { return finish(result); } catch (err) { return discard(err); }
}
