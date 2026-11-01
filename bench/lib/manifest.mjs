import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { UsageError } from '../../lib/errors.mjs';

// Benchmark manifest (bench/PROTOCOL.md §3–§4): repositories and tasks as JSON, validated before any run.

export const VARIANTS = Object.freeze(['A', 'B', 'C', 'D']);
export const DEFAULT_REPETITIONS = 5;
const FILE = 'manifest.json';
const ID = /^[a-z0-9][a-z0-9-]*$/;
const HEX = /^[a-f0-9]{40}$/;

class ManifestError extends UsageError {}

const fail = (field, why) => { throw new ManifestError(`${FILE}: ${field}: ${why}`); };
const text = (value, field) => { if (typeof value !== 'string' || !value.trim()) fail(field, 'required non-empty string'); return value; };

function inside(dir, value, field) {
  const path = resolve(dir, text(value, field));
  const rel = relative(dir, path);
  if (isAbsolute(value) || rel.startsWith('..') || rel === '') fail(field, `path must be inside the manifest directory (${value})`);
  if (!existsSync(path)) fail(field, `file not found (${value})`);
  return value;
}

function task(raw, i, repos, seen, dir) {
  const at = `tasks[${i}]`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(at, 'must be an object');
  const id = text(raw.id, `${at}.id`);
  if (!ID.test(id)) fail(`${at}.id`, `must match ${ID} (${id})`);
  if (seen.has(id)) fail(`${at}.id`, `duplicate task id ${id}`);
  seen.add(id);
  const repo = text(raw.repo, `${at}.repo`);
  if (!repos.has(repo)) fail(`${at}.repo`, `unknown repo ${repo}`);
  for (const field of ['start', 'reference']) {
    if (!HEX.test(text(raw[field], `${at}.${field}`))) fail(`${at}.${field}`, 'must be a 40-character lowercase hex commit');
  }
  if (raw.type !== 'single' && raw.type !== 'multi') fail(`${at}.type`, 'must be "single" or "multi"');
  if (raw.prompt !== undefined && raw.steps !== undefined) fail(at, 'a task has either prompt or steps, not both');
  const out = { id, repo, start: raw.start, reference: raw.reference, type: raw.type };
  if (raw.type === 'single') {
    if (raw.steps !== undefined) fail(`${at}.type`, '"single" needs prompt, not steps');
    out.prompt = text(raw.prompt, `${at}.prompt`);
  } else {
    if (raw.prompt !== undefined) fail(`${at}.type`, '"multi" needs steps, not prompt');
    if (!Array.isArray(raw.steps) || !raw.steps.length) fail(`${at}.steps`, 'required non-empty array');
    out.steps = raw.steps.map((s, j) => text(s, `${at}.steps[${j}]`));
  }
  if (!Array.isArray(raw.expectedPaths) || !raw.expectedPaths.length) fail(`${at}.expectedPaths`, 'required non-empty array');
  out.expectedPaths = raw.expectedPaths.map((p, j) => text(p, `${at}.expectedPaths[${j}]`));
  out.acceptance = inside(dir, raw.acceptance, `${at}.acceptance`);
  out.b = inside(dir, raw.b, `${at}.b`);
  return out;
}

/** Load `<dir>/manifest.json` → `{ dir, repos, tasks, repetitions }`; a bad manifest is a UsageError naming file and field. */
export function loadManifest(dir) {
  const path = join(dir, FILE);
  let json;
  try { json = JSON.parse(readFileSync(path, 'utf8')); } catch (err) {
    throw new ManifestError(`${FILE}: cannot read ${path} as JSON (${err.code ?? err.message})`);
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) fail('(root)', 'must be an object');
  const repetitions = json.repetitions ?? DEFAULT_REPETITIONS;
  if (!Number.isInteger(repetitions) || repetitions < 1) fail('repetitions', 'must be a positive integer');
  if (json.variants !== undefined && JSON.stringify(json.variants) !== JSON.stringify(VARIANTS)) {
    fail('variants', `must be exactly ${VARIANTS.join(', ')} (PROTOCOL §1)`);
  }
  if (!Array.isArray(json.repos) || !json.repos.length) fail('repos', 'required non-empty array');
  const ids = new Set();
  const repos = json.repos.map((r, i) => {
    const id = text(r?.id, `repos[${i}].id`);
    if (!ID.test(id)) fail(`repos[${i}].id`, `must match ${ID} (${id})`);
    if (ids.has(id)) fail(`repos[${i}].id`, `duplicate repo id ${id}`);
    ids.add(id);
    return { id, url: text(r.url, `repos[${i}].url`) };
  });
  if (!Array.isArray(json.tasks) || !json.tasks.length) fail('tasks', 'required non-empty array');
  const seen = new Set();
  const tasks = json.tasks.map((t, i) => task(t, i, ids, seen, dir));
  return { dir, repos, tasks, repetitions };
}
