import { execFileSync } from 'node:child_process';

// Read-only git helpers (02:D-04): the CLI never writes to git; skills commit and tag.

/** @returns {string | null} stdout, null when git fails (no repo, no HEAD, unknown ref) */
function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}

/** @returns {boolean} true inside a git work tree (a bare `.git` directory is not enough) */
export function isRepo(root) {
  return git(root, ['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';
}

/**
 * Changed paths of the work tree and index: modified, added, deleted, renamed (new path) and
 * untracked files (also inside new directories); ignored files are left out.
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
    if (/[RC]/.test(entry.slice(0, 2))) i++; // -z puts the rename source in the next field
  }
  return files;
}

/**
 * Files touched by commits whose subject has the task scope, e.g. `feat(02-04): …`.
 * @param {string} root
 * @param {string} id task id `NN-MM`
 * @param {string} [since] ref to start after (the phase tag); whole history when omitted
 * @returns {string[]} unique repo-relative paths
 */
export function taskCommitFiles(root, id, since) {
  const range = since ? [`${since}..HEAD`] : ['HEAD'];
  const subjects = git(root, ['log', '--format=%H %s', ...range]) ?? '';
  const scope = new RegExp(`^[a-z]+\\(${id}\\)!?:`);
  const hashes = subjects.split('\n').filter(Boolean)
    .map((line) => [line.slice(0, line.indexOf(' ')), line.slice(line.indexOf(' ') + 1)])
    .filter(([, subject]) => scope.test(subject)).map(([hash]) => hash);
  const files = new Set();
  for (const hash of hashes) {
    const names = git(root, ['show', '--format=', '--name-only', '-z', hash]) ?? '';
    for (const name of names.split('\0')) if (name.trim()) files.add(name.trim());
  }
  return [...files];
}

/** @returns {boolean} whether `ref` (branch, tag, hash) resolves to a commit */
export function refExists(root, ref) {
  return git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !== null;
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
