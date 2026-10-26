import { posix } from 'node:path';

import { estimateTokens } from './map-budget.mjs';

const SECTIONS = ['Structure', 'Entry points', 'Flows', 'Areas', 'Find'];
const SECTION_IDS = ['structure', 'entry-points', 'flows', 'areas', 'find'];
const STUB = '<!-- telos-map: not built -->';
const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const blank = (text) => text.replace(/[^\r\n]/g, ' ');

function metadataErrors({ commit, date, files }) {
  const errors = [];
  if (typeof commit !== 'string' || !HASH.test(commit)) errors.push('Header commit must be a full 40- or 64-character hexadecimal hash.');
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    errors.push('Header date must be a real UTC calendar date in YYYY-MM-DD format.');
  }
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

function visibleMarkdown(text) {
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
    const raw = match[1];
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
    if (invalid) {
      errors.push(`Invalid reference ${JSON.stringify(raw)} in ${heading ?? 'MAP header'}; use a repo-relative path with / and an optional positive :start-end file range.`);
      continue;
    }
    refs.push({ path: normalized, directory, ...(range ? { start, end } : {}) });
  }
  return refs;
}

function parseBlocks(text, visible, errors) {
  const points = [{ id: 'header', heading: null, start: 0 }];
  const fixed = [], ids = new Map();
  let section = null;
  const add = (id, heading, start) => {
    const count = (ids.get(id) ?? 0) + 1;
    ids.set(id, count);
    if (count > 1) errors.push(`Duplicate ${id.startsWith('area:') ? 'Area' : 'section'} heading: ${heading}.`);
    points.push({ id: count === 1 ? id : `${id}#${count}`, heading, start });
  };
  for (const match of visible.matchAll(/^ {0,3}(#{2,3})[\t ]+([^\r\n]+)[\r]?$/gm)) {
    const heading = match[2].trim().replace(/[\t ]+#+$/, '').trim();
    if (match[1].length === 2) {
      const index = SECTIONS.indexOf(heading);
      section = heading;
      if (index < 0) errors.push(`Unexpected section heading: ${heading}; use ${SECTIONS.join(', ')}.`);
      else fixed.push(heading);
      add(index < 0 ? `unknown:${heading}` : SECTION_IDS[index], heading, match.index);
    } else {
      if (section !== 'Areas') errors.push(`Area heading ${heading} is outside the Areas section.`);
      add(`area:${heading}`, heading, match.index);
    }
  }
  for (const heading of SECTIONS) if (!fixed.includes(heading)) errors.push(`Missing section heading: ${heading}.`);
  const unique = [...new Set(fixed)];
  if (unique.some((heading, i) => i > 0 && SECTIONS.indexOf(unique[i - 1]) > SECTIONS.indexOf(heading))) {
    errors.push(`Section headings must appear in this order: ${SECTIONS.join(' → ')}.`);
  }
  return points.map((point, i) => {
    const end = points[i + 1]?.start ?? text.length;
    return { ...point, end, text: text.slice(point.start, end), refs: references(visible.slice(point.start, end), errors, point.heading) };
  });
}

/**
 * Inspect MAP provenance, structure and configured token budget without changing authored bytes.
 * Blocks partition the original UTF-16 offsets, including header and Areas preface. Fixed IDs are
 * header/structure/entry-points/flows/areas/find; Area IDs are `area:<heading>`. A built skeleton
 * with no refs is valid; refresh consumers must require refs in their editable units.
 */
export function inspectMap(text, { limit } = {}) {
  const source = text ?? '';
  const tokens = estimateTokens(source);
  const errors = [];
  if (!Number.isSafeInteger(limit) || limit <= 0) errors.push('MAP token limit must be a positive integer.');
  else if (tokens > limit) errors.push(`MAP token budget exceeded: ${tokens} estimated tokens > limit ${limit}; shorten the authored MAP explicitly.`);
  if (!source.trim() || source.split(/\r?\n/, 1)[0] === STUB) {
    return { state: errors.length ? 'invalid' : 'not-built', header: null, tokens, blocks: [], errors };
  }
  const header = readHeader(source, errors);
  const visible = visibleMarkdown(source);
  if (/\bNot built yet\b/.test(visible)) errors.push('Remove the remaining "Not built yet" stub paragraph from the built MAP.');
  const blocks = parseBlocks(source, visible, errors);
  return { state: errors.length ? 'invalid' : 'built', header, tokens, blocks, errors };
}
