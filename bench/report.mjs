#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { UsageError } from '../lib/errors.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { aggregate, toCsv, toMarkdown } from './lib/report.mjs';

// Report generator (bench/README.md "Report"): metric rows + manifest → runs.csv and tables.md. Exit 0 ok, 1 failure, 2 usage.

const USAGE = 'usage: node bench/report.mjs --rows <dir> --manifest <dir> --out <dir> [--protocol <json>]';

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!['--rows', '--manifest', '--out', '--protocol'].includes(a)) throw new UsageError(`unknown argument ${a}\n${USAGE}`);
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new UsageError(`${a} needs a value\n${USAGE}`);
    o[a.slice(2)] = argv[++i];
  }
  for (const k of ['rows', 'manifest', 'out']) if (!o[k]) throw new UsageError(`--${k} is required\n${USAGE}`);
  return o;
}

const json = (path, what) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (err) { throw new UsageError(`${what} ${path}: ${err.code ?? err.message}`); }
};

/** Rows from `<dir>/*.json` (one row or an array per file) and `<dir>/*.jsonl` (one row per line), sorted by cell. */
function loadRows(dir) {
  let names;
  try { if (!statSync(dir).isDirectory()) throw new Error(); names = readdirSync(dir).sort(); } catch { throw new UsageError(`--rows ${dir}: not a directory`); }
  const rows = [];
  for (const name of names) {
    if (name.endsWith('.json')) rows.push(...[].concat(json(join(dir, name), 'row file')));
    else if (name.endsWith('.jsonl')) rows.push(...readFileSync(join(dir, name), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  }
  return rows;
}

/** CLI entry → exit code. `--protocol` is a JSON with `horizons`, `setup`, `bPrepMinutes`, `bRateUsdPerMinute`, `skipped`. */
export function main(argv, { out = (s) => process.stdout.write(s) } = {}) {
  const o = parseArgs(argv);
  const manifest = loadManifest(resolve(o.manifest));
  const rows = loadRows(resolve(o.rows));
  const protocol = o.protocol ? json(resolve(o.protocol), '--protocol') : {};
  const agg = aggregate(rows, manifest, protocol);
  mkdirSync(resolve(o.out), { recursive: true });
  writeFileSync(join(resolve(o.out), 'runs.csv'), toCsv(agg));
  writeFileSync(join(resolve(o.out), 'tables.md'), toMarkdown(agg));
  out(`${rows.length} rows → ${join(o.out, 'runs.csv')}, ${join(o.out, 'tables.md')}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = e instanceof UsageError ? 2 : 1;
  }
}
