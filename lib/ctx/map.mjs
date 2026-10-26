import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadConfig } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { diffNameStatus, refExists } from '../git.mjs';
import { inspectMap, mapHeader } from '../map.mjs';
import { estimateTokens } from '../map-budget.mjs';
import { planRefresh } from '../map-refresh.mjs';
import { renderScan, scanRepo } from '../map-scan.mjs';
import { telosDir } from '../repo.mjs';
import { sections } from '../tasks.mjs';
import { CAP, stripComments } from './index.mjs';

// Bundle for /telos:map (SPEC §6, 03:D-02, D-04, D-05, D-06): fixed instructions and MAP
// validation first, affected blocks whole, optional scan rows last and sized to fit, so cap()
// never cuts a mandatory line.

const PROJECT_SECTIONS = ['Purpose', 'Rules', 'Conventions', 'Out of scope'];
const INIT_MANAGED = (path) => path.startsWith('.telos/') || path === 'CLAUDE.md' || path === '.gitignore';
const REASONS_MAX = 1200;
const EXCERPT_MAX = 60;
const DIRTY_SHOWN = 5;
const CHANGED_MAX = 20;
const SCAN_MIN = 400;
const FULL_WRITE = 'Write: .telos/MAP.md, replacing the whole file; header on line 1, no "Not built yet" paragraph, then rerun `telos ctx map` until PASS';
const WRITES = {
  incremental: 'Write: edit only the Affected blocks of .telos/MAP.md (each replaces exactly its old text) and line 1 with Header to write; every other byte stays identical; then rerun `telos ctx map --refresh` until PASS',
  noop: 'Write: replace only line 1 of .telos/MAP.md with Header to write; the body stays byte for byte; then rerun `telos ctx map --refresh` until PASS',
};

const skeleton = (header) => `${header}\n# Map\n\n## Structure\n\n## Entry points\n\n## Flows\n\n## Areas\n\n## Find\n`;
const readTelos = (root, file) => {
  const path = join(telosDir(root), file);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
};

/** @returns {string} `Map validation: …` for the whole saved MAP, reasons bounded */
function validationLine(result, limit) {
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

/** @returns {{ mode: string, reason?: string, plan?: object, changes?: object[] }} */
function refreshPlan(root, inspected) {
  const commit = inspected.header?.commit;
  const baselineAvailable = Boolean(commit) && refExists(root, commit);
  const { changes, error } = baselineAvailable ? diffNameStatus(root, commit) : { changes: [], error: null };
  const plan = planRefresh({ map: inspected, changes, baselineAvailable, error });
  return { ...plan, changes };
}

/** Suggestions first, by budget; a refresh keeps only changed files. */
function suggestionLines(scan, budget, changedPaths) {
  const pool = changedPaths ? scan.suggestions.filter((s) => changedPaths.has(s.path)) : scan.suggestions;
  const rows = [];
  let used = 'Suggestions:'.length;
  for (const s of pool) {
    const row = `- ${s.path}:${s.start}-${s.end} (${s.reason})`;
    if (used + row.length + 1 > budget) break;
    rows.push(row);
    used += row.length + 1;
  }
  const omitted = pool.length - rows.length;
  return ['Suggestions:', ...(rows.length ? rows : ['- none']), ...(omitted ? [`(${omitted} omitted)`] : [])].join('\n');
}

/** Bundle for /telos:map: no arguments (full) or `--refresh`; `REFUSED: …` (exit 0) when mapping cannot start. */
export function mapBundle({ root, args, now = new Date() }) {
  if (args.length > 1 || (args.length && args[0] !== '--refresh')) {
    throw new UsageError(`ctx map takes no arguments or --refresh, got '${args.join(' ')}'`);
  }
  const refresh = args[0] === '--refresh';
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
  const inspected = inspectMap(map ?? '', { limit });
  const plan = refresh ? refreshPlan(root, inspected) : null;
  if (plan?.mode === 'refused') return `REFUSED: refresh: ${plan.reason} Run /telos:map for a full rebuild.`;
  const mode = plan && plan.mode !== 'full' ? plan.mode : 'full';
  const validation = validationLine(inspected, limit);

  const impact = plan && mode !== 'full'
    ? [`Reason: ${plan.reason}`, `Impact: ${plan.affected}/${plan.total} editable units · blocks: ${plan.blocks.join(', ') || 'none'}`]
    : plan ? [`Reason: refresh fallback: ${plan.reason}`] : [];
  const fixed = [
    validation,
    `Mode: ${mode}`,
    ...impact,
    `Header to write: ${header}`,
    `Map limit: ${limit} estimated tokens = ceil(chars / 4) of the whole file incl. header and final newline; skeleton uses ${needed}`,
    WRITES[mode] ?? FULL_WRITE,
    'Headings: # Map · ## Structure · ## Entry points · ## Flows · ## Areas (### per area) · ## Find',
    'Refs: backticked repo-relative paths with /; directories end in /; file ranges `path:start-end`',
    projectLine(readTelos(root, 'PROJECT.md')),
    mode === 'full'
      ? 'Project draft: fill only draftable sections from evidence you read; no rules from the detected stack, no stack or check commands'
      : 'Project draft: none in refresh; PROJECT.md stays as it is',
    ...(inspected.state === 'not-built' ? [] : ['Existing MAP: .telos/MAP.md (read it once to keep authored text and for rollback)']),
  ];

  let changedPaths = null;
  if (mode === 'incremental') {
    changedPaths = new Set(plan.changes.flatMap((c) => [c.path, c.oldPath].filter(Boolean)));
    const rows = plan.changes.slice(0, CHANGED_MAX).map((c) => `${c.status} ${c.oldPath ? `${c.oldPath} → ` : ''}${c.path}`);
    const more = plan.changes.length - rows.length;
    fixed.push(`Changed: ${rows.join(' · ')}${more ? ` (+${more} more)` : ''}`);
    if (plan.newAreaPaths.length) fixed.push(`New Area candidates: ${plan.newAreaPaths.join(', ')}`);
    const byId = new Map(inspected.blocks.map((b) => [b.id, b]));
    fixed.push(['Affected blocks:', ...plan.blocks.map((id) => `--- block ${id} (replace exactly this text)\n${byId.get(id).text.replace(/([^\n])$/, '$1\n')}--- end ${id}`)].join('\n'));
    const mandatory = fixed.join('\n').length;
    if (mandatory > CAP - SCAN_MIN) {
      return `REFUSED: refresh context needs ${mandatory} chars for the affected blocks (limit ${CAP}); run /telos:map for a full rebuild`;
    }
  }

  const head = fixed.join('\n');
  const suggestions = suggestionLines(scan, CAP - head.length - SCAN_MIN, changedPaths);
  const top = `${head}\n${suggestions}\nScan:\n`;
  let detail;
  try { detail = renderScan(scan, Math.min(8000, CAP - top.length)).trimEnd(); }
  catch (err) {
    if (!(err instanceof RangeError)) throw err;
    detail = 'not included (budget); run `telos map-scan` for the report';
  }
  return `${top}${detail}`;
}
