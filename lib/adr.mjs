import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { atLeast, load, requireMessage } from './config.mjs';
import { phaseDecisions, statusText } from './ctx/approve.mjs';
import { UsageError } from './errors.mjs';
import { telosDir } from './repo.mjs';
import { getLine } from './status.mjs';
import { render } from './template.mjs';

// `telos adr new` (SPEC §11, 05:D-04): ADR-lite files in `.telos/decisions/`, header owned by the
// CLI, body by the skill. One writer at a time (`.adr.lock`); a create plus supersession is
// journaled first, so an interrupted run never reports success and the exact retry finishes it.

export class AdrError extends Error {}

const DIR = 'decisions';
const LOCK = '.adr.lock';
const JOURNAL = '.adr-journal.json';
const MAX_LINES = 30;
const TITLE_MAX = 120;
const SOURCE = /^\d{2}:D-\d{2}$/;
const NUMBER = /^\d{3}$/;
const ADR_FILE = /^(\d{3})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const HEADER = [
  /^# (\d{3}) · (.+)$/,
  /^Date: (\d{4}-\d{2}-\d{2}) · Status: (accepted|superseded by \d{3}|reverted \(.+\)) · Source: (\d{2}:D-\d{2})$/,
  /^Supersedes: (none|\d{3})$/,
];

/**
 * @typedef {{ number: string, title: string, date: string, status: string, source: string,
 *   supersedes: string | null, file: string, path: string }} Adr
 * @typedef {{ title: string, source: string, supersedes?: string | null }} AdrRequest
 */

const slug = (title) => title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
const command = (r) => `telos adr new ${JSON.stringify(r.title)} --source ${r.source}${r.supersedes ? ` --supersedes ${r.supersedes}` : ''}`;

/** @returns {AdrRequest} validated request; malformed values are usage errors */
function request({ title, source, supersedes = null }) {
  if (typeof title !== 'string' || !title.trim() || title !== title.trim() || title.length > TITLE_MAX
    || /[\x00-\x1f\x7f]|<!--|-->/.test(title) || !slug(title)) {
    throw new UsageError(`title must be one line of 1–${TITLE_MAX} characters with letters or digits`);
  }
  if (typeof source !== 'string' || !SOURCE.test(source)) throw new UsageError('--source must be NN:D-MM');
  if (supersedes !== null && (typeof supersedes !== 'string' || !NUMBER.test(supersedes))) throw new UsageError('--supersedes must be NNN');
  return { title, source, supersedes };
}

/** @returns {string | null} `.telos/decisions` when it is a regular directory, null when missing */
function decisionsDir(root) {
  const dir = join(telosDir(root), DIR);
  for (const path of [telosDir(root), dir]) {
    let stat;
    try { stat = fs.lstatSync(path); } catch (err) {
      if (err.code === 'ENOENT' && path === dir) return null;
      throw new AdrError(`${path}: ${err.message}`);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AdrError(`.telos/${path === dir ? DIR : ''} must be a regular directory, not a symlink`);
  }
  return dir;
}

function regularText(dir, file) {
  const stat = fs.lstatSync(join(dir, file));
  if (!stat.isFile() || stat.isSymbolicLink()) throw new AdrError(`${file}: expected a regular file, not a symlink`);
  return fs.readFileSync(join(dir, file), 'utf8');
}

/**
 * ADR headers of `.telos/decisions/`, sorted by number. Files named `NNN-….md` must be regular
 * files with a valid header; anything malformed fails closed.
 * @param {string} root
 * @returns {Adr[]}
 */
export function readAdrs(root) {
  const dir = decisionsDir(root);
  if (!dir) return [];
  const adrs = [];
  for (const file of fs.readdirSync(dir).filter((f) => /^\d{3}-/.test(f)).sort()) {
    const name = ADR_FILE.exec(file);
    if (!name) throw new AdrError(`${file}: ADR files are named NNN-slug.md`);
    const lines = regularText(dir, file).split(/\r?\n/);
    const m = HEADER.map((re, i) => re.exec(lines[i] ?? ''));
    if (m.some((x) => !x) || m[0][1] !== name[1]) {
      throw new AdrError(`${file}: malformed ADR header (expected "# NNN · title", "Date: YYYY-MM-DD · Status: … · Source: NN:D-MM", "Supersedes: none|NNN")`);
    }
    if (adrs.some((a) => a.number === name[1])) throw new AdrError(`${file}: duplicate ADR number ${name[1]}`);
    adrs.push({ number: name[1], title: m[0][2], date: m[1][1], status: m[1][2], source: m[1][3],
      supersedes: m[2][1] === 'none' ? null : m[2][1], file, path: join(dir, file) });
  }
  return adrs;
}

/** Fail unless `NN:D-MM` is a confirmed decision of phase NN that no longer awaits the user. */
function checkSource(root, source) {
  const [nn, id] = source.split(':');
  let decisions;
  try { decisions = phaseDecisions(root, nn); } catch (err) { throw new AdrError(`decision ${source}: ${err.message}`); }
  if (!decisions.has(id)) throw new AdrError(`decision ${source} not found in phase ${nn} CONTEXT`);
  if (decisions.get(id)) throw new AdrError(`decision ${source} is proposed; confirm it first`);
  const awaiting = getLine(statusText(root), 'Awaiting user').split(',').map((s) => s.trim());
  if (awaiting.includes(source)) throw new AdrError(`decision ${source} awaits the user`);
}

function syncDirectory(dir) {
  const fd = fs.openSync(dir, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

/** Write `text` to a synced temp file, then publish it: link (never overwrites) or rename (replaces). */
function publish(dir, file, text, replace) {
  const temp = join(dir, `.${file}.${randomUUID()}.tmp`);
  const fd = fs.openSync(temp, 'wx', 0o644);
  try {
    fs.writeFileSync(fd, text, 'utf8');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  try {
    if (replace) fs.renameSync(temp, join(dir, file));
    else fs.linkSync(temp, join(dir, file));
  } finally { fs.rmSync(temp, { force: true }); }
  syncDirectory(dir);
}

/** @returns {{ plan: object, state: string }} the new plan, or the journaled one for an exact retry */
function plan(root, dir, req) {
  if (fs.existsSync(join(dir, JOURNAL))) {
    const journal = JSON.parse(regularText(dir, JOURNAL));
    const same = journal.request.title === req.title && journal.request.source === req.source
      && journal.request.supersedes === req.supersedes;
    if (same) return { plan: journal, state: 'completed' };
    throw new AdrError(`interrupted publication of ADR ${journal.number} in .telos/${DIR}/${JOURNAL}; finish it first with: `
      + `${command(journal.request)} (or inspect both files and remove the journal)`);
  }
  const adrs = readAdrs(root);
  const exact = adrs.find((a) => a.title === req.title && a.source === req.source && a.supersedes === req.supersedes);
  if (exact) {
    const old = req.supersedes && adrs.find((a) => a.number === req.supersedes);
    if (old && old.status !== `superseded by ${exact.number}`) {
      throw new AdrError(`ADR ${exact.number} exists but ADR ${old.number} is ${old.status}; inspect both files`);
    }
    return { plan: { number: exact.number, file: exact.file }, state: 'reused' };
  }
  const bySource = adrs.find((a) => a.source === req.source);
  if (bySource) throw new AdrError(`decision ${req.source} already has ADR ${bySource.number} (${JSON.stringify(bySource.title)})`);
  const byTitle = adrs.find((a) => a.title.toLowerCase() === req.title.toLowerCase());
  if (byTitle) throw new AdrError(`title ${JSON.stringify(req.title)} already used by ADR ${byTitle.number}`);

  let old = null;
  if (req.supersedes) {
    const target = adrs.find((a) => a.number === req.supersedes);
    if (!target) throw new AdrError(`ADR ${req.supersedes} not found`);
    if (target.status !== 'accepted') throw new AdrError(`ADR ${target.number} is ${target.status}; only accepted ADRs can be superseded`);
    old = { file: target.file, before: regularText(dir, target.file) };
  }
  const next = Math.max(0, ...adrs.map((a) => Number(a.number))) + 1;
  if (next > 999) throw new AdrError('ADR numbers are exhausted (999)');
  const number = String(next).padStart(3, '0');
  const text = render('adr.md', { number, title: req.title, date: new Date().toISOString().slice(0, 10),
    source: req.source, supersedes: req.supersedes ?? 'none' });
  if (text.trimEnd().split('\n').length > MAX_LINES) throw new AdrError(`templates/adr.md exceeds ${MAX_LINES} lines`);
  if (old) {
    // Only the Status field of header line 2 changes; every other byte stays.
    const end = old.before.indexOf('\n', old.before.indexOf('\n') + 1);
    const line = old.before.slice(0, end === -1 ? undefined : end);
    const at = line.lastIndexOf('\n') + 1;
    old.after = old.before.slice(0, at) + line.slice(at).replace(' · Status: accepted · ', ` · Status: superseded by ${number} · `)
      + (end === -1 ? '' : old.before.slice(end));
  }
  return { plan: { version: 1, request: req, number, file: `${number}-${slug(req.title)}.md`, text, old }, state: 'created' };
}

/** Run the journaled steps; each one accepts its before or after state and refuses anything else. */
function apply(dir, p, hooks, fresh) {
  if (fresh) {
    publish(dir, JOURNAL, `${JSON.stringify(p)}\n`, false);
    hooks.afterJournal?.();
  }
  let current = null;
  try { current = regularText(dir, p.file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  if (current === null) publish(dir, p.file, p.text, false);
  else if (current !== p.text) throw new AdrError(`${p.file} changed since the interrupted publication; inspect it and .telos/${DIR}/${JOURNAL} before removing the journal`);
  hooks.afterCreate?.();
  if (p.old) {
    const now = regularText(dir, p.old.file);
    if (now === p.old.before) publish(dir, p.old.file, p.old.after, true);
    else if (now !== p.old.after) throw new AdrError(`${p.old.file} changed since the interrupted publication; inspect it and .telos/${DIR}/${JOURNAL} before removing the journal`);
  }
  fs.rmSync(join(dir, JOURNAL));
  syncDirectory(dir);
}

/**
 * Create the next ADR from a confirmed decision, optionally superseding an accepted one.
 * @param {string} root
 * @param {AdrRequest} options
 * @param {{ afterJournal?: () => void, afterCreate?: () => void }} [hooks] fault injection for tests
 * @returns {{ number: string, file: string, path: string, state: 'created' | 'reused' | 'completed', superseded: string | null }}
 */
export function createAdr(root, options, hooks = {}) {
  const req = request(options);
  if (!atLeast(load(root), 'deep')) throw new AdrError(requireMessage('deep'));
  checkSource(root, req.source);
  let dir = decisionsDir(root);
  if (!dir) {
    dir = join(telosDir(root), DIR);
    fs.mkdirSync(dir);
  }
  let lock;
  try { lock = fs.openSync(join(dir, LOCK), 'wx'); } catch (err) {
    if (err.code !== 'EEXIST') throw new AdrError(`${LOCK}: ${err.message}`);
    throw new AdrError(`another ADR writer holds .telos/${DIR}/${LOCK}; wait for it, or if no telos adr is running remove it and retry`);
  }
  try {
    fs.writeSync(lock, `pid ${process.pid}\n`);
    const { plan: p, state } = plan(root, dir, req);
    if (state !== 'reused') {
      try { apply(dir, p, hooks, state === 'created'); } catch (err) {
        if (err instanceof AdrError) throw err;
        throw new AdrError(`publication of ADR ${p.number} interrupted: ${err.message}; rerun the same command to finish (journal .telos/${DIR}/${JOURNAL})`);
      }
    }
    return { number: p.number, file: p.file, path: join(dir, p.file), state, superseded: state === 'reused' ? null : req.supersedes };
  } finally {
    fs.closeSync(lock);
    fs.rmSync(join(dir, LOCK), { force: true });
  }
}

/** @type {import('./cli.mjs').Command} */
export const adrCommand = {
  help: 'new "<title>" --source NN:D-MM [--supersedes NNN] (deep)',
  needsTelos: true,
  run({ args, root, stdout, stderr }) {
    let parsed;
    try {
      parsed = parseArgs({ args, allowPositionals: true, strict: true, options: {
        source: { type: 'string', multiple: true }, supersedes: { type: 'string', multiple: true },
      } });
    } catch (err) { throw new UsageError(err.message); }
    const [action, title, ...extra] = parsed.positionals;
    const { source = [], supersedes = [] } = parsed.values;
    if (action !== 'new' || title === undefined || extra.length || source.length !== 1 || supersedes.length > 1) {
      throw new UsageError(`usage: adr ${adrCommand.help}`);
    }
    try {
      const r = createAdr(root, { title, source: source[0], supersedes: supersedes[0] ?? null });
      stdout.write(`.telos/${DIR}/${r.file} · ADR ${r.number} · ${r.state}${r.superseded ? ` · ${r.superseded} superseded by ${r.number}` : ''}\n`);
      return 0;
    } catch (err) {
      if (!(err instanceof AdrError)) {
        if (err instanceof UsageError) throw err;
        stderr.write(`telos adr: ${err.message}\n`);
        return 1;
      }
      stderr.write(`${err.message.startsWith('Requires ') ? '' : 'telos adr: '}${err.message}\n`);
      return 1;
    }
  },
};
