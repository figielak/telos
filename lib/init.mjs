import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { DEFAULTS, PROFILES, atLeast, load as loadConfig, validate, write as writeConfig } from './config.mjs';
import { BLOCK_START } from './ctx/init.mjs';
import { detect } from './detect.mjs';
import { UsageError } from './errors.mjs';
import { telosDir } from './repo.mjs';
import { render } from './template.mjs';

// Deterministic part of /telos:init (D-05): creates missing files, keeps existing ones (D-08),
// syncs the CLAUDE.md block (D-06). Never calls git and never creates empty directories.

const BLOCK_END = '<!-- telos:end -->';
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

/** Telos files per profile with their render variables (SPEC §3, §4). */
function profileFiles(profile, vars) {
  const files = [
    ['PROJECT.md', { name: vars.name }],
    ['MAP.md', {}],
    ['ROADMAP.md', {}],
    ['STATUS.md', { next: vars.next }],
  ];
  if (atLeast({ profile }, 'standard')) {
    files.push(['HISTORY.md', { date: vars.date, profile }], ['LESSONS.md', {}]);
  }
  return files;
}

/** @returns {string} CLAUDE.md content with exactly one current Telos block */
export function syncBlock(text, block) {
  if (text === null) return block;
  const start = BLOCK_START.exec(text);
  if (!start) return `${text.trimEnd()}\n\n${block}`;
  const end = text.indexOf(BLOCK_END, start.index);
  if (end < 0) throw new Error(`CLAUDE.md has '${start[0]}' without '${BLOCK_END}'; fix it by hand, then rerun`);
  let after = end + BLOCK_END.length;
  if (text[after] === '\n') after += 1;
  return text.slice(0, start.index) + block + text.slice(after);
}

const today = () => new Date().toLocaleDateString('sv-SE');

/**
 * @param {string} root repo root
 * @param {{ profile: string, stack?: string[], checks?: Record<string, string>, force?: boolean }} opts
 * @returns {{ created: string[], updated: string[], kept: string[], next: string }}
 * @throws {UsageError} invalid options; {Error} conflicting state (nothing is written)
 */
export function init(root, opts) {
  const { profile, force = false } = opts;
  if (!PROFILES.includes(profile)) throw new UsageError(`--profile must be one of ${PROFILES.join(', ')}`);
  const dir = telosDir(root);
  const configPath = join(dir, 'config.json');
  const hasConfig = existsSync(configPath);

  if (hasConfig && !force) {
    const current = loadConfig(root).profile;
    if (current !== profile) throw new Error(`already initialized with profile ${current}; use /telos:profile ${profile} or --force`);
  }

  const detection = detect(root);
  const cfg = {
    ...structuredClone(DEFAULTS),
    profile,
    stack: opts.stack ?? detection.stack,
    checks: opts.checks ?? detection.checks,
  };
  const errors = validate(cfg);
  if (errors.length) throw new UsageError(errors.join('; '));

  const next = hasCode(root) ? NEXT_MAP : NEXT_PLAN;
  const vars = { name: detection.name, next, date: today() };

  // Plan every write first, so a conflict leaves the repo untouched.
  /** @type {[string, string, 'created' | 'updated'][]} */
  const writes = [];
  const kept = [];
  for (const [file, fileVars] of profileFiles(profile, vars)) {
    const path = join(dir, file);
    if (existsSync(path)) kept.push(file);
    else writes.push([path, render(file, fileVars), 'created']);
  }

  const claudePath = join(root, 'CLAUDE.md');
  const claudeOld = existsSync(claudePath) ? readFileSync(claudePath, 'utf8') : null;
  const claudeNew = syncBlock(claudeOld, render('claude-block.md', {}));
  if (claudeNew === claudeOld) kept.push('CLAUDE.md');
  else writes.push([claudePath, claudeNew, claudeOld === null ? 'created' : 'updated']);

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
  help: 'Create .telos/ for a profile: init --profile <p> [--stack a,b] [--checks <json>] [--force]',
  run({ args, root, cwd, stdout, stderr }) {
    let values;
    try {
      ({ values } = parseArgs({ args, options: {
        profile: { type: 'string' }, stack: { type: 'string' }, checks: { type: 'string' }, force: { type: 'boolean' },
      } }));
    } catch (e) {
      throw new UsageError(e.message);
    }
    if (!values.profile) throw new UsageError('--profile is required');

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
      r = init(root ?? cwd, { profile: values.profile, stack, checks, force: values.force });
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
