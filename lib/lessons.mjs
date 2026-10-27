import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { UsageError } from './errors.mjs';
import { HistoryError, deleteZoneEntries } from './history.mjs';
import { telosDir } from './repo.mjs';

// LESSONS.md (SPEC §4.1): `- [area] lesson (ref)`, at most LIMIT entries, std+.
// Malformed lines are reported, never dropped, so no knowledge disappears silently.

export const LIMIT = 20;

const ENTRY = /^-\s+\[([^\]]*)\]\s+(.*?)\s*(?:\(([^()]*)\))?$/;
const REF = /^(?:\d{2}-\d{2}|quick)$/;

/** @typedef {{ area: string, text: string, ref: string, line: number }} Lesson */
/** @typedef {{ line: number, raw: string, reason: string }} Problem */

/**
 * @param {string} text LESSONS.md content
 * @returns {{ entries: Lesson[], problems: Problem[] }} lines are 1-based
 */
export function parseLessons(text) {
  const visible = text.replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\n]/g, ' '));
  const entries = [];
  const problems = [];
  visible.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line === '- none') return;
    const problem = (reason) => problems.push({ line: i + 1, raw: line, reason });
    const m = ENTRY.exec(line);
    if (!m) return problem('expected "- [area] lesson (ref)"');
    const [, area, body, ref] = m;
    if (!area.trim()) return problem('empty [area]');
    if (!body.trim()) return problem('empty lesson text');
    if (ref === undefined) return problem('missing (ref)');
    if (!REF.test(ref.trim())) return problem(`ref '${ref}' must be NN-MM or quick`);
    entries.push({ area: area.trim(), text: body.replace(/\s+/g, ' ').trim(), ref: ref.trim(), line: i + 1 });
  });
  return { entries, problems };
}

/** @returns {string} the canonical `- [area] lesson (ref)` line */
export const formatLesson = (e) => `- [${e.area}] ${e.text} (${e.ref})`;

/** Areas match when equal (case-insensitive) or one path prefix contains the other. */
export function sameArea(a, b) {
  const norm = (s) => s.trim().toLowerCase();
  const [x, y] = [norm(a), norm(b)];
  if (x.replace(/\/$/, '') === y.replace(/\/$/, '')) return true;
  if (!x.includes('/') && !y.includes('/')) return false;
  const dir = (s) => (s.endsWith('/') ? s : `${s}/`);
  return dir(x).startsWith(dir(y)) || dir(y).startsWith(dir(x));
}

/** @returns {{ exists: boolean, entries: Lesson[], problems: Problem[] }} */
export function readLessons(root) {
  const path = join(telosDir(root), 'LESSONS.md');
  if (!existsSync(path)) return { exists: false, entries: [], problems: [] };
  return { exists: true, ...parseLessons(readFileSync(path, 'utf8')) };
}

const SELECTOR = /^[A-Za-z0-9._@+\/-]+$/;
export const MAX_SELECTORS = 20;

/**
 * Validate and normalize a `--area` selector: a repo-relative path or a topic word.
 * Only `[A-Za-z0-9._@+/-]` is accepted, so a selector is always shell-inert.
 * @throws {UsageError}
 */
export function normalizeSelector(value) {
  if (typeof value !== 'string' || !SELECTOR.test(value)) {
    throw new UsageError(`--area '${value ?? ''}' must be a relative path or topic of [A-Za-z0-9._@+/-]`);
  }
  if (value.startsWith('/') || value.split('/').includes('..')) {
    throw new UsageError(`--area '${value}' must stay inside the repository`);
  }
  const path = posix.normalize(value);
  if (path === '.' || path === './') throw new UsageError('--area must name a path or topic');
  return path;
}

/** Lessons whose area matches a selector: exact topic or path prefix at a `/` boundary. No selectors → []. */
export function matchLessons(entries, selectors) {
  const wanted = selectors.map(normalizeSelector);
  return entries.filter((e) => wanted.some((s) => sameArea(e.area, s)));
}

/** Keep whole lines within `budget` chars; a cut ends with `omitted(n)`. */
function fitLines(lines, budget, omitted) {
  const out = [];
  let used = 0;
  for (const [i, line] of lines.entries()) {
    const tail = i < lines.length - 1 ? omitted(lines.length - i - 1).length + 1 : 0;
    if (used + line.length + 1 + tail > budget) {
      out.push(omitted(lines.length - i));
      return out;
    }
    out.push(line);
    used += line.length + 1;
  }
  return out;
}

const approachLine = (e) => `- ${e.approach} — ${e.reason} (${e.ref}, ${e.date})`;

/**
 * Standard+ memory for plan/quick bundles (SPEC §4.1): lessons (all, or those matching
 * `selectors`) and Delete-zone approaches, fitted into `budget` chars with explicit omissions.
 * Reads only LESSONS.md and the live HISTORY.md, never the archive.
 * @param {string} root
 * @param {{ budget: number, selectors?: string[] }} opts selectors undefined → all lessons
 * @returns {string[]} bundle lines
 */
export function memoryLines(root, { budget, selectors }) {
  const lessons = readLessons(root);
  let head;
  let lessonLines = [];
  if (!lessons.exists) head = 'Lessons: unavailable (.telos/LESSONS.md missing)';
  else if (!selectors) {
    head = `Lessons (${lessons.entries.length}/${LIMIT}):`;
    lessonLines = lessons.entries.length ? lessons.entries.map(formatLesson) : ['- none'];
  } else if (!selectors.length) {
    head = 'Lessons: none selected (rerun `telos ctx quick --area <path-or-topic>` for the paths and topics of the change)';
  } else {
    const matched = matchLessons(lessons.entries, selectors);
    head = `Lessons (--area ${selectors.join(', ')}):${matched.length ? '' : ' none match'}`;
    lessonLines = matched.map(formatLesson);
  }
  if (lessons.problems.length) head += ` (${lessons.problems.length} malformed lines skipped; fix with /telos:lesson)`;

  let zoneHead = 'Removed approaches (never reintroduce):';
  let zoneLines = [];
  try {
    zoneLines = deleteZoneEntries(root).filter((e) => e.approach !== undefined).map(approachLine);
    if (!zoneLines.length) zoneLines = ['- none'];
  } catch (err) {
    if (!(err instanceof HistoryError)) throw err;
    zoneHead = `Removed approaches: unavailable (${err.message})`;
  }

  // Lessons first; approaches keep at least a third of the budget when they need it.
  const rest = budget - head.length - zoneHead.length - 2;
  const zoneSize = zoneLines.join('\n').length + 1;
  const lessonBudget = rest - Math.min(zoneSize, Math.floor(rest / 3));
  const shownLessons = fitLines(lessonLines, lessonBudget,
    (n) => `- … ${n} more lessons omitted (see .telos/LESSONS.md)`);
  const zoneBudget = rest - shownLessons.reduce((n, l) => n + l.length + 1, 0);
  const shownZone = fitLines(zoneLines, zoneBudget,
    (n) => `- … ${n} more approaches omitted (see .telos/HISTORY.md §Delete-zone)`);
  return [[head, ...shownLessons].join('\n'), [zoneHead, ...shownZone].join('\n')];
}
