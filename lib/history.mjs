import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import { atLeast, load, requireMessage } from './config.mjs';
import { UsageError } from './errors.mjs';
import { telosDir } from './repo.mjs';

const KINDS = ['decision', 'phase', 'revert', 'remove', 'quick', 'profile', 'init'];
const REF = '(?:\\d{2}(?:-\\d{2})?|ADR \\d{3}|quick|telos)';
const DATE = '\\d{4}-\\d{2}-\\d{2}';
const LOG = new RegExp(`^- (${DATE}) (${KINDS.join('|')}) (${REF}): (.+)$`);
const PATH = new RegExp(`^- \x60([^\x60]+)\x60 — (.+) \\((${REF}), (${DATE})\\)$`);
const APPROACH = new RegExp(`^- approach: (.+?) — (.+) \\((${REF}), (${DATE})\\)$`);

/** Invalid or inaccessible history storage: reported by the CLI with exit 1. */
export class HistoryError extends Error {}

function singleLine(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()
      || /[\x00-\x1f\x7f-\x9f\u2028\u2029]|<!--|-->/.test(value)) {
    throw new UsageError(`${label} must be a non-empty single line without surrounding whitespace or HTML comments`);
  }
  return value;
}

function validRef(value) {
  singleLine(value, 'ref');
  if (!new RegExp(`^${REF}$`).test(value)) throw new UsageError('ref must be NN, NN-MM, ADR NNN, quick or telos');
  return value;
}

function normalizedPath(value) {
  singleLine(value, 'path');
  if (isAbsolute(value) || /[\\`:]|^\//.test(value) || value.split('/').includes('..')) {
    throw new UsageError('path must be relative to the repository, without traversal, backslashes or backticks');
  }
  const path = posix.normalize(value).replace(/\/$/, '');
  if (!path || path === '.') throw new UsageError('path must identify a target inside the repository');
  return path;
}

function approachText(value) {
  singleLine(value, 'approach');
  if (value.includes(' — ')) throw new UsageError('approach must not contain the separator " — "');
  return value;
}

function inside(root, path) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function checkTarget(root, path) {
  const base = fs.realpathSync(root);
  let ancestor = resolve(base, path);
  while (ancestor !== base) {
    try {
      fs.lstatSync(ancestor);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      ancestor = dirname(ancestor);
      continue;
    }
    let actual;
    try { actual = fs.realpathSync(ancestor); }
    catch { throw new UsageError('path contains an unresolvable target or symlink'); }
    if (!inside(base, actual)) throw new UsageError('path resolves outside the repository');
    return;
  }
}

function inputEntry(root, value) {
  if (!value || !KINDS.includes(value.kind)) throw new UsageError(`kind must be ${KINDS.join(', ')}`);
  const entry = { kind: value.kind, ref: validRef(value.ref), text: singleLine(value.text, 'text') };
  const selectors = ['path', 'approach'].filter((key) => value[key] !== undefined);
  if (selectors.length > 1) throw new UsageError('use only one of --path or --approach');
  if (selectors.length && !['remove', 'revert'].includes(entry.kind)) {
    throw new UsageError('selectors are valid only for remove or revert');
  }
  if (value.path !== undefined) {
    entry.path = normalizedPath(value.path);
    checkTarget(root, entry.path);
  }
  if (value.approach !== undefined) entry.approach = approachText(value.approach);
  return entry;
}

function validDate(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`invalid date '${date}'`);
  }
  return date;
}

function logEntry(line) {
  const m = LOG.exec(line);
  if (!m) throw new Error('expected "- YYYY-MM-DD <kind> <ref>: text"');
  return { date: validDate(m[1]), kind: m[2], ref: validRef(m[3]), text: singleLine(m[4], 'text') };
}

function zoneEntry(line) {
  const path = PATH.exec(line);
  const m = path ?? APPROACH.exec(line);
  if (!m) throw new Error('expected a Delete-zone path or approach with reason, ref and date');
  return { ...(path ? { path: normalizedPath(m[1]) } : { approach: approachText(m[1]) }),
    reason: singleLine(m[2], 'reason'), ref: validRef(m[3]), date: validDate(m[4]) };
}

function parse(text, name) {
  const visible = text.replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\r\n]/g, ' '));
  if (/<!--|-->/.test(visible)) throw new HistoryError(`${name}: malformed HTML comment`);
  const lines = [];
  const rawLines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let offset = 0;
  for (const raw of rawLines) {
    const end = offset + raw.length;
    lines.push({ start: offset, end, raw, text: raw.replace(/\r?\n$/, ''),
      visible: visible.slice(offset, end).replace(/\r?\n$/, '').trimEnd() });
    offset = end;
  }
  const title = name === 'HISTORY.md' ? '# History' : '# History archive';
  const titles = lines.filter((line) => /^# /.test(line.visible));
  if (titles.length !== 1 || titles[0].visible !== title) throw new HistoryError(`${name}: expected ${title}`);

  function section(heading, parseEntry) {
    const matches = lines.map((line, i) => line.visible === heading ? i : -1).filter((i) => i >= 0);
    if (matches.length !== 1) throw new HistoryError(`${name}: expected exactly one ${heading}`);
    const at = matches[0];
    let end = at + 1;
    while (end < lines.length && !/^#{1,2} /.test(lines[end].visible)) end++;
    const slots = [];
    for (const line of lines.slice(at + 1, end)) {
      if (!line.visible.trim()) continue;
      try {
        slots.push({ ...line, entry: line.text === '- none' ? null : parseEntry(line.text) });
      } catch (err) {
        throw new HistoryError(`${name} ${heading}, line ${lines.indexOf(line) + 1}: ${err.message}`);
      }
    }
    if (slots.some((s) => s.entry === null) && slots.length !== 1) {
      throw new HistoryError(`${name} ${heading}: '- none' must be the only entry`);
    }
    return { start: lines[at].end, end: lines[end]?.start ?? text.length, slots };
  }

  const log = section('## Log', logEntry);
  const deleteZone = name === 'HISTORY.md' ? section('## Delete-zone', zoneEntry) : null;
  if (deleteZone && (titles[0].start > deleteZone.start || deleteZone.start > log.start)) {
    throw new HistoryError(`${name}: expected Delete-zone before Log, after the title`);
  }
  if (titles[0].start > log.start) throw new HistoryError(`${name}: Log must follow the title`);
  return { text, log, deleteZone, newline: text.includes('\r\n') ? '\r\n' : '\n' };
}

function profileConfig(root) {
  const cfg = load(root);
  if (!atLeast(cfg, 'standard')) throw new HistoryError(requireMessage('standard'));
  const dir = fs.lstatSync(telosDir(root));
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw new HistoryError('HISTORY storage needs a regular .telos directory');
  return cfg;
}

function storage(root, name, optional = false) {
  const path = join(telosDir(root), name);
  let stat;
  try { stat = fs.lstatSync(path); }
  catch (err) {
    if (optional && err.code === 'ENOENT') return null;
    throw new HistoryError(`${name}: ${err.message}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new HistoryError(`${name}: expected a regular file, not a symlink`);
  return { ...parse(fs.readFileSync(path, 'utf8'), name), mode: stat.mode & 0o777 };
}

function operation(fn) {
  try { return fn(); }
  catch (err) {
    if (err instanceof HistoryError || err instanceof UsageError) throw err;
    throw new HistoryError(`HISTORY storage: ${err.message}`);
  }
}

/** Read the live Log and Delete-zone as structured entries; never read the archive. */
export function readHistory(root) {
  return operation(() => {
    profileConfig(root);
    const doc = storage(root, 'HISTORY.md');
    const entries = (section) => section.slots.filter((s) => s.entry).map((s) => s.entry);
    return { log: entries(doc.log), deleteZone: entries(doc.deleteZone) };
  });
}

/** Return unrotated path/approach entries with their reason, ref and date. */
export function deleteZoneEntries(root) {
  return readHistory(root).deleteZone;
}

function patchSection(doc, section, prepend, drop = []) {
  const removed = new Set(drop);
  if (prepend.length) for (const slot of section.slots) if (!slot.entry) removed.add(slot);
  if (!prepend.length && !removed.size) return doc.text;
  const remaining = section.slots.filter((s) => s.entry && !removed.has(s));
  if (!prepend.length && !remaining.length) prepend = ['- none'];
  let text = doc.text;
  for (const slot of [...removed].sort((a, b) => b.start - a.start)) {
    text = text.slice(0, slot.start) + text.slice(slot.end);
  }
  const at = section.slots[0]?.start ?? section.end;
  const prefix = at && !text.slice(0, at).endsWith('\n') ? doc.newline : '';
  const added = prepend.map((line) => line.endsWith('\n') ? line : line + doc.newline).join('');
  return text.slice(0, at) + (added ? prefix + added : '') + text.slice(at);
}

const logLine = (e) => `- ${e.date} ${e.kind} ${e.ref}: ${e.text}`;
const zoneLine = (e) => `- ${e.path !== undefined ? `\x60${e.path}\x60` : `approach: ${e.approach}`} — ${e.text} (${e.ref}, ${e.date})`;

function syncDirectory(dir) {
  const fd = fs.openSync(dir, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function stagedWrite(root, changes) {
  const dir = telosDir(root);
  const staged = [];
  try {
    for (const { name, text, mode = 0o644 } of changes) {
      const path = join(dir, `.${name}.${randomUUID()}.tmp`);
      staged.push({ path, destination: join(dir, name) });
      const fd = fs.openSync(path, 'wx', mode);
      try {
        fs.writeFileSync(fd, text, 'utf8');
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
    }
    for (const { path, destination } of staged) {
      fs.renameSync(path, destination);
      syncDirectory(dir);
    }
  } finally {
    for (const { path } of staged) {
      try { fs.rmSync(path, { force: true }); } catch { /* A failed cleanup must not hide the write error. */ }
    }
  }
}

/** Add a dated entry, apply an exact selector and archive overflow before replacing HISTORY. */
export function addHistory(root, value) {
  return operation(() => {
    const entry = { ...inputEntry(root, value), date: new Date().toISOString().slice(0, 10) };
    const cfg = profileConfig(root);
    const doc = storage(root, 'HISTORY.md');
    const archive = storage(root, 'HISTORY-archive.md', true);
    const log = doc.log.slots.filter((s) => s.entry);
    const overflow = log.slice(cfg.limits.history_entries - 1);
    let next = { ...doc, text: patchSection(doc, doc.log, [logLine(entry)], overflow) };
    const selector = entry.path !== undefined ? 'path' : entry.approach !== undefined ? 'approach' : null;
    if (selector && entry.kind === 'remove') {
      next.text = patchSection(next, doc.deleteZone, [zoneLine(entry)]);
    } else if (selector && entry.kind === 'revert') {
      const drop = doc.deleteZone.slots.filter((s) => s.entry?.[selector] === entry[selector]);
      next.text = patchSection(next, doc.deleteZone, [], drop);
    }
    const changes = [];
    if (overflow.length) {
      const target = archive ?? parse('# History archive\n\n## Log\n', 'HISTORY-archive.md');
      changes.push({ name: 'HISTORY-archive.md', mode: archive?.mode,
        text: patchSection(target, target.log, overflow.map((s) => s.raw)) });
    }
    changes.push({ name: 'HISTORY.md', mode: doc.mode, text: next.text });
    stagedWrite(root, changes);
    return entry;
  });
}

/** @type {import('./cli.mjs').Command} */
export const historyCommand = {
  help: 'add <kind> <ref> <text> [--path <relative-path> | --approach <text>]',
  needsTelos: true,
  run({ args, root, stdout, stderr }) {
    let parsed;
    try {
      parsed = parseArgs({ args, allowPositionals: true, options: {
        path: { type: 'string', multiple: true }, approach: { type: 'string', multiple: true },
      } });
    } catch (err) { throw new UsageError(err.message); }
    const [action, kind, ref, text, ...extra] = parsed.positionals;
    if (action !== 'add' || text === undefined || extra.length) throw new UsageError(`usage: history ${historyCommand.help}`);
    if (Object.values(parsed.values).some((values) => values.length > 1)) {
      throw new UsageError('each selector may appear only once');
    }
    try {
      const entry = addHistory(root, { kind, ref, text,
        path: parsed.values.path?.[0], approach: parsed.values.approach?.[0] });
      stdout.write(`${logLine(entry)}\n`);
      return 0;
    } catch (err) {
      if (!(err instanceof HistoryError)) throw err;
      stderr.write(`telos history: ${err.message}\n`);
      return 1;
    }
  },
};
