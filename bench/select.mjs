#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { UsageError } from '../lib/errors.mjs';

// Corpus selection (bench/PROTOCOL.md §3.2–§3.5, §4.3): a pure function of bench/corpus/candidates.json and
// exclusions.json. Its output (selection.json) is committed; --check-b verifies it and the B files.
// --pool generates candidates.json from the saved GitHub Search responses (§3.3); --gather records git facts and
// start facts from a local clone. Both only read git and the saved files.

export const MAX_B_WORDS = 400;
const MIN_COMMITS = 200;
const MIN_CONTRIBUTORS = 3;
const FILES = { min: 300, max: 3000 };
const MAX_SUITE_SECONDS = 120;
const PERMISSIVE = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', '0BSD']);
const REASONS = ['licence', 'network tests', 'suite too slow', 'too small', 'too large',
  'native CLAUDE.md or .claude/ present at the commit'];
const SINGLE = { files: 5, lines: 150 };
const SCENARIO = { minLines: 150, maxLines: 1500 };
const POOL_SIZE = 30;
const HEX = /^[a-f0-9]{40}$/;
/** Start candidates per repo: the last first-parent commit before each date (§3.3). */
export const START_DATES = Object.freeze(['2025-01-01', '2025-04-01', '2025-07-01', '2025-10-01', '2026-01-01']);
/** Task window (§3.5): the first-parent commits after a start that tasks are derived from. */
export const WINDOW = 100;
/** Test files (§3.5): never product, and a task commit must change at least one. */
const TEST = [
  /(^|\/)(tests?|testdata|testing|__tests__|__snapshots__|spec|fixtures?|e2e)\//, /_test\.go$/, /(^|\/)test_[^/]*\.py$/, /_test\.py$/,
  /\.(test|spec)\.[cm]?[jt]sx?$/, /(^|\/)conftest\.py$/, /(^|\/)type-tests\//, /(^|\/)node-tests\//, /[-_]test\.[cm]?[jt]sx?$/,
];
/** Paths that never make a commit eligible (§3.5: tests, docs, CI, dependencies, build and test tooling). */
const NOT_PRODUCT = [
  ...TEST,
  /\.(md|mdx|rst|txt|adoc)$/i, /(^|\/)docs?\//, /(^|\/)README[^/]*$/i, /(^|\/)examples?\//, /(^|\/)(LICEN[CS]E|CHANGELOG|CHANGES|AUTHORS|CONTRIBUTORS)[^/]*$/i,
  /^\.github\//, /^\.gitlab-ci/, /^\.circleci\//, /^\.(travis|appveyor)\.ya?ml$/, /(^|\/)\.pre-commit-config\.yaml$/,
  /(^|\/)go\.(mod|sum)$/, /^vendor\//, /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|npm-shrinkwrap\.json)$/,
  /(^|\/)(requirements[^/]*\.(txt|in)|pyproject\.toml|poetry\.lock|uv\.lock|setup\.(py|cfg)|tox\.ini|Pipfile(\.lock)?)$/,
  /^\.[^/]+$/, /(^|\/)[^/]*\.config\.[cm]?[jt]s$/, /(^|\/)(karma|babel|jest|vitest|rollup|webpack)\.conf[^/]*$/,
  /(^|\/)[jt]sconfig[^/]*\.json$/, /(^|\/)(biome|oxlint|mangle|renovate|sizereport\.config)\.json$/, /(^|\/)(Makefile|Dockerfile)$/,
  /^\.golangci\.ya?ml$/, /^\.goreleaser\.ya?ml$/,
  /(^|\/)[^/]*test-helpers?\//, /(^|\/)(run-tests?|testem)[^/]*$/, /(^|\/)tsconfig\//,
];
/** Merges of integration branches bundle unrelated work; typo fixes, bumps and upgrades carry no new behaviour (§3.5). */
const INTEGRATION = /^Merge (branch '|remote-tracking branch '|pull request #\d+ from \S*?)(\S*\/)?(release|develop|dev|stable|main|master)\b/i;
const TRIVIAL = /\b(typos?|spelling|codespell|bump|upgrade)\b/i;
const NATIVE = /(^|\/)(CLAUDE(\.local)?\.md$|\.claude\/)/;

const read = (path) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (err) {
    throw new UsageError(`cannot read ${path} as JSON (${err.code ?? err.message})`);
  }
};
const byKey = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
const validReason = (reason) => REASONS.includes(reason) || /^other: \S/.test(reason ?? '');

/** Word count as `--check-b` reports it: whitespace separated tokens. */
export const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

/** Load `<dir>/candidates.json`, `exclusions.json` and `suites.jsonl` → `{ dir, slots, repos, starts, exclusions, measurements }`. */
export function loadCorpus(dir) {
  if (!existsSync(join(dir, 'candidates.json'))) throw new UsageError(`${dir}: candidates.json not found`);
  const { slots, repos, starts } = read(join(dir, 'candidates.json'));
  const file = join(dir, 'exclusions.json');
  const suites = join(dir, 'suites.jsonl');
  const measurements = existsSync(suites) ? lines(readFileSync(suites, 'utf8')).map((row, i) => {
    try { return JSON.parse(row); } catch { throw new UsageError(`${suites}:${i + 1}: not JSON`); }
  }) : [];
  return { dir, slots, repos, starts, exclusions: existsSync(file) ? read(file) : [], measurements };
}

/**
 * Fill facts left `null` from measure-suite.sh records (last record per commit wins): `testsGreen` = offline exit 0;
 * the repo's suite facts come from its earliest start usable from history. Explicit values are kept.
 */
function measured(repos, starts, measurements, listed) {
  const at = new Map(measurements.map((m) => [`${m.repo}@${m.commit}`, m]));
  const filled = starts.map((s) => {
    const m = at.get(`${s.repo}@${s.hash}`);
    return s.testsGreen == null && m ? { ...s, testsGreen: m.offlineExit === 0 } : s;
  });
  const out = repos.map((r) => {
    if (r.offlineTests != null && r.suiteSeconds != null) return r;
    const first = filled.filter((s) => s.repo === r.id && !historyProblem(s, listed))
      .sort((a, b) => byKey('date')(a, b) || byKey('hash')(a, b))[0];
    const m = first && at.get(`${r.id}@${first.hash}`);
    return m ? { ...r, offlineTests: !(m.offlineExit !== 0 && m.onlineExit === 0), suiteGreen: m.offlineExit === 0 || m.onlineExit === 0,
      suiteSeconds: m.seconds } : r;
  });
  return { repos: out, starts: filled };
}

const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 256 << 20,
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } });
const lines = (out) => out.split('\n').filter(Boolean);

function changed(dir, from, to) {
  let files = 0;
  let count = 0;
  let tests = 0;
  let testDeletions = 0;
  for (const row of lines(git(dir, ['diff', '--numstat', '--no-renames', from, to]))) {
    const [add, del, path] = row.split('\t');
    if (TEST.some((re) => re.test(path))) { tests += 1; testDeletions += Number(del) || 0; }
    if (NOT_PRODUCT.some((re) => re.test(path))) continue;
    files += 1;
    count += (Number(add) || 0) + (Number(del) || 0);
  }
  return { product: files > 0, files, lines: count, tests, testDeletions };
}

/** Tree of `start` plus the change `first..commit` (§3.5), or `null` when the change conflicts with `start`. */
function mergedTree(dir, start, first, commit) {
  try { return git(dir, ['merge-tree', '--write-tree', '--no-messages', `--merge-base=${first}`, start, commit]).split('\n')[0]; } catch (err) {
    if (err.status === 1) return null;
    throw err;
  }
}

/** The reference tree of a task commit: `start` + the commit's own diff against its first parent (§3.5), `null` if it does not apply. */
export const referenceTree = (dir, start, commit) => mergedTree(dir, start, git(dir, ['rev-parse', `${commit}^1`]).trim(), commit);

/** Facts of the start candidates of a local clone (read-only git) → `starts[]` entries; `testsGreen` is left `null`. */
export function gather(dir, { repo = null, until = START_DATES, ref = 'HEAD' } = {}) {
  const out = [];
  for (const date of until) {
    const hash = git(dir, ['log', '--first-parent', '--format=%H', `--before=${date}T00:00:00Z`, '-1', ref]).trim();
    if (!hash || out.some((s) => s.hash === hash)) continue;
    const after = lines(git(dir, ['rev-list', '--first-parent', '--reverse', '--parents', `${hash}..${ref}`])).slice(0, WINDOW);
    out.push({
      repo, hash,
      date: git(dir, ['log', '-1', '--format=%cs', hash]).trim(),
      testsGreen: null,
      native: lines(git(dir, ['ls-tree', '-r', '--name-only', hash])).some((p) => NATIVE.test(p)),
      following: after.map((row) => {
        const [commit, first, second] = row.split(' ');
        const branchCommits = second ? Number(git(dir, ['rev-list', '--count', `${first}..${second}`]).trim()) : 1;
        return { hash: commit, subject: git(dir, ['log', '-1', '--format=%s', commit]).trim(), ...changed(dir, first, commit), branchCommits,
          appliesToStart: mergedTree(dir, hash, first, commit) !== null };
      }),
    });
  }
  return out;
}

/**
 * First two single tasks and the scenario among the first WINDOW commits following a start (§3.5), or `null`; `skipped`
 * lists the commits passed over because their diff does not apply to the start. Eligible commits change product code
 * and add tests without deleting test lines (the restored original suite must still hold; tooling-only commits drop
 * out), apply cleanly to the start (the reference is the start plus this change), are neither typo fixes, bumps or
 * upgrades nor merges of integration branches, and are not excluded by hand (`<repo>@<hash>`, e.g. a reference that
 * fails the regression check). The scenario is the first eligible change that is not a chosen single and has 150–1500 lines.
 */
function derive(start, listed = new Map()) {
  const window = start.following.slice(0, WINDOW);
  const fits = (c) => c.product && c.tests > 0 && !(c.testDeletions > 0) && !listed.has(`${start.repo}@${c.hash}`)
    && !INTEGRATION.test(c.subject ?? '') && !TRIVIAL.test(c.subject ?? '');
  const eligible = window.filter((c) => fits(c) && c.appliesToStart !== false);
  const singles = eligible.filter((c) => c.files <= SINGLE.files && c.lines <= SINGLE.lines).slice(0, 2).map((c) => c.hash);
  const scenario = eligible.find((c) => !singles.includes(c.hash) && c.lines >= SCENARIO.minLines && c.lines <= SCENARIO.maxLines)?.hash;
  if (singles.length !== 2 || !scenario) return null;
  const last = Math.max(...[...singles, scenario].map((h) => window.findIndex((c) => c.hash === h)));
  return { singles, scenario, skipped: window.slice(0, last).filter((c) => fits(c) && c.appliesToStart === false).map((c) => c.hash) };
}

/** Facts known without running anything: slot, licence, size (§3.2). */
function staticProblem(repo, slots) {
  if (!slots.includes(repo.slot)) return 'other: stack outside the slots';
  if (!PERMISSIVE.has(repo.license)) return 'licence';
  if (repo.commits < MIN_COMMITS || repo.contributors < MIN_CONTRIBUTORS || repo.files < FILES.min) return 'too small';
  if (repo.files > FILES.max) return 'too large';
  return null;
}

/** Measured facts (offline suite and its time); unmeasured is an error, never a silent exclusion. */
function suiteProblem(repo) {
  if (typeof repo.offlineTests !== 'boolean' || typeof repo.suiteSeconds !== 'number') throw new UsageError(`${repo.id}: suite not measured (offlineTests, suiteSeconds)`);
  if (repo.suiteGreen === false) return 'other: suite not green at the earliest usable start';
  if (!repo.offlineTests) return 'network tests';
  if (!(repo.suiteSeconds < MAX_SUITE_SECONDS)) return 'suite too slow';
  return null;
}

/** Start facts from history alone: listed exclusion, native instructions, §3.5 quota. */
function historyProblem(start, listed) {
  const hit = listed.get(`${start.repo}@${start.hash}`);
  if (hit) return hit;
  if (start.native) return 'native CLAUDE.md or .claude/ present at the commit';
  if (!derive(start, listed)) return 'other: task quota not derivable from the following commits';
  return null;
}

/**
 * Apply the rule → `{ rule, repos, excluded }`; the same input always yields the same output.
 * Order: static criteria, then a start usable from history, then the measured suite; per slot the shortest suite wins
 * (ties: id). Its starts are checked in order until two have green tests: the measured start and the pilot start;
 * an unmeasured start before that point is a usage error, later starts are not listed.
 */
export function selectCorpus({ slots, repos: rawRepos, starts: rawStarts, exclusions = [], measurements = [] }) {
  if (!Array.isArray(slots) || !slots.length) throw new UsageError('candidates.json: slots must be a non-empty array');
  for (const e of exclusions) {
    if (!['repo', 'commit'].includes(e.kind) || !e.id) throw new UsageError(`exclusion needs kind repo|commit and id (${JSON.stringify(e)})`);
    if (!validReason(e.reason)) throw new UsageError(`exclusion ${e.id}: reason must be one of ${REASONS.join(' | ')} | other: <text>`);
  }
  for (const s of rawStarts) if (!HEX.test(s.hash)) throw new UsageError(`start ${s.repo}: ${s.hash} is not a 40-character commit`);
  const listed = new Map(exclusions.map((e) => [e.id, e.reason]));
  const { repos, starts } = measured(rawRepos, rawStarts, measurements, listed);
  const excluded = exclusions.map((e) => ({ kind: e.kind, id: e.id, reason: e.reason, detail: e.detail ?? '' }));
  const add = (kind, id, reason) => { if (!listed.has(id) && !excluded.some((e) => e.id === id)) excluded.push({ kind, id, reason, detail: '' }); };
  const startsOf = (id) => starts.filter((s) => s.repo === id).sort((a, b) => byKey('date')(a, b) || byKey('hash')(a, b));

  const fit = [];
  for (const repo of [...repos].sort(byKey('id'))) {
    let reason = listed.get(repo.id) ?? staticProblem(repo, slots);
    if (!reason && !startsOf(repo.id).some((s) => !historyProblem(s, listed))) reason = 'other: no start candidate yields the §3.5 task quota';
    reason ??= suiteProblem(repo);
    if (reason) add('repo', repo.id, reason);
    else fit.push(repo);
  }

  const chosen = [];
  for (const slot of [...slots].sort()) {
    const ranked = fit.filter((r) => r.slot === slot).sort((a, b) => a.suiteSeconds - b.suiteSeconds || byKey('id')(a, b));
    const repo = ranked[0];
    if (!repo) throw new UsageError(`no repository qualifies for slot ${slot} (PROTOCOL §3.2)`);
    for (const other of ranked.slice(1)) add('repo', other.id, `other: not selected, slower suite than ${repo.id}`);
    const usable = [];
    for (const s of startsOf(repo.id)) {
      if (usable.length === 2) break;
      const why = historyProblem(s, listed);
      if (why) { add('commit', `${s.repo}@${s.hash}`, why); continue; }
      const { skipped, ...tasks } = derive(s, listed);
      const own = [...tasks.singles, tasks.scenario];
      if (usable.length === 1 && own.some((h) => usable[0].tasks.includes(h))) {
        add('commit', `${s.repo}@${s.hash}`, 'other: pilot tasks overlap the measured start');
        continue;
      }
      if (s.testsGreen == null) throw new UsageError(`${repo.id}: tests not measured at ${s.hash} (run measure-suite.sh)`);
      if (s.testsGreen) {
        usable.push({ ...s, tasks: own });
        for (const h of skipped) add('commit', `${s.repo}@${h}`, 'other: does not apply');
      }
      else add('commit', `${s.repo}@${s.hash}`, 'other: tests not green at the commit');
    }
    if (!usable.length) throw new UsageError(`${repo.id}: no start commit satisfies PROTOCOL §3.3`);
    chosen.push({ slot, id: repo.id, url: repo.url, stack: repo.stack, start: usable[0].hash,
      pilotStart: usable[1]?.hash ?? null, singles: usable[0].tasks.slice(0, 2), scenario: usable[0].tasks[2] });
  }
  excluded.sort((a, b) => byKey('kind')(a, b) || byKey('id')(a, b));
  return { rule: 'bench/PROTOCOL.md §3.2–§3.5', repos: chosen, excluded };
}

const bPath = (dir, repo) => join(dir, repo.id, repo.start, 'CLAUDE.md');

/**
 * Check the B file of every selected `(repo, start)` and its recorded authoring minutes (`b-effort.json`:
 * `{ minutes: { "<repo>/<start>": number } }`, §4.3) → `{ ok, problems, words }`.
 */
export function checkB(dir, selection) {
  const problems = [];
  const words = {};
  const effortFile = join(dir, 'b-effort.json');
  const minutes = existsSync(effortFile) ? read(effortFile).minutes ?? {} : {};
  for (const repo of selection.repos) {
    const key = `${repo.id}/${repo.start}`;
    if (!(minutes[key] > 0)) problems.push(`${effortFile}: no minutes for ${key}`);
    const path = bPath(dir, repo);
    if (!existsSync(path)) { problems.push(`missing B file ${path}`); continue; }
    words[repo.id] = countWords(readFileSync(path, 'utf8'));
    if (words[repo.id] > MAX_B_WORDS) problems.push(`${path}: ${words[repo.id]} words (max ${MAX_B_WORDS})`);
  }
  return { ok: problems.length === 0, problems, words };
}

const GATHERED = ['commits', 'contributors', 'files', 'factsAt', 'offlineTests', 'suiteSeconds'];
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const stringify = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * candidates.json text from the saved GitHub Search responses of `searchDir` (§3.3): `query.json` (date, `slots`: slot →
 * language) and one `<slot>.json` per slot, whose first POOL_SIZE items are the pool. Order: slot, stars descending, id.
 * Facts that `--gather` and the suite measurements recorded in `existing` (the parsed current file) are kept per id.
 */
export function buildPool(searchDir, existing = null) {
  const query = read(join(searchDir, 'query.json'));
  const slots = Object.keys(query.slots ?? {}).sort();
  if (!slots.length || !query.date) throw new UsageError(`${searchDir}/query.json: needs date and slots`);
  const old = new Map((existing?.repos ?? []).map((r) => [r.id, r]));
  const repos = [];
  for (const slot of slots) {
    const items = read(join(searchDir, `${slot}.json`)).items;
    if (!Array.isArray(items)) throw new UsageError(`${searchDir}/${slot}.json: items must be an array`);
    for (const item of items.slice(0, POOL_SIZE)) {
      const id = slug(`${item.owner.login}-${item.name}`);
      if (repos.some((r) => r.id === id)) throw new UsageError(`${searchDir}: duplicate candidate ${id}`);
      const kept = old.get(id) ?? {};
      repos.push({ id, url: item.clone_url, slot, stack: query.slots[slot].toLowerCase(), license: item.license?.spdx_id ?? null,
        stars: item.stargazers_count, pushed: item.pushed_at, branch: item.default_branch,
        ...Object.fromEntries(GATHERED.map((k) => [k, kept[k] ?? null])),
        source: `GitHub Search ${query.date}`, discovered: query.date });
    }
  }
  repos.sort((a, b) => byKey('slot')(a, b) || b.stars - a.stars || byKey('id')(a, b));
  const ids = new Set(repos.map((r) => r.id));
  return stringify({
    _doc: 'PROTOCOL §3.3. repos[] are generated from the saved GitHub Search responses by `node bench/select.mjs --manifest <dir> --pool <dir>/search` and never edited by hand. '
      + 'commits, contributors, files, factsAt and starts[] come from `--gather` (facts at the last first-parent commit before 2025-01-01); testsGreen, offlineTests and suiteSeconds from bench/corpus/measure-suite.sh (suites.jsonl).',
    slots, repos, starts: (existing?.starts ?? []).filter((st) => ids.has(st.repo)),
  });
}

/** Git facts of a local clone at the last first-parent commit before the first start date (§3.2), `null`s when there is none. */
export function repoFacts(dir, ref = 'HEAD') {
  const at = git(dir, ['log', '--first-parent', '--format=%H', `--before=${START_DATES[0]}T00:00:00Z`, '-1', ref]).trim();
  if (!at) return { commits: null, contributors: null, files: null, factsAt: null };
  return { commits: Number(git(dir, ['rev-list', '--count', at]).trim()), contributors: new Set(lines(git(dir, ['log', '--format=%ae', at]))).size,
    files: lines(git(dir, ['ls-tree', '-r', '--name-only', at])).length, factsAt: at };
}

/** Run `fn` while holding `lock` (created exclusively, removed afterwards); waits up to a minute for another holder. */
function withLock(lock, fn) {
  for (let i = 0; ; i++) {
    try { closeSync(openSync(lock, 'wx')); break; } catch (err) {
      if (err.code !== 'EEXIST' || i >= 600) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try { return fn(); } finally { rmSync(lock, { force: true }); }
}

function parseArgs(argv) {
  const opts = { manifest: null, checkB: false, write: false, gather: null, repo: null, pool: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--manifest') opts.manifest = argv[++i];
    else if (argv[i] === '--gather') opts.gather = argv[++i];
    else if (argv[i] === '--repo') opts.repo = argv[++i];
    else if (argv[i] === '--pool') opts.pool = argv[++i];
    else if (argv[i] === '--check') opts.check = true;
    else if (argv[i] === '--check-b') opts.checkB = true;
    else if (argv[i] === '--write') opts.write = true;
    else throw new UsageError(`unknown argument ${argv[i]}`);
  }
  if (opts.check && !opts.pool) throw new UsageError('--check belongs to --pool <search-dir>');
  if (opts.pool && !opts.manifest) throw new UsageError('--pool <search-dir> needs --manifest <dir>');
  if (opts.gather) { if (!opts.repo) throw new UsageError('--gather <git-dir> needs --repo <id>'); return opts; }
  if (!opts.manifest) throw new UsageError('usage: node bench/select.mjs --manifest <dir> [--write | --check-b | --pool <search-dir> [--check]] | --gather <git-dir> --repo <id> [--manifest <dir>]');
  return opts;
}

export function main(argv, { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  const opts = parseArgs(argv);
  if (opts.gather) {
    if (!existsSync(join(opts.gather, '.git')) && !existsSync(join(opts.gather, 'HEAD'))) throw new UsageError(`${opts.gather}: not a git repository`);
    if (!opts.manifest) { out(`${JSON.stringify(gather(opts.gather, { repo: opts.repo }), null, 1)}\n`); return 0; }
    const file = join(resolve(opts.manifest), 'candidates.json');
    const cand = read(file);
    const repo = cand.repos.find((r) => r.id === opts.repo);
    if (!repo) throw new UsageError(`${file}: no candidate ${opts.repo}`);
    const facts = repoFacts(opts.gather);
    // Static criteria first: the expensive per-commit facts are only recorded for candidates that can still qualify.
    const starts = staticProblem({ ...repo, ...facts }, cand.slots) ? [] : gather(opts.gather, { repo: opts.repo });
    // Gathers of other repositories may run in parallel: re-read and write under a lock file.
    withLock(`${file}.lock`, () => {
      const fresh = read(file);
      Object.assign(fresh.repos.find((r) => r.id === opts.repo), facts);
      fresh.starts = [...fresh.starts.filter((st) => st.repo !== opts.repo), ...starts];
      writeFileSync(`${file}.${process.pid}`, stringify(fresh));
      renameSync(`${file}.${process.pid}`, file);
    });
    out(`${opts.repo}: ${starts.length} starts recorded${starts.length ? '' : ` (${staticProblem({ ...repo, ...facts }, cand.slots) ?? 'no start before 2025-01-01'})`}\n`);
    return 0;
  }
  if (opts.pool) {
    const file = join(resolve(opts.manifest), 'candidates.json');
    const text = buildPool(resolve(opts.pool), existsSync(file) ? read(file) : null);
    if (opts.check) {
      if (existsSync(file) && readFileSync(file, 'utf8') === text) { out(`${file} matches ${opts.pool}\n`); return 0; }
      err(`${file} differs from the saved responses in ${opts.pool} (run --pool without --check and review)\n`);
      return 1;
    }
    writeFileSync(file, text);
    return 0;
  }
  const dir = resolve(opts.manifest);
  const selection = selectCorpus(loadCorpus(dir));
  const text = `${JSON.stringify(selection, null, 2)}\n`;
  if (opts.write) writeFileSync(join(dir, 'selection.json'), text);
  if (!opts.checkB) { out(text); return 0; }
  const problems = [];
  const file = join(dir, 'selection.json');
  if (!existsSync(file) || readFileSync(file, 'utf8') !== text) problems.push(`${file} differs from the rule output (run with --write and review)`);
  problems.push(...checkB(dir, selection).problems);
  for (const p of problems) err(`${p}\n`);
  if (!problems.length) out(`B files ok for ${selection.repos.length} selected starts\n`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = e instanceof UsageError ? 2 : 1;
  }
}
