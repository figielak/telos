#!/usr/bin/env node
// Runs the campaign in batches, one per 5-hour usage window (PROTOCOL amendment of 2026-11-04, change 6).
// Each batch reruns the same command with the same --out and --seed and a higher --cap-usd; cells with a record are skipped.
// Stops for good on anything but a batch end or a usage limit. `touch <out>.stop` stops it before the next batch.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const env = process.env;
const TREE = env.BENCH_TREE;
const OUT = env.BENCH_OUT;
const CONFIG = env.BENCH_CONFIG;
const TOKEN_FILE = env.BENCH_TOKEN_FILE;
const CELL = Number(env.BENCH_CELL_USD ?? 6.92);
const CAP = Number(env.BENCH_CAP_USD ?? 216);
const SEED = env.BENCH_SEED ?? '709';
const START_LIMIT = Number(env.BENCH_START_LIMIT_USD ?? 8); // a new block starts only while the batch has spent at most this
const WINDOW_MS = Number(env.BENCH_WINDOW_MS ?? (5 * 60 + 5) * 60_000);
const CELLS = Number(env.BENCH_CELLS ?? 120);
const RUNNER = env.BENCH_RUNNER ? env.BENCH_RUNNER.split(' ') : ['node', 'bench/run.mjs'];
const BLOCK = 4 * CELL;

const log = (s) => { const line = `${new Date().toISOString()} ${s}`; console.log(line); appendFileSync(`${OUT}.batches.log`, `${line}\n`); };
const spent = () => (existsSync(join(OUT, 'spend.jsonl'))
  ? readFileSync(join(OUT, 'spend.jsonl'), 'utf8').split('\n').filter(Boolean).reduce((s, l) => s + (JSON.parse(l).usd ?? 0), 0) : 0);
const done = () => (existsSync(join(OUT, 'records')) ? readdirSync(join(OUT, 'records')).filter((f) => f.endsWith('.json')).length : 0);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

for (let batch = 1; ; batch++) {
  if (existsSync(`${OUT}.stop`)) { log(`stop file found before batch ${batch}; ${done()} of ${CELLS} cells, $${spent().toFixed(2)}`); process.exit(0); }
  const before = spent();
  const cap = Math.min(CAP, before + START_LIMIT + BLOCK);
  const started = Date.now();
  log(`batch ${batch} start: ${done()} of ${CELLS} cells, spent $${before.toFixed(2)}, --cap-usd ${cap.toFixed(2)}`);
  const r = spawnSync(RUNNER[0], [...RUNNER.slice(1), '--manifest', 'bench/corpus', '--seed', SEED, '--cap-usd', cap.toFixed(2), '--cell-usd', String(CELL), '--out', OUT, '--config', CONFIG],
    { cwd: TREE, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...env, CLAUDE_CODE_OAUTH_TOKEN: readFileSync(TOKEN_FILE, 'utf8').trim() } });
  appendFileSync(`${OUT}.run.log`, `${r.stdout ?? ''}${r.stderr ?? ''}`);
  const stopped = /^stopped: (.*)$/m.exec(r.stderr ?? '')?.[1] ?? null;
  log(`batch ${batch} end: exit ${r.status}, ${done()} of ${CELLS} cells, spent $${spent().toFixed(2)}, stopped: ${stopped ?? 'no'}`);
  if (r.status === 0 && done() >= CELLS) { log('campaign complete'); process.exit(0); }
  // the runner reports a batch end as a `cap:` stop against this batch's own cap; only the campaign's cap or no progress ends the run
  const batchEnd = stopped?.startsWith('cap:') && cap < CAP && spent() > before;
  if (stopped && !stopped.startsWith('usage-limit') && !batchEnd) { log(`halted: ${stopped}`); process.exit(1); }
  if (r.status !== 0 && r.status !== 1) { log(`halted: runner exit ${r.status}`); process.exit(1); }
  if (!stopped && cap >= CAP) { log(`halted: the $${CAP} cap left blocks unrun`); process.exit(1); }
  const wait = Math.max(0, started + WINDOW_MS - Date.now());
  log(`waiting ${(wait / 60000).toFixed(0)} min for the next window`);
  await sleep(wait);
}
