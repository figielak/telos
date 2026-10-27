import { execFileSync } from 'node:child_process';

// Read-only git helpers (02:D-04): the CLI never writes to git; skills commit and tag.

/** @returns {string | null} stdout, null when git fails (no repo, no HEAD, unknown ref) */
function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
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

const STAT_LINES = 12;

/**
 * Commits of a task after `since` for `undo`, newest first. `revert(<id>):` commits are the
 * undo itself, so they are reported apart and never as task commits.
 * @param {string} root
 * @param {string} id task id `NN-MM`
 * @param {string} since ref to start after (the phase tag)
 * @returns {{ commits: { hash: string, subject: string, parents: number, stat: string[] }[],
 *   reverts: string[] } | null} null when git fails
 */
export function taskCommits(root, id, since) {
  const out = git(root, ['log', '--format=%H%x1f%P%x1f%s', `${since}..HEAD`]);
  if (out === null) return null;
  const scope = new RegExp(`^([a-z]+)\\(${id}\\)!?:`);
  const commits = [];
  const reverts = [];
  for (const line of out.split('\n').filter(Boolean)) {
    const [hash, parents, subject] = line.split('\x1f');
    const type = scope.exec(subject)?.[1];
    if (type === 'revert') { reverts.push(hash); continue; }
    if (!type) continue;
    const stat = (git(root, ['show', '--stat=100', '--format=', hash]) ?? '').split('\n').filter((l) => l.trim());
    const shown = stat.length > STAT_LINES ? [...stat.slice(0, STAT_LINES - 1), `… ${stat.length - STAT_LINES} more`, stat.at(-1)] : stat;
    commits.push({ hash, subject, parents: parents.split(' ').filter(Boolean).length, stat: shown.map((l) => l.trim()) });
  }
  return { commits, reverts };
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

/** Pinned phase baseline, HEAD and exact scoped commits, or null on unavailable git evidence. */
export function reviewHistory(root, tag, id) {
  const baseline = git(root, ['rev-parse', '--verify', `${tag}^{commit}`])?.trim();
  const head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])?.trim();
  if (!baseline || !head) return null;
  const unreachable = git(root, ['log', '-1', '--format=%H', baseline, '--not', head, '--']);
  if (unreachable === null || unreachable.trim()) return null;
  const out = git(root, ['log', '-z', '--format=%H%x00%P%x00%s', `${baseline}..${head}`, '--']);
  if (out === null) return null;
  const fields = out.split('\0');
  const scope = id ? new RegExp(`^[a-z]+\\(${id}\\)!?:`) : null;
  const commits = [];
  for (let i = 0; i + 2 < fields.length; i += 3) {
    const [hash, parents, subject] = fields.slice(i, i + 3);
    if (!scope || scope.test(subject)) commits.push({ hash, parents: parents.split(' ').filter(Boolean) });
  }
  return { baseline, head, commits };
}

const REVIEW_DIFF = ['--no-ext-diff', '--no-textconv', '--no-color', '--no-relative', '--ignore-submodules=none', '--submodule=short', '-M'];

/** A literal, read-only diff argv, also usable as the exact review continuation. */
export function reviewDiffArgs(revisions, paths) {
  return ['--literal-pathspecs', 'diff', ...REVIEW_DIFF, '--binary', ...revisions, '--', ...paths];
}

/** Selected changes and binary-safe patch, preserving both rename paths and git failures. */
export function reviewDiff(root, revisions, select = () => true) {
  const raw = git(root, ['diff', ...REVIEW_DIFF, '--raw', '-z', '--abbrev=64', ...revisions, '--']);
  if (raw === null) return null;
  const fields = raw.split('\0');
  const changes = [];
  for (let i = 0; i < fields.length - 1;) {
    const match = /^:(\d{6}) (\d{6}) ([a-f0-9]+) ([a-f0-9]+) ([A-Z]\d*)$/.exec(fields[i++]);
    if (!match) return null;
    const [, oldMode, mode, oldBlob, blob, status] = match;
    const first = fields[i++];
    const paired = /^[RC]/.test(status);
    const path = paired ? fields[i++] : first;
    if (!first || !path) return null;
    const change = { status, path, ...(paired ? { oldPath: first } : {}), oldMode, mode, oldBlob, blob };
    if (select(change)) changes.push(change);
  }
  if (!changes.length) return { changes: [], text: '', args: [] };
  const paths = [...new Set(changes.flatMap((c) => c.oldPath ? [c.oldPath, c.path] : [c.path]))];
  const args = reviewDiffArgs(revisions, paths);
  const text = git(root, args);
  const nums = git(root, ['--literal-pathspecs', 'diff', ...REVIEW_DIFF, '--numstat', '-z', ...revisions, '--', ...paths]);
  if (text === null || nums === null) return null;
  const binary = new Set();
  const counts = nums.split('\0');
  for (let i = 0; i < counts.length - 1;) {
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(counts[i++]);
    if (!match) return null;
    let path = match[3];
    if (!path) { i++; path = counts[i++]; }
    if (!path) return null;
    if (match[1] === '-') binary.add(path);
  }
  for (const c of changes) {
    c.kind = binary.has(c.path) ? 'binary' : c.status[0] === 'U' ? 'conflict'
      : [c.mode, c.oldMode].includes('160000') ? 'submodule'
        : ({ R: 'renamed', C: 'copied', D: 'deleted', A: 'added', T: 'type-changed' }[c.status[0]] ?? 'modified');
  }
  return { changes, text, args };
}

/** Untracked paths without refreshing the index; null means unavailable, never an empty success. */
export function reviewUntracked(root) {
  const out = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (out === null) return null;
  const fields = out.split('\0');
  const paths = [];
  for (let i = 0; i < fields.length - 1; i++) {
    const entry = fields[i];
    if (entry.startsWith('?? ')) paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) i++;
  }
  return paths;
}
