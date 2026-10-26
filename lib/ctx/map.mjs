import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadConfig } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { inspectMap, mapHeader } from '../map.mjs';
import { estimateTokens } from '../map-budget.mjs';
import { renderScan, scanRepo } from '../map-scan.mjs';
import { telosDir } from '../repo.mjs';
import { sections } from '../tasks.mjs';
import { CAP, stripComments } from './index.mjs';

// Bundle for /telos:map (SPEC §6, 03:D-02, D-04, D-06): fixed instructions and MAP validation
// first, optional scan rows last and sized to fit, so cap() never cuts a mandatory line.

const PROJECT_SECTIONS = ['Purpose', 'Rules', 'Conventions', 'Out of scope'];
const INIT_MANAGED = (path) => path.startsWith('.telos/') || path === 'CLAUDE.md' || path === '.gitignore';
const REASONS_MAX = 1200;
const EXCERPT_MAX = 60;
const DIRTY_SHOWN = 5;

const skeleton = (header) => `${header}\n# Map\n\n## Structure\n\n## Entry points\n\n## Flows\n\n## Areas\n\n## Find\n`;
const readTelos = (root, file) => {
  const path = join(telosDir(root), file);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
};

/** @returns {string} `Map validation: …` for the whole saved MAP, reasons bounded */
function validationLine(map, limit) {
  const result = inspectMap(map ?? '', { limit });
  if (!result.errors.length) return result.state === 'built' ? `Map validation: PASS ${result.tokens}/${limit}` : 'Map validation: NOT BUILT';
  let reasons = '';
  let shown = 0;
  for (const error of result.errors) {
    const next = reasons ? `${reasons} | ${error}` : error;
    if (next.length > REASONS_MAX) break;
    reasons = next;
    shown++;
  }
  const more = result.errors.length - shown;
  return `Map validation: FAIL ${reasons}${more ? ` (+${more} more reasons)` : ''}`;
}

/** @returns {string} which PROJECT sections may be drafted and which are authored */
function projectLine(text) {
  const body = sections(stripComments(text ?? ''));
  const draft = [];
  const preserve = [];
  for (const name of PROJECT_SECTIONS) {
    if (!body.has(name)) { draft.push(`${name} (missing)`); continue; }
    const lines = body.get(name).split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length || (lines.length === 1 && lines[0] === '- none')) { draft.push(name); continue; }
    const first = lines[0].length > EXCERPT_MAX ? `${lines[0].slice(0, EXCERPT_MAX - 1)}…` : lines[0];
    preserve.push(`${name} (${JSON.stringify(first)})`);
  }
  return `Project: .telos/PROJECT.md · draft: ${draft.join(', ') || 'none'} · preserve: ${preserve.join(', ') || 'none'}`;
}

/** Dirty paths that change scan input: eligible files and deletions, never init-managed files. */
function sourceChanges(root, scan) {
  const eligible = new Set(scan.files.map((f) => f.path));
  return scan.dirty.filter((path) => !INIT_MANAGED(path) && (eligible.has(path) || !existsSync(join(root, path))));
}

/** Bundle for /telos:map: no arguments; `REFUSED: …` (exit 0) when mapping cannot start. */
export function mapBundle({ root, args, now = new Date() }) {
  if (args.length) throw new UsageError(`ctx map takes no arguments, got '${args.join(' ')}'`);
  if (!existsSync(join(telosDir(root), 'config.json'))) return 'REFUSED: Telos not initialized; run /telos:init first';
  const cfg = loadConfig(root);
  const scan = scanRepo(root);
  if (!scan.head) return 'REFUSED: no HEAD commit; make a first commit of the source, then rerun /telos:map';
  const dirty = sourceChanges(root, scan);
  if (dirty.length) {
    const shown = dirty.slice(0, DIRTY_SHOWN).join(', ') + (dirty.length > DIRTY_SHOWN ? `, +${dirty.length - DIRTY_SHOWN} more` : '');
    return `REFUSED: uncommitted source changes (${shown}); commit or stash them, then rerun /telos:map`;
  }

  const limit = cfg.limits.map_tokens;
  const header = mapHeader({ commit: scan.head, date: now.toISOString().slice(0, 10), files: scan.files.length });
  const needed = estimateTokens(skeleton(header));
  if (needed > limit) {
    return `REFUSED: limits.map_tokens ${limit} is below the ${needed} tokens the MAP skeleton needs; raise it in .telos/config.json`;
  }

  const map = readTelos(root, 'MAP.md');
  const validation = validationLine(map, limit);
  const fixed = [
    validation,
    'Mode: full',
    `Header to write: ${header}`,
    `Map limit: ${limit} estimated tokens = ceil(chars / 4) of the whole file incl. header and final newline; skeleton uses ${needed}`,
    'Write: .telos/MAP.md, replacing the whole file; header on line 1, no "Not built yet" paragraph, then rerun `telos ctx map` until PASS',
    'Headings: # Map · ## Structure · ## Entry points · ## Flows · ## Areas (### per area) · ## Find',
    'Refs: backticked repo-relative paths with /; directories end in /; file ranges `path:start-end`',
    projectLine(readTelos(root, 'PROJECT.md')),
    'Project draft: fill only draftable sections from evidence you read; no rules from the detected stack, no stack or check commands',
    ...(validation === 'Map validation: NOT BUILT' ? [] : ['Existing MAP: .telos/MAP.md (read it once to keep authored text and for rollback)']),
  ].join('\n');

  const rows = [];
  let used = fixed.length + '\nSuggestions:'.length;
  for (const s of scan.suggestions) {
    const row = `- ${s.path}:${s.start}-${s.end} (${s.reason})`;
    if (used + row.length + 1 > CAP - 200) break;
    rows.push(row);
    used += row.length + 1;
  }
  const omitted = scan.suggestions.length - rows.length;
  const suggestions = ['Suggestions:', ...(rows.length ? rows : ['- none']), ...(omitted ? [`(${omitted} omitted)`] : [])].join('\n');

  const head = `${fixed}\n${suggestions}\nScan:\n`;
  let detail;
  try { detail = renderScan(scan, Math.min(8000, CAP - head.length)).trimEnd(); }
  catch (err) {
    if (!(err instanceof RangeError)) throw err;
    detail = 'not included (budget); run `telos map-scan` for the report';
  }
  return `${head}${detail}`;
}
