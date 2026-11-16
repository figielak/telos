import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { DEFAULTS, load as loadConfig, validate, write as writeConfig } from './config.mjs';
import { detect } from './detect.mjs';
import { UsageError } from './errors.mjs';
import { telosDir } from './repo.mjs';
import { render } from './template.mjs';

// `telos init` (D-05): creates missing files, keeps existing ones (D-08), syncs the rules block
// into AGENTS.md (D-06, 14:D1), which every agent reads, and makes CLAUDE.md import it instead
// of holding its own copy. Never calls git and never creates empty directories.

/** Start marker of the Telos block, with or without ` vN` (D-06). */
export const BLOCK_START = /<!-- telos:start(?: v(\d+))? -->/;

export const BLOCK_END = '<!-- telos:end -->';
/** Claude Code reads AGENTS.md only through this import line in CLAUDE.md (14:D1). */
export const IMPORT = '@AGENTS.md';
const CACHE_IGNORE = '.telos/.cache/';
const NEXT_MAP = 'run /telos:map to map the existing code';
const NEXT_PLAN = 'plan the first phase with /telos:plan';

/** Files that do not count as "existing code" when choosing Next. */
const NOT_CODE = /^(readme|license|licence|changelog|claude)(\..*)?$|^(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|pyproject\.toml|uv\.lock|poetry\.lock|requirements.*\.txt|tsconfig.*\.json)$/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '__pycache__']);

/** @returns {boolean} whether the repo holds any file beyond docs, manifests and dotfiles */
export function hasCode(root, depth = 4) {
  const walk = (dir, level) => readdirSync(dir, { withFileTypes: true }).some((e) => {
    if (e.name.startsWith('.')) return false;
    if (e.isDirectory()) return level < depth && !SKIP_DIRS.has(e.name) && walk(join(dir, e.name), level + 1);
    return e.isFile() && !NOT_CODE.test(e.name);
  });
  return walk(root, 0);
}

/** Telos files with their render variables. */
const memoryFiles = (vars) => [
  ['PROJECT.md', { name: vars.name }],
  ['MAP.md', {}],
  ['ROADMAP.md', {}],
  ['STATUS.md', { next: vars.next }],
  ['HISTORY.md', { date: vars.date }],
];

/**
 * @returns {{ start: number, end: number } | null} the Telos block's span, its newline included
 * @throws {Error} a start marker without an end marker
 */
function blockSpan(text, file) {
  const start = BLOCK_START.exec(text);
  if (!start) return null;
  const end = text.indexOf(BLOCK_END, start.index);
  if (end < 0) throw new Error(`${file} has '${start[0]}' without '${BLOCK_END}'; fix it by hand, then rerun`);
  let after = end + BLOCK_END.length;
  if (text[after] === '\n') after += 1;
  return { start: start.index, end: after };
}

/** @returns {string} file content with exactly one current Telos block */
export function syncBlock(text, block, file = 'AGENTS.md') {
  if (text === null) return block;
  const span = blockSpan(text, file);
  if (!span) return text.trim() ? `${text.trimEnd()}\n\n${block}` : block;
  return text.slice(0, span.start) + block + text.slice(span.end);
}

const hasImport = (text) => text.split('\n').some((line) => line.trim() === IMPORT);

/**
 * CLAUDE.md with no Telos block of its own and one `@AGENTS.md` import: an old block (v4 and
 * earlier) is replaced by the import in place, else the import is appended.
 * @returns {string}
 */
export function syncImport(text) {
  if (text === null || !text.trim()) return `${IMPORT}\n`;
  const span = blockSpan(text, 'CLAUDE.md');
  if (!span) return hasImport(text) ? text : `${text.trimEnd()}\n\n${IMPORT}\n`;
  const before = text.slice(0, span.start);
  let after = text.slice(span.end);
  if (!hasImport(before + after)) return `${before}${IMPORT}\n${after}`;
  if (!before.trim()) return after.replace(/^\n+/, '');
  if (!after.trim()) return `${before.trimEnd()}\n`;
  if (before.endsWith('\n\n')) after = after.replace(/^\n+/, '');
  return `${before}${after}`;
}

/** @returns {boolean} whether both paths exist and name the same file (e.g. a CLAUDE.md symlink) */
function sameFile(a, b) {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

const today = () => new Date().toLocaleDateString('sv-SE');

/**
 * @param {string} root repo root
 * @param {{ stack?: string[], checks?: Record<string, string>, force?: boolean }} [opts] `force` rewrites an
 *   existing config.json in the current format, keeping its values; stack/checks override them
 * @returns {{ created: string[], updated: string[], kept: string[], next: string }}
 * @throws {UsageError} invalid options; {Error} conflicting state (nothing is written)
 */
export function init(root, opts = {}) {
  const { force = false } = opts;
  const dir = telosDir(root);
  const configPath = join(dir, 'config.json');
  const hasConfig = existsSync(configPath);

  const detection = detect(root);
  const base = hasConfig && force ? loadConfig(root) : { ...structuredClone(DEFAULTS), stack: detection.stack, checks: detection.checks };
  const cfg = { ...base, version: DEFAULTS.version, stack: opts.stack ?? base.stack, checks: opts.checks ?? base.checks };
  const errors = validate(cfg);
  if (errors.length) throw new UsageError(errors.join('; '));

  const next = hasCode(root) ? NEXT_MAP : NEXT_PLAN;
  const vars = { name: detection.name, next, date: today() };

  // Plan every write first, so a conflict leaves the repo untouched.
  /** @type {[string, string, 'created' | 'updated'][]} */
  const writes = [];
  const kept = [];
  for (const [file, fileVars] of memoryFiles(vars)) {
    const path = join(dir, file);
    if (existsSync(path)) kept.push(file);
    else writes.push([path, render(file, fileVars), 'created']);
  }

  const agentsPath = join(root, 'AGENTS.md');
  const claudePath = join(root, 'CLAUDE.md');
  const readOrNull = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
  const plan = (path, rel, before, after) => {
    if (after === before) kept.push(rel);
    else writes.push([path, after, before === null ? 'created' : 'updated']);
  };
  const agentsOld = readOrNull(agentsPath);
  plan(agentsPath, 'AGENTS.md', agentsOld, syncBlock(agentsOld, render('agents-block.md', {})));
  // A CLAUDE.md that links to AGENTS.md already shows the block; importing would read it twice.
  if (sameFile(claudePath, agentsPath)) kept.push('CLAUDE.md');
  else {
    const claudeOld = readOrNull(claudePath);
    plan(claudePath, 'CLAUDE.md', claudeOld, syncImport(claudeOld));
  }

  const ignorePath = join(root, '.gitignore');
  const ignoreOld = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : null;
  if (ignoreOld?.split('\n').some((l) => l.trim() === CACHE_IGNORE)) kept.push('.gitignore');
  else {
    const base = ignoreOld === null ? '' : ignoreOld.endsWith('\n') || !ignoreOld ? ignoreOld : `${ignoreOld}\n`;
    writes.push([ignorePath, `${base}${CACHE_IGNORE}\n`, ignoreOld === null ? 'created' : 'updated']);
  }

  const result = { created: [], updated: [], kept, next };
  mkdirSync(dir, { recursive: true });
  if (!hasConfig || force) {
    writeConfig(root, cfg);
    result[hasConfig ? 'updated' : 'created'].unshift('config.json');
  } else kept.unshift('config.json');
  for (const [path, text, kind] of writes) {
    writeFileSync(path, text);
    result[kind].push(path.startsWith(dir) ? path.slice(dir.length + 1) : path.slice(root.length + 1));
  }
  return result;
}

/** @type {import('./cli.mjs').Command} */
export const initCommand = {
  help: 'Create .telos/ memory files: init [--stack a,b] [--checks <json>] [--force]',
  run({ args, root, cwd, stdout, stderr }) {
    let values;
    try {
      ({ values } = parseArgs({ args, options: {
        stack: { type: 'string' }, checks: { type: 'string' }, force: { type: 'boolean' },
      } }));
    } catch (e) {
      throw new UsageError(e.message);
    }

    let checks;
    if (values.checks !== undefined) {
      try {
        checks = JSON.parse(values.checks);
      } catch (e) {
        throw new UsageError(`--checks is not valid JSON: ${e.message}`);
      }
    }
    const stack = values.stack?.split(',').map((s) => s.trim()).filter(Boolean);

    let r;
    try {
      r = init(root ?? cwd, { stack, checks, force: values.force });
    } catch (e) {
      if (e instanceof UsageError) throw e;
      stderr.write(`telos init: ${e.message}\n`);
      return 1;
    }
    const lines = [];
    if (r.created.length) lines.push(`Created: ${r.created.join(', ')}`);
    if (r.updated.length) lines.push(`Updated: ${r.updated.join(', ')}`);
    if (r.kept.length) lines.push(`Kept: ${r.kept.join(', ')}`);
    lines.push(`Next: ${r.next}`, 'Commit when ready: docs(telos): initialize telos');
    stdout.write(`${lines.join('\n')}\n`);
    return 0;
  },
};
