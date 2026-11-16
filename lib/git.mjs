import { execFileSync } from 'node:child_process';

// Read-only git helpers (02:D-04): the CLI never writes to git; skills commit and tag.
// Every call is bounded: output ≤ 64 MiB, run time ≤ GIT_TIMEOUT ms; over either it fails (null).

export const GIT_TIMEOUT = 10_000;

/** @returns {string | null} stdout, null when git fails (no repo, no HEAD, unknown ref, limits) */
function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20,
      timeout: GIT_TIMEOUT, killSignal: 'SIGKILL', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  } catch {
    return null;
  }
}

/** @returns {boolean} true inside a git work tree (a bare `.git` directory is not enough) */
export function isRepo(root) {
  return git(root, ['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';
}

/**
 * Changed paths of the work tree and index: modified, added, deleted, renamed (both the new and
 * the old path, since the old one is gone) and untracked files (also inside new directories);
 * ignored files are left out.
 * @returns {string[]} repo-relative paths
 */
export function porcelainFiles(root) {
  const out = git(root, ['status', '--porcelain', '-z', '--untracked-files=all']) ?? '';
  const fields = out.split('\0');
  const files = [];
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i];
    if (entry.length < 4) continue;
    files.push(entry.slice(3));
    if (!/[RC]/.test(entry.slice(0, 2))) continue;
    const source = fields[++i]; // -z puts the rename or copy source in the next field
    if (source && entry.slice(0, 2).includes('R')) files.push(source); // a copy leaves its source unchanged
  }
  return files;
}

/** @returns {boolean} whether `ref` (branch, tag, hash) resolves to a commit */
export function refExists(root, ref) {
  return git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !== null;
}

/**
 * Paths changed between a commit and HEAD, renames split into deletion and addition so both
 * sides show; NUL-delimited, so any file name survives.
 * @param {string} hash full commit hash
 * @returns {string[] | null} repo-relative paths, sorted; null when git fails
 */
export function changedSince(root, hash) {
  if (typeof hash !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(hash)) return null;
  const out = git(root, ['diff', '--name-only', '-z', '--no-renames', `${hash}..HEAD`, '--']);
  if (out === null) return null;
  return out.split('\0').filter(Boolean).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Full HEAD and explicit availability notes; never fabricate an unborn commit. */
export function headMetadata(root) {
  if (!isRepo(root)) return { head: null, warnings: ['No git work tree; HEAD and history unavailable.'] };
  const head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])?.trim() ?? null;
  return { head, warnings: head ? [] : ['No HEAD commit; history unavailable (unborn repository).'] };
}

/** Recent path counts, once per commit, at most the last 100 commits. Null means git failed. */
export function recentPathCounts(root) {
  const out = git(root, ['log', '-100', '--format=%x00', '--name-only', '-z', '--no-renames', 'HEAD', '--']);
  if (out === null) return refExists(root, 'HEAD') ? null : [];
  const counts = new Map();
  let seen = new Set();
  for (const field of out.split('\0')) {
    if (!field) { seen = new Set(); continue; }
    // Git separates the first path of each commit from the format with a newline.
    const path = field.startsWith('\n') ? field.slice(1) : field;
    if (!path || seen.has(path)) continue;
    seen.add(path);
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return [...counts].map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Committed baseline..HEAD diff; preserve NUL-delimited rename/copy paths and failures. */
export function diffNameStatus(root, hash) {
  const fail = (error) => ({ changes: [], error });
  if (typeof hash !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(hash)) {
    return fail('Invalid baseline hash: expected a full hexadecimal commit hash.');
  }
  const out = git(root, ['diff', '--name-status', '-z', '-M', `${hash}..HEAD`, '--']);
  if (out === null) return fail(`git diff failed for baseline ${hash}; no change plan is available.`);
  if (!out) return { changes: [], error: null };
  if (!out.endsWith('\0')) return fail('Malformed git diff: truncated NUL-delimited output.');
  const fields = out.slice(0, -1).split('\0');
  const changes = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i++];
    const paired = /^[RC]\d{1,3}$/.test(status) && Number(status.slice(1)) <= 100;
    if (!paired && !/^[AMDTUXB]$/.test(status)) return fail(`Malformed git diff: unsupported status ${JSON.stringify(status)}.`);
    const first = fields[i++];
    const path = paired ? fields[i++] : first;
    if (!first || !path) return fail(`Malformed git diff: missing path for ${status}.`);
    changes.push({ status, path, ...(paired ? { oldPath: first } : {}) });
  }
  return { changes, error: null };
}
