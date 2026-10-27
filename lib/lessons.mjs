import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
