import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { telosDir } from './repo.mjs';

export const PROFILES = ['minimal', 'standard', 'deep'];

const CHECK_KEYS = ['build', 'types', 'lint', 'test', 'test_related', 'e2e'];

const deepFreeze = (v) => {
  if (v && typeof v === 'object') Object.values(Object.freeze(v)).forEach(deepFreeze);
  return v;
};

/** Canonical schema of `.telos/config.json` (SPEC §4.5); key order is the write order. Deep-frozen. */
export const DEFAULTS = deepFreeze({
  version: 1,
  profile: 'standard',
  files_language: 'en',
  stack: [],
  checks: {},
  docs: { readme: 'README.md', changelog: 'CHANGELOG.md', paths: ['docs/'] },
  protected_configs: ['eslint.config.*', 'biome.json', 'tsconfig.json', 'ruff.toml', 'pyproject.toml#tool.ruff'],
  limits: { status_lines: 40, map_tokens: 1500, history_entries: 30 },
  git: { auto_commit: true, phase_tags: true },
  strict_scope: false,
});

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

/**
 * @param {unknown} cfg merged config
 * @returns {string[]} errors, each starting with the offending key; empty when valid
 */
export function validate(cfg) {
  if (!isObject(cfg)) return ['config: must be a JSON object'];
  const errors = [];
  const err = (key, msg) => errors.push(`${key}: ${msg}`);

  for (const key of Object.keys(cfg)) if (!Object.hasOwn(DEFAULTS, key)) err(key, 'unknown key');
  if (cfg.version !== 1) err('version', 'must be 1');
  if (!PROFILES.includes(cfg.profile)) err('profile', `must be one of ${PROFILES.join(', ')}`);
  if (typeof cfg.files_language !== 'string') err('files_language', 'must be a string');
  if (!isStringArray(cfg.stack)) err('stack', 'must be an array of strings');

  if (!isObject(cfg.checks)) err('checks', 'must be an object');
  else for (const [key, cmd] of Object.entries(cfg.checks)) {
    if (!CHECK_KEYS.includes(key)) err(`checks.${key}`, `unknown check (known: ${CHECK_KEYS.join(', ')})`);
    else if (typeof cmd !== 'string' || !cmd.trim()) err(`checks.${key}`, 'must be a non-empty string');
  }

  if (!isObject(cfg.docs)) err('docs', 'must be an object');
  else {
    for (const key of ['readme', 'changelog']) {
      if (typeof cfg.docs[key] !== 'string') err(`docs.${key}`, 'must be a string');
    }
    if (!isStringArray(cfg.docs.paths)) err('docs.paths', 'must be an array of strings');
  }

  if (!isStringArray(cfg.protected_configs)) err('protected_configs', 'must be an array of strings');

  if (!isObject(cfg.limits)) err('limits', 'must be an object');
  else for (const key of Object.keys(DEFAULTS.limits)) {
    const n = cfg.limits[key];
    if (!Number.isInteger(n) || n <= 0) err(`limits.${key}`, 'must be a positive integer');
  }

  if (!isObject(cfg.git)) err('git', 'must be an object');
  else for (const key of Object.keys(DEFAULTS.git)) {
    if (typeof cfg.git[key] !== 'boolean') err(`git.${key}`, 'must be a boolean');
  }

  if (typeof cfg.strict_scope !== 'boolean') err('strict_scope', 'must be a boolean');
  return errors;
}

/** Objects merge key by key; arrays and scalars from `over` replace `base`. */
function merge(base, over) {
  if (!isObject(base) || !isObject(over)) return structuredClone(over);
  const out = structuredClone(base);
  for (const [key, value] of Object.entries(over)) out[key] = key in out ? merge(out[key], value) : value;
  return out;
}

/** Reorder object keys to follow `template`, unknown keys last. */
function ordered(value, template) {
  if (!isObject(value)) return value;
  const keyOrder = isObject(template) ? Object.keys(template) : [];
  if (template === DEFAULTS.checks) keyOrder.push(...CHECK_KEYS);
  const keys = [...keyOrder.filter((k) => k in value), ...Object.keys(value).filter((k) => !keyOrder.includes(k))];
  return Object.fromEntries(keys.map((k) => [k, ordered(value[k], isObject(template) ? template[k] : undefined)]));
}

const configPath = (root) => join(telosDir(root), 'config.json');

/**
 * Read `.telos/config.json`, merge it over DEFAULTS and validate.
 * @param {string} root repo root
 * @throws {Error} on unreadable JSON or any validation error (all listed)
 */
export function load(root) {
  const path = configPath(root);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot read ${path}: ${e.message}`);
  }
  const cfg = merge(DEFAULTS, raw);
  const errors = validate(cfg);
  if (errors.length) throw new Error(`Invalid ${path}: ${errors.join('; ')}`);
  return cfg;
}

/**
 * Write the config as 2-space JSON in SPEC key order.
 * @param {string} root repo root
 * @param {object} cfg
 */
export function write(root, cfg) {
  mkdirSync(telosDir(root), { recursive: true });
  writeFileSync(configPath(root), `${JSON.stringify(ordered(cfg, DEFAULTS), null, 2)}\n`);
}

/** @returns {boolean} whether the config's profile includes `profile` */
export function atLeast(cfg, profile) {
  return PROFILES.indexOf(cfg.profile) >= PROFILES.indexOf(profile);
}

/** One-line reply for commands outside the current profile (SPEC §3). */
export function requireMessage(profile) {
  return `Requires ${profile} profile. Switch with /telos:profile ${profile}.`;
}
