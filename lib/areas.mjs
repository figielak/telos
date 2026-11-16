import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { isFullHash, isUtcDate, visibleMarkdown } from './map.mjs';
import { estimateTokens } from './map-budget.mjs';
import { telosDir } from './repo.mjs';

// Area files (11:D-02..D-05): `.telos/areas/<name>.md`, one per area of the project, read only
// when work touches its paths. Line 1 is the machine header; six fixed sections follow.

export const AREA_SECTIONS = Object.freeze(['Purpose', 'Entry points', 'Invariants', 'Decisions', 'Rejected', 'Pitfalls']);
export const NAME_RULE = 'lowercase a-z, 0-9 and -, starting with a letter or digit, at most 30 characters';
const NAME = /^[a-z0-9][a-z0-9-]{0,29}$/;
const HEADER = /^<!-- telos-area: commit (\S+) · (\S+) · paths: (.*) -->$/;

/** @returns {boolean} whether `name` is a valid area name (11:D-04) */
export const isAreaName = (name) => typeof name === 'string' && NAME.test(name);

/** @returns {string} `.telos/areas/` of the repo */
export const areasDir = (root) => join(telosDir(root), 'areas');

/** @returns {string} repo-relative path of an area file, as shown to the user */
export const areaRel = (name) => `.telos/areas/${name}.md`;

/**
 * Normalize one area path: repo-relative, `/`-separated, no `..`, globs, commas or control
 * characters. A trailing `/` (directory) is kept. `.` (the whole repo) is not an area path.
 * @returns {string | null} the normalized path, null when invalid
 */
export function normalizeAreaPath(raw) {
  if (typeof raw !== 'string') return null;
  const path = raw.trim();
  if (!path || /[\\:,*?[\]`\x00-\x1f\x7f\u2028\u2029]/.test(path) || posix.isAbsolute(path)) return null;
  const normalized = posix.normalize(path);
  if (normalized === '.' || normalized === './' || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized.replace(/^\.\//, '');
}

/**
 * The `/`-boundary rule: `src/a` and `src/a/` match `src/a` and anything under `src/a/`, never
 * `src/ab` or `src/ab/x`.
 * @param {string} file repo-relative path
 * @param {string} areaPath normalized area path
 */
export function pathMatches(file, areaPath) {
  const base = areaPath.replace(/\/$/, '');
  return file === base || file.startsWith(`${base}/`);
}

/** Format the header line; throws on invalid metadata. */
export function areaHeader({ commit, date, paths }) {
  const errors = headerErrors({ commit, date, paths });
  if (errors.length) throw new TypeError(errors.join('\n'));
  return `<!-- telos-area: commit ${commit} · ${date} · paths: ${paths.join(', ')} -->`;
}

function headerErrors({ commit, date, paths }) {
  const errors = [];
  if (!isFullHash(commit)) errors.push('header commit must be a full 40- or 64-character hexadecimal hash');
  if (!isUtcDate(date)) errors.push('header date must be a real UTC calendar date in YYYY-MM-DD format');
  if (!Array.isArray(paths) || !paths.length) errors.push('header lists no paths');
  else {
    for (const path of paths) {
      if (normalizeAreaPath(path) !== path) errors.push(`invalid path ${JSON.stringify(path)}; use a repo-relative path with /, directories end in /`);
    }
    const seen = new Set();
    for (const path of paths) {
      const key = path.replace(/\/$/, '');
      if (seen.has(key)) errors.push(`duplicate path ${JSON.stringify(path)}`);
      seen.add(key);
    }
  }
  return errors;
}

/**
 * Parse an area file without judging it.
 * @returns {{ header: { commit: string, date: string, paths: string[] } | null, headerErrors: string[],
 *   title: string | null, sections: string[], tokens: number }}
 */
export function parseArea(text) {
  const source = text ?? '';
  const first = source.split(/\r?\n/, 1)[0];
  const match = HEADER.exec(first);
  let header = null;
  let errors;
  if (!match) errors = ['missing or malformed header; line 1 must be <!-- telos-area: commit <full-hash> · YYYY-MM-DD · paths: a/, b.mjs -->'];
  else {
    const parsed = { commit: match[1], date: match[2], paths: match[3].split(',').map((p) => p.trim()).filter(Boolean) };
    errors = headerErrors(parsed);
    if (!errors.length) header = parsed;
  }
  const visible = visibleMarkdown(source);
  const title = /^# +(.+?)[\t ]*\r?$/m.exec(visible)?.[1] ?? null;
  const sections = [...visible.matchAll(/^ {0,3}##[\t ]+([^\r\n]+?)[\t ]*\r?$/gm)].map((m) => m[1].replace(/[\t ]+#+$/, ''));
  return { header, headerErrors: errors, title, sections, tokens: estimateTokens(source) };
}

/**
 * Lint one area file (11:D-02, D-04, D-05).
 * @param {string} text file contents
 * @param {{ name?: string, limit: number }} opts file name without `.md`; token limit
 * @returns {string[]} one problem per entry; empty when valid
 */
export function lintArea(text, { name, limit }) {
  const area = parseArea(text);
  const problems = [...area.headerErrors];
  if (name !== undefined && !isAreaName(name)) problems.push(`invalid area name ${JSON.stringify(name)}; use ${NAME_RULE}`);
  if (name !== undefined && area.title !== name) problems.push(`title must be "# ${name}"${area.title === null ? '' : `, found "# ${area.title}"`}`);
  const counts = new Map();
  for (const heading of area.sections) {
    if (!AREA_SECTIONS.includes(heading)) problems.push(`unexpected section "## ${heading}"; use ${AREA_SECTIONS.join(', ')}`);
    counts.set(heading, (counts.get(heading) ?? 0) + 1);
  }
  for (const heading of AREA_SECTIONS) {
    const count = counts.get(heading) ?? 0;
    if (!count) problems.push(`missing section "## ${heading}"`);
    else if (count > 1) problems.push(`duplicate section "## ${heading}"`);
  }
  const known = area.sections.filter((h, i) => AREA_SECTIONS.includes(h) && area.sections.indexOf(h) === i);
  if (known.some((h, i) => i && AREA_SECTIONS.indexOf(known[i - 1]) > AREA_SECTIONS.indexOf(h))) {
    problems.push(`sections out of order; use ${AREA_SECTIONS.join(' → ')}`);
  }
  if (area.tokens > limit) problems.push(`${area.tokens} estimated tokens > limit ${limit}; shorten it or split the area in two`);
  return problems;
}

/**
 * Every `.telos/areas/*.md` file in name order, parsed. Invalid names are listed too, so lint can
 * report them.
 * @returns {{ name: string, rel: string, text: string, header: object | null, tokens: number }[]}
 */
export function loadAreas(root) {
  const dir = areasDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name.slice(0, -3))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((name) => {
      const text = readFileSync(join(dir, `${name}.md`), 'utf8');
      const { header, tokens } = parseArea(text);
      return { name, rel: areaRel(name), text, header, tokens };
    });
}

/**
 * Names of areas whose header paths match any of `paths` (repo-relative), in name order.
 * @param {ReturnType<typeof loadAreas>} areas
 * @param {string[]} paths
 */
export function areasFor(areas, paths) {
  return areas.filter((a) => a.header && paths.some((p) => a.header.paths.some((ap) => pathMatches(p, ap)))).map((a) => a.name);
}
