import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadConfig, requireMessage } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { scanDocs } from '../docs-scan.mjs';
import { telosDir } from '../repo.mjs';
import { CAP, stripComments } from './index.mjs';

// Bundle for /telos:docs (SPEC §11, 05:D-03): target, docs destinations, configured checks and
// MAP pointers first, then the bounded scan rows by priority. Read-only; the skill edits docs.

const MAP_MAX = 8;
const VERDICT_MAX = 170;
const MISSING_DOCS = 'configured documentation missing'; // nothing exists there to be stale
const SAFE_SCOPE = /^[\w@+./-]+$/;
const q = (value) => JSON.stringify(value);

/** @returns {string[]} repeated `--scope path` values; anything else is a usage error */
function parseScopes(args) {
  const scopes = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--scope' || !args[i + 1] || args[i + 1].startsWith('--')) throw new UsageError('usage: ctx docs [--scope path]…');
    // Stricter than the scanner: a scope that could be shell text never reaches the bundle.
    if (!SAFE_SCOPE.test(args[++i])) throw new UsageError(`invalid scope ${q(args[i])}: use letters, digits and . _ - @ + / only`);
    scopes.push(args[i]);
  }
  return scopes;
}

/** @returns {string[]} MAP lines that point at documentation destinations or changed paths */
function mapPointers(root, cfg, changed) {
  const path = join(telosDir(root), 'MAP.md');
  if (!existsSync(path)) return [];
  const map = readFileSync(path, 'utf8');
  if (map.includes('telos-map: not built')) return ['Not built yet: run `/telos:map`; locate docs through the configured destinations only.'];
  const needles = [cfg.docs.readme, ...cfg.docs.paths, ...changed].filter(Boolean).map((p) => p.replace(/\/$/, ''));
  const lines = stripComments(map).split('\n').filter((l) => l.startsWith('- ') && (/\b(docs?|readme)\b/i.test(l) || needles.some((n) => l.includes(n))));
  return lines.slice(0, MAP_MAX);
}

/** Bundle for /telos:docs [--scope path]…. */
export function docsBundle({ root, args }) {
  const scopes = parseScopes(args);
  const cfg = loadConfig(root);
  if (cfg.profile !== 'deep') return `${requireMessage('deep')}\n`;
  let scan;
  try { scan = scanDocs(root, { scopes }); } catch (err) {
    if (err instanceof UsageError) throw err;
    return `REFUSED: ${err.message}\n`;
  }
  const checks = Object.entries(cfg.checks ?? {});
  const phase = /^telos\/(\d{2})-start$/.exec(scan.baseline)[1];
  const head = [
    'Profile: deep',
    `Target: phase ${phase} · scope ${scopes.length ? scopes.map(q).join(', ') : 'none (current phase diff)'}`,
    `Docs: readme=${cfg.docs.readme} · paths=${cfg.docs.paths.join(', ') || 'none'}`,
    `Checks: ${checks.length ? checks.map(([k, v]) => `${k}=${v}`).join(' · ') : 'none configured (never invent build or link commands)'}`,
    'MAP pointers:',
    ...mapPointers(root, cfg, scan.changed),
  ];
  if (head[head.length - 1] === 'MAP pointers:') head.push('none');
  head.push(`Baseline: ${scan.baseline} → HEAD + index + work tree (including untracked); heuristic candidates only`);

  // Rows by priority (lower first): omissions, matches, changed paths, symbols; shown in scan order.
  const rows = [
    { p: 0, text: `Doc matches (${scan.matches.length}):` },
    ...scan.matches.map((m) => ({ p: 2, text: `- ${q(m.path)}:${m.start}-${m.end} — ${m.reasons.map(q).join('; ')}` })),
    { p: 0, text: `Omissions (${scan.omissions.length}):` },
    ...scan.omissions.map((o) => ({ p: 1, text: `- ${q(o.path)}: ${q(o.reason)}` })),
    { p: 0, text: `Changed paths (${scan.changed.length}):` },
    ...scan.changed.map((path) => ({ p: 3, text: `- ${q(path)}` })),
    { p: 0, text: `Symbol candidates (${scan.symbols.length}):` },
    ...scan.symbols.map((s) => ({ p: 4, text: `- ${q(s.name)} in ${q(s.path)}` })),
  ];
  const fixed = head.join('\n').length + VERDICT_MAX + 2;
  const noteRoom = 120;
  let budget = CAP - fixed - noteRoom;
  const keep = new Set();
  for (const p of [0, 1, 2, 3, 4]) {
    for (const [i, row] of rows.entries()) {
      if (row.p !== p || budget < row.text.length + 1) continue;
      keep.add(i);
      budget -= row.text.length + 1;
    }
  }
  const dropped = rows.length - keep.size;
  const body = rows.filter((_, i) => keep.has(i)).map((r) => r.text);
  const note = dropped ? [`Report rows omitted for the bundle cap: ${dropped}; run \`telos docs-scan\` for the full list`] : [];
  const blocking = scan.omissions.filter((o) => o.reason !== MISSING_DOCS);
  const sync = blocking.length || dropped
    ? 'Sync: NOT VERIFIED — scan omissions or omitted report rows; inspect each omitted path or range with targeted reads before claiming docs are synchronized'
    : scan.matches.length
      ? 'Sync: UPDATE — edit only the matched ranges and changed public API docstrings'
      : 'Sync: NO-OP — no documentation candidates; edit nothing';
  return `${[...head, ...body, ...note, sync].join('\n')}\n`;
}
