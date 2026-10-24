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
