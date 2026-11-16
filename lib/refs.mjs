import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

import { visibleMarkdown } from './map.mjs';

// Backticked file references (`path`, `dir/`, `path:12`, `path:3-9`), shared by the MAP check
// (every backticked span must be one) and the area check (12:D-02; only path-like spans count).

/**
 * Parse one reference.
 * @param {string} raw text between the backticks
 * @returns {{ path: string, directory: boolean, start?: number, end?: number } | null} null when
 *   it is not a repo-relative path with an optional positive :start-end range
 */
export function parseReference(raw) {
  let path = raw, start, end;
  const range = /:(\d+)(?:-(\d+))?$/.exec(path);
  if (range) {
    path = path.slice(0, range.index);
    start = Number(range[1]);
    end = Number(range[2] ?? range[1]);
  }
  const directory = path.endsWith('/');
  const normalized = posix.normalize(path);
  const invalid = !path.trim() || path !== path.trim() || /[\\:\x00-\x1f\x7f`]/.test(path)
    || posix.isAbsolute(path) || normalized === '.' || normalized === '..' || normalized.startsWith('../')
    || (range && (directory || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start));
  return invalid ? null : { path: normalized, directory, ...(range ? { start, end } : {}) };
}

// A span is a path when it has only file-name characters and either a `/`, or a line range after
// a name with an extension (`cli.mjs:4`; `localhost:3000` and `16:9` are prose).
const PATH_LIKE = /^[\w.@+-][\w.@+/-]*(?::\d+(?:-\d+)?)?$/;
const FILE_WITH_RANGE = /\.[A-Za-z]\w*:\d/;

/**
 * Path-like backticked references in visible markdown (comments and fences skipped); prose such as
 * `telos area for` or `limits.map_tokens` is not a reference.
 * @returns {{ raw: string, ref: NonNullable<ReturnType<typeof parseReference>> }[]}
 */
export function pathReferences(text) {
  const refs = [];
  for (const match of visibleMarkdown(text ?? '').matchAll(/`([^`\r\n]+)`/g)) {
    const raw = match[1];
    if (!PATH_LIKE.test(raw) || !(raw.includes('/') || FILE_WITH_RANGE.test(raw))) continue;
    const ref = parseReference(raw);
    if (ref) refs.push({ raw, ref });
  }
  return refs;
}

const lineCount = (text) => (text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0);

/**
 * Check one reference against the work tree.
 * @returns {string | null} why it is broken ('missing', 'not a directory', 'unreadable',
 *   'past end of file (N lines)'), null when it resolves
 */
export function referenceProblem(root, ref) {
  let stat;
  try { stat = statSync(join(root, ref.path.replace(/\/$/, ''))); } catch { return 'missing'; }
  if (ref.directory && !stat.isDirectory()) return 'not a directory';
  if (ref.start === undefined) return null;
  if (!stat.isFile()) return 'not a file';
  let text;
  try { text = readFileSync(join(root, ref.path), 'utf8'); } catch { return 'unreadable'; }
  const lines = lineCount(text);
  return ref.end > lines ? `past end of file (${lines} line${lines === 1 ? '' : 's'})` : null;
}

/**
 * Broken path references of a markdown text, in order of appearance, each reported once.
 * A span with a `/` is a reference only when its first segment exists in the repo, so
 * `application/json`, `origin/master` and `@scope/pkg` stay prose.
 * @returns {{ raw: string, problem: string }[]}
 */
export function brokenReferences(root, text) {
  const seen = new Set();
  const broken = [];
  for (const { raw, ref } of pathReferences(text)) {
    if (seen.has(raw)) continue;
    seen.add(raw);
    const [first, ...rest] = ref.path.split('/');
    if (rest.length && !existsSync(join(root, first))) continue;
    const problem = referenceProblem(root, ref);
    if (problem) broken.push({ raw, problem });
  }
  return broken;
}
