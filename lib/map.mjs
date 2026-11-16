import { estimateTokens } from './map-budget.mjs';
import { parseReference } from './refs.mjs';

// 11-03: MAP is a short index; entry points, flows and details live in `.telos/areas/<name>.md`.
const SECTIONS = ['Structure', 'Areas', 'Find'];
const SECTION_IDS = ['structure', 'areas', 'find'];
const STRUCTURE_ROWS = 10;
const AREA_ROW = /^- (\S+) — \S/;
const AREA_NAME = /^[a-z0-9][a-z0-9-]{0,29}$/;
const STUB = '<!-- telos-map: not built -->';
const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const blank = (text) => text.replace(/[^\r\n]/g, ' ');

/** @returns {boolean} a full 40- or 64-character hexadecimal commit hash */
export const isFullHash = (commit) => typeof commit === 'string' && HASH.test(commit);

/** @returns {boolean} a real UTC calendar date written as YYYY-MM-DD */
export function isUtcDate(date) {
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  return Boolean(parsed) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function metadataErrors({ commit, date, files }) {
  const errors = [];
  if (!isFullHash(commit)) errors.push('Header commit must be a full 40- or 64-character hexadecimal hash.');
  if (!isUtcDate(date)) errors.push('Header date must be a real UTC calendar date in YYYY-MM-DD format.');
  if (!Number.isSafeInteger(files) || files < 0) errors.push('Header files must be a nonnegative safe integer (eligible inventory count).');
  return errors;
}

/** Format validated provenance without reading git or consulting a clock; no trailing newline. */
export function mapHeader(metadata) {
  const errors = metadataErrors(metadata);
  if (errors.length) throw new TypeError(errors.join('\n'));
  return `<!-- telos-map: commit ${metadata.commit} · ${metadata.date} · files ${metadata.files} -->`;
}

function readHeader(text, errors) {
  const first = text.split(/\r?\n/, 1)[0];
  const matches = [...text.matchAll(/^<!-- telos-map:[^\r\n]*-->/gm)];
  if (matches.length > 1) errors.push('Duplicate MAP header; keep exactly one provenance header at the start.');
  const match = /^<!-- telos-map: commit (\S+) · (\S+) · files (\S+) -->$/.exec(first);
  if (!match) {
    errors.push('Missing or malformed MAP header; expected <!-- telos-map: commit <full-hash> · YYYY-MM-DD · files <n> --> on the first line.');
    return null;
  }
  const header = { commit: match[1], date: match[2], files: /^(?:0|[1-9]\d*)$/.test(match[3]) ? Number(match[3]) : NaN };
  const issues = metadataErrors(header);
  errors.push(...issues);
  return issues.length ? null : header;
}

/** Text with comments and fenced code blanked out; offsets and line breaks are kept. */
export function visibleMarkdown(text) {
  const uncommented = text.replace(/<!--[\s\S]*?(?:-->|$)/g, blank);
  let fence = null;
  return uncommented.split(/(?<=\n)/).map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return blank(line);
    }
    if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      return blank(line);
    }
    return line;
  }).join('');
}

function references(text, errors, heading) {
  const refs = [];
  for (const match of text.matchAll(/`([^`\r\n]+)`/g)) {
    const ref = parseReference(match[1]);
    if (ref) refs.push(ref);
    else errors.push(`Invalid reference ${JSON.stringify(match[1])} in ${heading ?? 'MAP header'}; use a repo-relative path with / and an optional positive :start-end file range.`);
  }
  return refs;
}

function parseBlocks(text, visible, errors) {
  const points = [{ id: 'header', heading: null, start: 0 }];
  const fixed = [], ids = new Map();
  const add = (id, heading, start) => {
    const count = (ids.get(id) ?? 0) + 1;
    ids.set(id, count);
    if (count > 1) errors.push(`Duplicate section heading: ${heading}.`);
    points.push({ id: count === 1 ? id : `${id}#${count}`, heading, start });
  };
  for (const match of visible.matchAll(/^ {0,3}(#{2,6})[\t ]+([^\r\n]+)[\r]?$/gm)) {
    const heading = match[2].trim().replace(/[\t ]+#+$/, '').trim();
    if (match[1].length > 2) {
      errors.push(`Unexpected sub-heading ${match[1]} ${heading}; MAP is an index, area details live in .telos/areas/<name>.md.`);
      continue;
    }
    const index = SECTIONS.indexOf(heading);
    if (index < 0) errors.push(`Unexpected section heading: ${heading}; use ${SECTIONS.join(', ')}.`);
    else fixed.push(heading);
    add(index < 0 ? `unknown:${heading}` : SECTION_IDS[index], heading, match.index);
  }
  for (const heading of SECTIONS) if (!fixed.includes(heading)) errors.push(`Missing section heading: ${heading}.`);
  const unique = [...new Set(fixed)];
  if (unique.some((heading, i) => i > 0 && SECTIONS.indexOf(unique[i - 1]) > SECTIONS.indexOf(heading))) {
    errors.push(`Section headings must appear in this order: ${SECTIONS.join(' → ')}.`);
  }
  return points.map((point, i) => {
    const end = points[i + 1]?.start ?? text.length;
    const body = visible.slice(point.start, end);
    return { ...point, end, text: text.slice(point.start, end), visible: body, refs: references(body, errors, point.heading) };
  });
}

/** Visible, nonblank lines of a block below its heading. */
const bodyLines = (block) => block.visible.split(/\r?\n/).slice(1).map((l) => l.trim()).filter(Boolean);

/** Area names from `## Areas` rows; malformed or duplicate rows are errors. */
function areaRows(blocks, errors) {
  const names = [];
  const block = blocks.find((b) => b.id === 'areas');
  for (const line of block ? bodyLines(block) : []) {
    const match = AREA_ROW.exec(line);
    if (!match) { errors.push(`Malformed Areas row ${JSON.stringify(line.slice(0, 60))}; use "- <name> — one line · \`paths\`".`); continue; }
    const name = match[1];
    if (!AREA_NAME.test(name)) errors.push(`Invalid area name ${JSON.stringify(name)} in ## Areas; use lowercase a-z, 0-9 and -, at most 30 characters.`);
    else if (names.includes(name)) errors.push(`Duplicate Areas row: ${name}.`);
    else names.push(name);
  }
  return names;
}

/**
 * `## Areas` rows against the area files, one to one.
 * @param {string[]} rows area names from the MAP rows @param {string[]} files area file names
 * @returns {string[]} one problem per entry
 */
export function areaRowErrors(rows, files) {
  return [
    ...rows.filter((name) => !files.includes(name)).map((name) => `Areas row ${name} has no file .telos/areas/${name}.md; create it with telos area new ${name} --paths <a,b>.`),
    ...files.filter((name) => !rows.includes(name)).map((name) => `Area file .telos/areas/${name}.md has no row in ## Areas.`),
  ];
}

/**
 * Inspect MAP provenance, structure and configured token budget without changing authored bytes.
 * Blocks partition the original UTF-16 offsets; IDs are header/structure/areas/find. `areas`
 * (names of the `.telos/areas/*.md` files), when given, must match the `## Areas` rows one to one.
 * A built skeleton with no refs is valid; refresh consumers must require refs in their units.
 * @param {string | null | undefined} text
 * @param {{ limit: number, areas?: string[] }} opts
 */
export function inspectMap(text, { limit, areas } = {}) {
  const source = text ?? '';
  const tokens = estimateTokens(source);
  const errors = [];
  if (!Number.isSafeInteger(limit) || limit <= 0) errors.push('MAP token limit must be a positive integer.');
  else if (tokens > limit) errors.push(`MAP token budget exceeded: ${tokens} estimated tokens > limit ${limit}; shorten the authored MAP explicitly.`);
  if (!source.trim() || source.split(/\r?\n/, 1)[0] === STUB) {
    return { state: errors.length ? 'invalid' : 'not-built', header: null, tokens, blocks: [], areas: [], errors };
  }
  const header = readHeader(source, errors);
  const visible = visibleMarkdown(source);
  if (/\bNot built yet\b/.test(visible)) errors.push('Remove the remaining "Not built yet" stub paragraph from the built MAP.');
  const blocks = parseBlocks(source, visible, errors);
  const structure = blocks.find((b) => b.id === 'structure');
  const rows = structure ? bodyLines(structure).length : 0;
  if (rows > STRUCTURE_ROWS) errors.push(`Structure has ${rows} lines; keep it to ${STRUCTURE_ROWS} or fewer.`);
  const names = areaRows(blocks, errors);
  if (Array.isArray(areas)) errors.push(...areaRowErrors(names, areas));
  return { state: errors.length ? 'invalid' : 'built', header, tokens, blocks: blocks.map(({ visible: _, ...b }) => b), areas: names, errors };
}
