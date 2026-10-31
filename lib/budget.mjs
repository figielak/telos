import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { atLeast, load as loadConfig } from './config.mjs';
import { bundles, ctxCommand, MARKER } from './ctx/index.mjs';
import { BLOCK_START } from './ctx/init.mjs';
import { UsageError } from './errors.mjs';
import { estimateTokens } from './map-budget.mjs';
import { telosDir } from './repo.mjs';
import { sessionText } from './session.mjs';

// `telos budget` (SPEC §12, 06:D-01): read-only size proxy for stored Telos memory and the text
// Telos injects. Estimates are ceil(UTF-16 code units / 4); actual host usage is external evidence.

export const LIMITS = Object.freeze({ fileBytes: 256 * 1024, entries: 1000, depth: 6, rows: 200 });

const BLOCK_END = '<!-- telos:end -->';
const CORE = ['PROJECT.md', 'MAP.md', 'STATUS.md', 'ROADMAP.md', 'config.json'];
const STANDARD = ['HISTORY.md', 'LESSONS.md'];
const SESSION = 'SessionStart (hook output)';
const BLOCK = 'CLAUDE.md Telos block';
// Outputs a bundle prints instead of context: REFUSED, a profile gate, an unknown shared name.
const REFUSAL = /^(REFUSED:|Requires \w+ profile\.|telos ctx: )/;

export class RefusedError extends Error {}

const units = (text) => ({ bytes: Buffer.byteLength(text), chars: text.length, tokens: estimateTokens(text) });

/** Walk `.telos/` in name order, measuring regular files and recording every skip. */
function storedRows(root, omitted) {
  const rows = [];
  let seen = 0;
  const walk = (dir, rel, depth) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const path = `${rel}/${e.name}`;
      if (++seen > LIMITS.entries) {
        omitted.push({ path: rel, reason: `entry limit ${LIMITS.entries} reached; rest of the tree not read` });
        return false;
      }
      if (e.isSymbolicLink()) omitted.push({ path, reason: 'symlink (not followed)' });
      else if (e.isDirectory()) {
        if (e.name === '.cache') omitted.push({ path, reason: 'cache' });
        else if (e.name === 'archive') omitted.push({ path, reason: 'archive' });
        else if (depth >= LIMITS.depth) omitted.push({ path, reason: `depth limit ${LIMITS.depth}` });
        else if (walk(join(dir, e.name), path, depth + 1) === false) return false;
      } else if (!e.isFile()) omitted.push({ path, reason: 'not a regular file' });
      else if (/-archive\.md$/.test(e.name)) omitted.push({ path, reason: 'archive' });
      else {
        const size = lstatSync(join(dir, e.name)).size;
        if (size > LIMITS.fileBytes) omitted.push({ path, reason: `over ${LIMITS.fileBytes} bytes (${size})` });
        else rows.push({ label: path, ...units(readFileSync(join(dir, e.name), 'utf8')) });
      }
    }
    return true;
  };
  walk(telosDir(root), '.telos', 0);
  return rows;
}

/** The CLAUDE.md block from its start marker through the end marker, as stored. */
function blockRow(root, omitted) {
  const path = join(root, 'CLAUDE.md');
  let st;
  try { st = lstatSync(path); } catch { return { label: BLOCK, missing: true }; }
  if (st.isSymbolicLink()) { omitted.push({ path: 'CLAUDE.md', reason: 'symlink (not followed)' }); return null; }
  if (st.size > LIMITS.fileBytes) { omitted.push({ path: 'CLAUDE.md', reason: `over ${LIMITS.fileBytes} bytes (${st.size})` }); return null; }
  const text = readFileSync(path, 'utf8');
  const start = BLOCK_START.exec(text);
  const end = start ? text.indexOf(BLOCK_END, start.index) : -1;
  if (end < 0) return { label: BLOCK, missing: true };
  return { label: BLOCK, ...units(text.slice(start.index, end + BLOCK_END.length)), note: 'loaded with CLAUDE.md' };
}

/** Exactly what `telos ctx <args>` prints, via the real command; refusals are not measurements. */
function ctxRow(root, args) {
  const [name] = args;
  if (!name || !Object.hasOwn(bundles, name)) {
    throw new UsageError(`--ctx needs a known bundle (${Object.keys(bundles).join(', ')})`);
  }
  let out = '';
  ctxCommand.run({ args, root, cwd: root, stdout: { write(s) { out += s; } } });
  const label = `ctx ${args.join(' ')}`;
  if (REFUSAL.test(out)) throw new RefusedError(`${label} refused — not measured: ${out.split('\n')[0]}`);
  return { label, ...units(out), truncated: out.includes(MARKER) };
}

const sum = (rows) => rows.filter((r) => !r.missing)
  .reduce((t, r) => ({ count: t.count + 1, bytes: t.bytes + r.bytes, chars: t.chars + r.chars, tokens: t.tokens + r.tokens }),
    { count: 0, bytes: 0, chars: 0, tokens: 0 });

/**
 * Measure stored `.telos/` files and rendered injections. Reads only; never runs checks or git.
 * @param {string} root repo root with `.telos/`
 * @param {{ ctx?: string[] }} [opts] bundle and args to render like `telos ctx`
 * @throws {UsageError} malformed selection; {RefusedError} the bundle refused
 */
export function measure(root, { ctx } = {}) {
  const cfg = loadConfig(root);
  const omitted = [];
  const stored = storedRows(root, omitted);
  const known = new Set([...stored.map((r) => r.label), ...omitted.map((o) => o.path)]);
  for (const name of [...CORE, ...(atLeast(cfg, 'standard') ? STANDARD : [])]) {
    if (!known.has(`.telos/${name}`)) stored.push({ label: `.telos/${name}`, missing: true });
  }
  stored.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  const session = sessionText(root);
  const rendered = [
    blockRow(root, omitted),
    session ? { label: SESSION, ...units(`${session}\n`) } : { label: SESSION, missing: true },
    ...(ctx ? [ctxRow(root, ctx)] : []),
  ].filter(Boolean);
  return { stored, rendered, omitted, totals: { stored: sum(stored), rendered: sum(rendered) } };
}

const fmt = (r) => (r.missing ? `- ${r.label} · missing`
  : `- ${r.label} · ${r.bytes} B · ${r.chars} chars · ~${r.tokens} est. tokens${r.truncated ? ' · truncated' : ''}${r.note ? ` (${r.note})` : ''}`);
const total = (name, t, unit) => `${name} total: ${t.count} ${unit} · ${t.bytes} B · ${t.chars} chars · ~${t.tokens} est. tokens`;

/** @param {ReturnType<typeof measure>} report */
export function format({ stored, rendered, omitted, totals }) {
  return [
    'Telos budget · estimated tokens = ceil(UTF-16 code units / 4), a size proxy — not host usage, no proof of SPEC §12 workflow targets',
    'Stored .telos files (raw):',
    ...stored.slice(0, LIMITS.rows).map(fmt),
    ...(stored.length > LIMITS.rows ? [`- … ${stored.length - LIMITS.rows} more files, counted in the total`] : []),
    total('Stored', totals.stored, 'files'),
    'Rendered injections:',
    ...rendered.map(fmt),
    total('Rendered', totals.rendered, 'rows'),
    ...(omitted.length ? ['Omitted:', ...omitted.map((o) => `- ${o.path} · ${o.reason}`)] : ['Omitted: none']),
    'Host usage: not measured; read actual input/output/cache tokens from the host (/context, usage reports)',
    '',
  ].join('\n');
}

/** @type {import('./cli.mjs').Command} */
export const budgetCommand = {
  help: 'Estimated sizes of .telos files and injected text: budget [--ctx <bundle> [args...]]',
  needsTelos: true,
  run({ args, root, stdout, stderr }) {
    let ctx;
    if (args.length) {
      if (args[0] !== '--ctx') throw new UsageError(`unknown argument '${args[0]}'; use --ctx <bundle> [args...]`);
      ctx = args.slice(1);
    }
    let report;
    try {
      report = measure(root, { ctx });
    } catch (err) {
      if (err instanceof UsageError) throw err;
      stderr.write(`telos budget: ${err.message}\n`);
      return 1;
    }
    stdout.write(format(report));
    return 0;
  },
};
