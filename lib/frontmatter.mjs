// Minimal YAML subset for task-file frontmatter (D-03): `key: value` lines with
// scalars, booleans, numbers, inline `[a, b]` arrays and trailing `# comment`s.

const KEY_LINE = /^([A-Za-z_][\w-]*):(.*)$/;
const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** Locate the frontmatter block: line indexes of the two `---` fences. */
function fences(lines) {
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  return end < 0 ? null : { start: 0, end };
}

/** Split `raw` (text after `key:`) into value and comment (with its leading spaces). */
export function splitComment(raw) {
  let quote = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(raw[i - 1]))) {
      const value = raw.slice(0, i);
      const pad = value.length - value.trimEnd().length;
      return { value: value.trimEnd(), comment: raw.slice(i - pad) };
    }
  }
  return { value: raw.trimEnd(), comment: '' };
}

/** Split an inline array body on commas outside quotes. */
function splitItems(body) {
  const items = [];
  let quote = null;
  let cur = '';
  for (const c of body) {
    if (quote) { if (c === quote) quote = null; cur += c; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; } else if (c === ',') { items.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim() || items.length) items.push(cur);
  return items.map((s) => s.trim());
}

function scalar(text, lineNo) {
  const v = text.trim();
  if (v === '') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (NUMBER.test(v)) return Number(v);
  if (/^(["']).*\1$/.test(v)) return v.slice(1, -1);
  if (/^[|>{&*!]/.test(v)) throw new Error(`frontmatter line ${lineNo}: unsupported YAML value '${v}'`);
  return v;
}

function value(text, lineNo) {
  const v = text.trim();
  if (v.startsWith('[')) {
    if (!v.endsWith(']')) throw new Error(`frontmatter line ${lineNo}: unterminated array`);
    return splitItems(v.slice(1, -1)).map((item) => scalar(item, lineNo));
  }
  return scalar(v, lineNo);
}

/**
 * Parse the frontmatter of a Markdown file.
 * @param {string} text whole file
 * @returns {Record<string, unknown>} empty object when the file has no frontmatter
 * @throws {Error} naming the 1-based file line of unsupported YAML
 */
export function parse(text) {
  const lines = text.split('\n');
  const f = fences(lines);
  if (!f) return {};
  const out = {};
  for (let i = f.start + 1; i < f.end; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const m = KEY_LINE.exec(line);
    if (!m) throw new Error(`frontmatter line ${lineNo}: unsupported YAML '${line.trim()}'`);
    out[m[1]] = value(splitComment(m[2]).value, lineNo);
  }
  return out;
}

const PLAIN = /^[\w./*@-][\w ./*@:-]*$/;

function format(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return `[${v.map(format).join(', ')}]`;
  if (typeof v !== 'string') return String(v);
  const needsQuotes = !PLAIN.test(v) || v === '*' || ['true', 'false'].includes(v) || NUMBER.test(v);
  return needsQuotes ? JSON.stringify(v) : v;
}

/**
 * Change one frontmatter value in place, keeping its comment column and all other lines.
 * @param {string} text whole file
 * @param {string} key existing key
 * @param {unknown} v new value (string, number, boolean, null or array of those)
 * @throws {Error} when the key is not present
 */
export function setField(text, key, v) {
  const lines = text.split('\n');
  const f = fences(lines);
  const i = f ? lines.slice(f.start + 1, f.end).findIndex((l) => KEY_LINE.exec(l)?.[1] === key) : -1;
  if (i < 0) throw new Error(`frontmatter has no key '${key}'`);
  const idx = f.start + 1 + i;
  const { value: old, comment } = splitComment(KEY_LINE.exec(lines[idx])[2]);
  const prefix = `${key}:${old.match(/^\s*/)[0] || ' '}`;
  const next = format(v);
  let line = prefix + next;
  if (comment) {
    const column = lines[idx].length - comment.trimStart().length;
    line = line.padEnd(Math.max(column, line.length + 1)) + comment.trimStart();
  }
  lines[idx] = line;
  return lines.join('\n');
}
