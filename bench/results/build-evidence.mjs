#!/usr/bin/env node
// Builds the published evidence of the campaign from its raw records and transcripts (PROTOCOL §10, task 07-09):
// bench/results/rows/<cell>.json, bench/results/runs/<cell>/ (record, patch, grading output, sanitized transcripts), the
// setup figures for report.mjs (protocol.json) and the redaction counts (redaction-hits.json).
// usage: node bench/results/build-evidence.mjs <raw out dir> <config json>
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadManifest } from '../lib/manifest.mjs';
import { rowFromRecord } from '../lib/metrics.mjs';
import { sanitize } from '../lib/sanitize.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const [rawOut, configFile] = args;
const config = JSON.parse(readFileSync(configFile, 'utf8'));
const CFG = join(config.workDir, 'config');
const SNAP = join(config.workDir, 'snapshots');
const RUNS = join(HERE, 'runs');
const ROWS = join(HERE, 'rows');
const ctx = { home: process.env.HOME, user: process.env.USER, workDir: config.workDir };
const manifest = loadManifest(resolve(HERE, '..', 'corpus'));

const totals = {};
const perFile = {};
const count = (file, hits) => {
  for (const [k, v] of Object.entries(hits)) {
    totals[k] = (totals[k] ?? 0) + v;
    (perFile[file] ??= {})[k] = (perFile[file]?.[k] ?? 0) + v;
  }
};

/**
 * `sanitize`, then two rules of this publication: what is left of a home path, and an `@domain` with no local part,
 * so that the task's check for `/home/` and `@host.tld` passes on patches of real repositories too.
 */
function clean(text, file) {
  const r = sanitize(text, ctx);
  const hits = { ...r.hits };
  const sub = (rule, re, to) => { r.text = r.text.replace(re, () => { hits[rule] = (hits[rule] ?? 0) + 1; return to; }); };
  sub('home_prefix', /\/home\//g, '<HOMEDIR>/');
  sub('at_domain', /@[a-z0-9.-]+\.[a-z]{2,}/g, '@<DOMAIN>');
  count(file, hits);
  // braces, not angle brackets: the §8.4 classifier reads `>` in a command as a write, which would change its result
  return r.text.replace(/<(WORKDIR|HOME|USER|EMAIL|SECRET|HOMEDIR|DOMAIN)>/g, '{$1}');
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** JSONL line by line; a line that parsed before must still parse after. */
function cleanJsonl(text, file) {
  return text.split('\n').map((line) => {
    if (!line) return line;
    const out = clean(line, file);
    let parsed = true;
    try { JSON.parse(line); } catch { parsed = false; }
    if (parsed) JSON.parse(out); // throws: never publish a broken line
    return out;
  }).join('\n');
}

const sessionDirOf = (cell) => {
  const root = join(CFG, cell, 'projects');
  if (!existsSync(root)) return null;
  const subs = readdirSync(root);
  if (subs.length !== 1) throw new Error(`${cell}: expected one project dir, found ${subs.length}`);
  return join(root, subs[0]);
};

function copyTranscripts(from, to, label) {
  if (!from) return;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) {
        const rel = relative(from, p);
        write(join(to, 'transcripts', rel), cleanJsonl(readFileSync(p, 'utf8'), `${label}/transcripts/${rel}`));
      }
    }
  };
  walk(from);
}

rmSync(RUNS, { recursive: true, force: true });
rmSync(ROWS, { recursive: true, force: true });
mkdirSync(ROWS, { recursive: true });

const interruptedDir = join(rawOut, 'interrupted');
const interrupted = existsSync(interruptedDir) ? readdirSync(interruptedDir).map((f) => JSON.parse(readFileSync(join(interruptedDir, f), 'utf8'))) : [];
const records = readdirSync(join(rawOut, 'records')).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(join(rawOut, 'records', f), 'utf8')));

const mismatches = [];
const byteDrift = [];
for (const record of records) {
  const { cell } = record;
  const task = manifest.tasks.find((t) => t.id === record.task);
  const dir = sessionDirOf(cell);
  const row = rowFromRecord(record, { transcriptsDir: dir, expectedPaths: task.expectedPaths });
  // PROTOCOL §7.2: a usage-limit attempt is not a run outcome, but its cost counts. Its transcripts were replaced by the rerun.
  const lost = interrupted.filter((i) => i.cell === cell);
  if (lost.length) {
    const attempts = lost.flatMap((i) => (i.sessions ?? []).flatMap((s) => s.attempts ?? [s]));
    const add = (field, get) => { row[field] += attempts.reduce((s, a) => s + (get(a) ?? 0), 0); };
    row.interrupted_usd = lost.reduce((s, i) => s + (i.spentUsd ?? 0), 0);
    row.cost_usd += row.interrupted_usd;
    add('input', (a) => a.usage?.input_tokens);
    add('cache_creation', (a) => a.usage?.cache_creation_input_tokens);
    add('output', (a) => a.usage?.output_tokens);
    add('cache_read', (a) => a.usage?.cache_read_input_tokens);
    add('turns', (a) => a.turns);
    add('wall_ms', (a) => a.ms);
    row.fresh = row.input + row.cache_creation;
    row.sessions += lost.reduce((s, i) => s + (i.sessions?.length ?? 0), 0);
    row.attempts += attempts.length;
  }
  write(join(ROWS, `${cell}.json`), `${clean(JSON.stringify(row, null, 2), `rows/${cell}.json`)}\n`);

  const out = join(RUNS, cell);
  const { patch = '', ...rest } = record;
  write(join(out, 'patch.diff'), clean(patch, `runs/${cell}/patch.diff`));
  const grading = [record.firstAcceptance ? `first grading: exit ${record.firstAcceptance.exit}\n${record.firstAcceptance.tail}\n\nregrade: ` : '',
    record.acceptance ? `exit ${record.acceptance.exit}\n${record.acceptance.tail}\n` : 'not graded\n'].join('');
  write(join(out, 'grading.txt'), clean(grading, `runs/${cell}/grading.txt`));
  const published = clean(JSON.stringify(rest, null, 2), `runs/${cell}/record.json`);
  write(join(out, 'record.json'), `${published}\n`);
  copyTranscripts(dir, out, `runs/${cell}`);
  lost.forEach((i, n) => write(join(out, `interrupted-attempt-${n + 1}.json`),
    `${clean(JSON.stringify(i, null, 2), `runs/${cell}/interrupted-attempt-${n + 1}.json`)}\n`));

  // metrics recompute from what is published, for everything that does not depend on the lost transcripts
  const again = rowFromRecord(JSON.parse(published), { transcriptsDir: join(out, 'transcripts'), expectedPaths: task.expectedPaths });
  const base = lost.length ? rowFromRecord(record, { transcriptsDir: dir, expectedPaths: task.expectedPaths }) : row;
  for (const key of ['cost_usd', 'fresh', 'cache_read', 'turns', 'explore_calls', 'explore_unclassified', 'accepted', 'status', 'unverified']) {
    if (JSON.stringify(again[key]) !== JSON.stringify(base[key])) mismatches.push(`${cell}.${key}: ${again[key]} != ${base[key]}`);
  }
  // redaction changes text length, so returned bytes can only match within a tolerance
  if (base.explore_bytes) byteDrift.push(Math.abs(again.explore_bytes - base.explore_bytes) / base.explore_bytes);
}

// setup sessions: one per snapshot; the figures report.mjs needs through --protocol
const setup = {};
for (const file of readdirSync(SNAP).filter((f) => f.endsWith('.json')).sort()) {
  const meta = JSON.parse(readFileSync(join(SNAP, file), 'utf8'));
  const cell = `setup.${meta.key}`;
  const dir = sessionDirOf(cell);
  const session = { sessionId: meta.record.sessionId, costUsd: meta.record.costUsd, usage: meta.record.usage };
  const row = rowFromRecord({ cell, sessions: [session], status: 'completed' }, { transcriptsDir: dir });
  setup[meta.key] = { usd: meta.record.costUsd, fresh: row.fresh, explore_calls: row.explore_calls };
  const out = join(RUNS, cell);
  write(join(out, 'setup.json'), `${clean(JSON.stringify(meta, null, 2), `runs/${cell}/setup.json`)}\n`);
  copyTranscripts(dir, out, `runs/${cell}`);
}
writeFileSync(join(HERE, 'protocol.json'), `${JSON.stringify({ setup }, null, 2)}\n`);

const maxByteDrift = byteDrift.length ? Math.max(...byteDrift) : 0;
writeFileSync(join(HERE, 'redaction-hits.json'), `${clean(JSON.stringify({ totals, maxExploreBytesDrift: maxByteDrift, perFile }, null, 2), 'redaction-hits.json')}\n`);
console.log(JSON.stringify({ cells: records.length, setups: Object.keys(setup).length, totals, maxByteDrift, mismatches }, null, 2));
if (mismatches.length) process.exitCode = 1;
