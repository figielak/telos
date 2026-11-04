import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { aggregate, breakEven, cumulative, median, quartiles, toCsv, toMarkdown } from '../bench/lib/report.mjs';
import { setupKey } from '../bench/lib/matrix.mjs';

const CLI = fileURLToPath(new URL('../bench/report.mjs', import.meta.url));
const START = 'a'.repeat(40);
const task = (id, type = 'single') => ({ id, type, repo: 'r', start: START });
const matrix = (...tasks) => ({ repetitions: 5, tasks });
const SETUP = { [setupKey('r', START, 'deep')]: { usd: 0, fresh: 0, explore_calls: 0 }, [setupKey('r', START, 'standard')]: { usd: 0, fresh: 0, explore_calls: 0 } };
const protocol = (extra = {}) => ({ horizons: [1, 5, 10, 20], setup: SETUP, bPrepMinutes: {}, ...extra });

/** One metrics row (shape of bench/lib/metrics.mjs). */
function row(taskId, variant, rep, { cost = 1, accepted = true, fresh = 100, explore = 10, cache = 1000, status = 'completed', reason } = {}) {
  return { cell: `${taskId}.${variant}.${rep}`, task: taskId, variant, rep, status, ...(reason ? { reason } : {}), accepted, cost_usd: cost, setup_usd: 0,
    input: 10, cache_creation: fresh == null ? null : fresh - 10, fresh, output: 5, cache_read: cache, turns: 3, wall_ms: 1000, sessions: 1, attempts: 1,
    explore_calls: explore, explore_bytes: 100, explore_unclassified: 0, out_of_scope_paths: [], unverified: false };
}
/** All reps of one unit; `spec[variant]` = { cost, acc (accepted runs 0–5), ...row overrides }. */
function unit(taskId, spec, reps = 5) {
  const out = [];
  for (const v of ['A', 'B', 'C', 'D']) {
    const { acc = reps, ...o } = spec[v] ?? {};
    for (let rep = 1; rep <= reps; rep++) out.push(row(taskId, v, rep, { ...o, accepted: rep <= acc }));
  }
  return out;
}
const same = (cost, extra = {}) => ({ A: { cost, ...extra }, B: { cost, ...extra }, C: { cost, ...extra }, D: { cost, ...extra } });
const find = (agg, h, comparison) => agg.verdicts.find((v) => v.hypothesis === h && v.comparison === comparison);

test('median and IQR (hinges) for odd and even n, including n = 1, 2 and empty', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
  assert.equal(median([]), null);
  assert.deepEqual(quartiles([1, 2, 3, 4, 5]), { q1: 1.5, median: 3, q3: 4.5, iqr: 3 });
  assert.deepEqual(quartiles([4, 2, 3, 1]), { q1: 1.5, median: 2.5, q3: 3.5, iqr: 2 });
  assert.deepEqual(quartiles([7]), { q1: 7, median: 7, q3: 7, iqr: 0 });
  assert.deepEqual(quartiles([1, 3]), { q1: 1, median: 2, q3: 3, iqr: 2 });
  assert.equal(quartiles([]), null);
});

test('cost per accepted run: failed-run cost stays in the numerator; zero accepted → "no accepted run", never Infinity', () => {
  const rows = unit('s1', { ...same(1), B: { cost: 1, acc: 2 }, C: { cost: 2, acc: 0 } });
  const agg = aggregate(rows, matrix(task('s1')), protocol());
  const b = agg.units.find((u) => u.unit === 's1').variants.B;
  assert.equal(b.accepted, 2);
  assert.equal(b.usdPerAccepted, 2.5, '5 runs × $1 / 2 accepted');
  const c = agg.units.find((u) => u.unit === 's1').variants.C;
  assert.equal(c.usdPerAccepted, null);
  assert.equal(c.usdLabel, 'no accepted run');
  assert.equal(c.totalCost, 10, 'the summed cost is still reported');
  const md = toMarkdown(agg);
  assert.match(md, /no accepted run/);
  assert.ok(!/Infinity|NaN/.test(md));
});

test('setup cost is added in full to every C/D trajectory, never divided; A and B carry none', () => {
  const key = setupKey('r', START, 'deep');
  const rows = unit('s1', same(1));
  const agg = aggregate(rows, matrix(task('s1')), protocol({ setup: { ...SETUP, [key]: { usd: 3, fresh: 50, explore_calls: 4 } } }));
  const v = agg.units[0].variants;
  assert.equal(v.C.usdPerAccepted, 4, 'each of 5 runs costs 1 + 3');
  assert.equal(v.C.cost.median, 4);
  assert.equal(v.C.fresh.median, 150);
  assert.equal(v.C.explore.median, 14);
  assert.equal(v.D.usdPerAccepted, 1, 'standard snapshot has its own (zero) setup');
  assert.equal(v.B.usdPerAccepted, 1);
  assert.equal(v.A.usdPerAccepted, 1);
  const runC = agg.runs.find((r) => r.cell === 's1.C.3');
  assert.equal(runC.setup_usd, 3);
  assert.equal(runC.run_cost_usd, 4);
});

test('setup tokens that were not supplied make fresh and exploration of C/D unverified, not zero', () => {
  const agg = aggregate(unit('s1', same(1)), matrix(task('s1')), { horizons: [1], setup: {}, bPrepMinutes: {} });
  assert.equal(agg.units[0].variants.C.fresh.median, null);
  assert.equal(agg.units[0].variants.C.unverified.fresh, true);
  assert.equal(agg.units[0].variants.B.fresh.median, 100);
});

test('paired difference uses units present in both variants and lists the excluded ones', () => {
  const rows = [...unit('s1', same(1)), ...unit('s2', same(1)).filter((r) => r.variant !== 'C'), ...unit('s3', same(1))];
  const agg = aggregate(rows, matrix(task('s1'), task('s2'), task('s3')), protocol());
  const d = agg.differences.find((x) => x.first === 'B' && x.second === 'C' && x.metric === 'usd');
  assert.deepEqual(d.units.map((u) => u.unit), ['s1', 's3']);
  assert.deepEqual(d.excluded, [{ unit: 's2', reason: 'variant C has no runs' }]);
  assert.equal(d.median, 0);
  assert.match(toMarkdown(agg), /difference vs baseline/i);
});

test('differences are signed so that positive favours the second-named variant', () => {
  const agg = aggregate(unit('s1', { ...same(10, { fresh: 200 }), C: { cost: 4, fresh: 150, acc: 5 }, D: { cost: 12, fresh: 250, acc: 3 } }), matrix(task('s1')), protocol());
  const d = (first, second, metric) => agg.differences.find((x) => x.first === first && x.second === second && x.metric === metric).units[0].d;
  assert.equal(d('B', 'C', 'usd'), 6);
  assert.equal(d('B', 'D', 'usd'), -10, 'U(B) 10 − U(D) 60/3 accepted');
  assert.equal(d('B', 'C', 'fresh'), 50);
  assert.equal(d('B', 'D', 'acc'), -2, 'acc: second − first');
  assert.equal(d('C', 'D', 'acc'), -2);
  assert.deepEqual(agg.differences.map((x) => `${x.first}-${x.second}`).filter((v, i, a) => a.indexOf(v) === i), ['B-C', 'B-D', 'A-C', 'A-D', 'C-D']);
});

const scenarios = (costs) => costs.flatMap(([b, c], i) => unit(`m${i + 1}`, { ...same(b), C: { cost: c }, D: { cost: c } }));
const scenarioMatrix = (n) => matrix(...Array.from({ length: n }, (_, i) => task(`m${i + 1}`, 'multi')));

test('verdict H1: 3 of 4 units agreeing with a favourable median → supported', () => {
  const agg = aggregate(scenarios([[10, 5], [10, 5], [10, 6], [10, 30]]), scenarioMatrix(4), protocol());
  const v = find(agg, 'H1', 'B vs C');
  assert.deepEqual([v.agree, v.tie, v.disagree], [3, 0, 1]);
  assert.equal(v.verdict, 'supported');
  assert.ok(v.medianDiff > 0);
});

test('verdict H1: 2 of 4 agreeing → inconclusive; 3 of 4 against → contradicted', () => {
  const half = aggregate(scenarios([[10, 5], [10, 5], [10, 30], [10, 30]]), scenarioMatrix(4), protocol());
  assert.equal(find(half, 'H1', 'B vs C').verdict, 'inconclusive');
  const against = aggregate(scenarios([[10, 5], [10, 30], [10, 30], [10, 30]]), scenarioMatrix(4), protocol());
  assert.equal(find(against, 'H1', 'B vs C').verdict, 'contradicted');
  const few = aggregate(scenarios([[10, 5], [10, 5]]), scenarioMatrix(2), protocol());
  assert.equal(find(few, 'H1', 'B vs C').verdict, 'inconclusive', 'fewer than 3 included units');
});

test('a tie under a strict claim stays in the denominator; under a non-strict claim it agrees (H2)', () => {
  const tied = aggregate(scenarios([[10, 5], [10, 5], [10, 10], [10, 10]]), scenarioMatrix(4), protocol());
  const v = find(tied, 'H1', 'B vs C');
  assert.deepEqual([v.agree, v.tie, v.disagree], [2, 2, 0]);
  assert.equal(v.verdict, 'inconclusive', '2 of 4 is below two thirds');
  const singles = aggregate([...unit('s1', same(10)), ...unit('s2', same(10)), ...unit('s3', { ...same(10), C: { cost: 10.05 } })], matrix(task('s1'), task('s2'), task('s3')), protocol());
  const h2 = find(singles, 'H2', 'B vs C');
  assert.deepEqual([h2.agree, h2.tie, h2.disagree], [3, 0, 0], 'equal and within-1% costs agree under a non-strict claim');
  assert.equal(h2.verdict, 'supported');
  const cheaper = aggregate([...unit('s1', { ...same(10), C: { cost: 5 } }), ...unit('s2', { ...same(10), C: { cost: 5 } }), ...unit('s3', same(10))], matrix(task('s1'), task('s2'), task('s3')), protocol());
  assert.equal(find(cheaper, 'H2', 'B vs C').verdict, 'contradicted');
});

test('H4 acc: equal or higher agrees, lower disagrees; H3 uses total exploration including setup', () => {
  const rows = [...unit('s1', { ...same(1), C: { cost: 1, acc: 4 } }), ...unit('s2', same(1)), ...unit('s3', same(1))];
  const agg = aggregate(rows, matrix(task('s1'), task('s2'), task('s3')), protocol());
  const h4 = find(agg, 'H4', 'B vs C');
  assert.deepEqual([h4.agree, h4.tie, h4.disagree], [2, 0, 1]);
  assert.equal(h4.verdict, 'supported');
  assert.equal(h4.units.find((u) => u.unit === 's1').class, 'disagree');
  const key = setupKey('r', START, 'deep');
  const h3 = aggregate(unit('s1', same(1)), matrix(task('s1')), protocol({ setup: { ...SETUP, [key]: { usd: 0, fresh: 0, explore_calls: 100 } } }));
  assert.equal(find(h3, 'H3', 'A vs C').units[0].d, -100, 'setup exploration makes C worse than A');
});

test('H5: (a) D cheaper than C and (b) acc(D) ≥ acc(C) − 1 on every unit; a failed floor names the unit', () => {
  const ok = [1, 2, 3].flatMap((i) => unit(`s${i}`, { ...same(10), C: { cost: 10, acc: 5 }, D: { cost: 6, acc: 4 } }));
  const m = matrix(task('s1'), task('s2'), task('s3'));
  assert.equal(find(aggregate(ok, m, protocol()), 'H5', 'C vs D').verdict, 'supported');
  const bad = [1, 2, 3].flatMap((i) => unit(`s${i}`, { ...same(10), C: { cost: 10, acc: 5 }, D: { cost: 6, acc: i === 2 ? 2 : 4 } }));
  const v = find(aggregate(bad, m, protocol()), 'H5', 'C vs D');
  assert.equal(v.verdict, 'contradicted');
  assert.deepEqual(v.floorFailures, ['s2']);
  const unclear = aggregate([1, 2, 3].flatMap((i) => unit(`s${i}`, { ...same(10), C: { cost: i === 1 ? 6 : 10 }, D: { cost: i === 1 ? 10 : 6 } })), m, protocol());
  assert.equal(find(unclear, 'H5', 'C vs D').verdict, 'supported', '2 of 3 agree and the median favours D');
});

test('unverified values and incomplete units are excluded from verdicts and listed with the reason', () => {
  const rows = [...unit('m1', same(10)), ...unit('m2', same(10)), ...unit('m3', same(10)), ...unit('m4', same(10)).filter((r) => r.rep < 5)];
  rows.find((r) => r.cell === 'm2.C.1').cost_usd = null;
  const agg = aggregate(rows, scenarioMatrix(4), protocol());
  const v = find(agg, 'H1', 'B vs C');
  assert.deepEqual(v.excluded.sort((a, b) => (a.unit < b.unit ? -1 : 1)), [{ unit: 'm2', reason: 'unverified cost' }, { unit: 'm4', reason: 'incomplete: 4 of 5 blocks' }]);
  assert.equal(v.agree + v.tie + v.disagree, 2);
  assert.equal(v.verdict, 'inconclusive');
  const both = aggregate([...unit('m1', { ...same(10), B: { cost: 10, acc: 0 }, C: { cost: 10, acc: 0 } })], scenarioMatrix(1), protocol());
  assert.deepEqual(find(both, 'H1', 'B vs C').excluded, [{ unit: 'm1', reason: 'both variants without an accepted run' }]);
});

test('exactly one variant without an accepted run: the other is better (n/a is +∞)', () => {
  const agg = aggregate(unit('m1', { ...same(10), B: { cost: 10, acc: 0 }, C: { cost: 99 } }), scenarioMatrix(1), protocol());
  const v = find(agg, 'H1', 'B vs C');
  assert.equal(v.units[0].class, 'agree');
  assert.ok(v.units[0].d > 0);
  assert.match(toMarkdown(agg), /n\/a/);
});

test('missing, skipped, refused and non-completed cells are listed with their reason', () => {
  const rows = unit('s1', same(1)).filter((r) => r.cell !== 's1.D.5');
  rows.find((r) => r.cell === 's1.C.2').status = 'infra-failed';
  rows.find((r) => r.cell === 's1.C.2').reason = 'host error before the first turn';
  rows.find((r) => r.cell === 's1.C.2').accepted = false;
  const agg = aggregate(rows, matrix(task('s1')), protocol({ skipped: { 's1.D.5': 'cap: block would exceed the cap' } }));
  assert.deepEqual(agg.missing, [{ cell: 's1.D.5', reason: 'cap: block would exceed the cap' }]);
  assert.deepEqual(agg.nonCompleted, [{ cell: 's1.C.2', status: 'infra-failed', reason: 'host error before the first turn' }]);
  const md = toMarkdown(agg);
  assert.match(md, /s1\.D\.5/);
  assert.match(md, /host error before the first turn/);
  assert.match(md, /cap: block would exceed the cap/);
});

test('break-even: first crossover and sustained break-even over the horizon; a series that crosses back is not sustained', () => {
  assert.deepEqual(breakEven([5, 5, 5, 5], [1, 2, 3, 4]), { first: null, sustained: null });
  assert.deepEqual(breakEven([9, 8, 7, 6, 5], [5, 6, 7, 8, 9]), { first: 4, sustained: 4 });
  assert.deepEqual(breakEven([6, 4, 9, 9, 9], [5, 5, 5, 5, 5]), { first: 2, sustained: null });
  assert.deepEqual(breakEven([6, 4, 4, 9, 4], [5, 5, 5, 5, 5]), { first: 2, sustained: 5 });
  assert.deepEqual(breakEven([1, 1, 1], [5, 5, 5]), { first: 1, sustained: 1 });
  assert.deepEqual(cumulative(10, 2, 4), [12, 14, 16, 18]);
});

test('break-even per (repo, start) from medians: setup once, B preparation only converted with a stated rate', () => {
  const key = setupKey('r', START, 'deep');
  const rows = [1, 2, 3].flatMap((i) => unit(`s${i}`, { ...same(10), C: { cost: 4 }, D: { cost: 6 } }));
  const m = matrix(task('s1'), task('s2'), task('s3'));
  const agg = aggregate(rows, m, protocol({ setup: { ...SETUP, [key]: { usd: 20, fresh: 0, explore_calls: 0 } }, bPrepMinutes: { [`r.${START}`]: 12 } }));
  const be = agg.breakEven.find((b) => b.group === `r.${START}` && b.variant === 'C');
  assert.equal(be.telosPerTask, 4);
  assert.equal(be.basePerTask, 10);
  assert.equal(be.setupUsd, 20);
  assert.equal(be.bPrepMinutes, 12);
  assert.equal(be.bPrepUsd, null, 'no rate stated');
  const h = Object.fromEntries(be.horizons.map((x) => [x.horizon, x]));
  assert.deepEqual([h[1].first, h[1].sustained, h[5].first, h[5].sustained, h[20].first], [null, null, 4, 4, 4]);
  assert.equal(h[1].basis, 'measured');
  assert.equal(h[5].basis, 'extrapolated', '3 measured units, horizon 5');
  const rated = aggregate(rows, m, protocol({ setup: { ...SETUP, [key]: { usd: 20, fresh: 0, explore_calls: 0 } }, bPrepMinutes: { [`r.${START}`]: 12 }, bRateUsdPerMinute: 1 }));
  assert.equal(rated.breakEven.find((b) => b.variant === 'C').bPrepUsd, 12);
  assert.equal(rated.breakEven.find((b) => b.variant === 'C').horizons.find((x) => x.horizon === 5).first, 2);
  assert.match(toMarkdown(agg), /not reached/);
});

test('identical input gives a byte-identical CSV and Markdown, whatever the row order', () => {
  const rows = [...unit('s1', same(1.2345678)), ...unit('m1', same(2), 5)];
  const m = matrix(task('s1'), task('m1', 'multi'));
  const a = aggregate(rows, m, protocol());
  const b = aggregate([...rows].reverse(), { ...m, tasks: [...m.tasks].reverse() }, protocol());
  assert.equal(toCsv(a), toCsv(b));
  assert.equal(toMarkdown(a), toMarkdown(b));
  assert.match(toCsv(a), /^cell,task,variant,rep,status,accepted,/);
  assert.match(toCsv(a), /s1\.A\.1,s1,A,1,completed,true,1\.234568,/);
  assert.ok(!/\bundefined\b|NaN/.test(toMarkdown(a) + toCsv(a)));
});

test('primary table: acc n/N and USD per accepted run in one cell, cache_read in its own column, fresh never "total"', () => {
  const md = toMarkdown(aggregate(unit('s1', { ...same(2), B: { cost: 2, acc: 3 } }), matrix(task('s1')), protocol()));
  assert.match(md, /\| s1 \| B \| 3\/5 \| \$3\.3333 \|/);
  assert.match(md, /cache_read/);
  assert.match(md, /fresh/);
  assert.ok(!/\btotal tokens\b/i.test(md));
});

test('report.mjs: usage errors exit 2; rows + manifest → runs.csv and tables.md', () => {
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });
  assert.equal(run().status, 2);
  assert.equal(run('--rows', '/nonexistent', '--manifest', '/nonexistent', '--out', '/tmp/x').status, 2);
  assert.equal(run('--bogus').status, 2);
  const dir = mkdtempSync(join(tmpdir(), 'bench-report-'));
  try {
    mkdirSync(join(dir, 'rows'));
    for (const r of unit('t-one', same(1))) writeFileSync(join(dir, 'rows', `${r.cell}.json`), JSON.stringify(r));
    const manifest = fileURLToPath(new URL('./fixtures/bench/manifest', import.meta.url));
    const out = join(dir, 'out');
    const ran = run('--rows', join(dir, 'rows'), '--manifest', manifest, '--out', out);
    assert.equal(ran.status, 0, ran.stderr);
    assert.ok(existsSync(join(out, 'runs.csv')) && existsSync(join(out, 'tables.md')));
    assert.match(readFileSync(join(out, 'runs.csv'), 'utf8'), /t-one\.A\.1/);
    assert.match(readFileSync(join(out, 'tables.md'), 'utf8'), /t-one/);
    const again = run('--rows', join(dir, 'rows'), '--manifest', manifest, '--out', out);
    assert.equal(again.status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('blocked runs count as accepted when the hidden tests pass, and the block rate and acceptance without blocks are shown', () => {
  const rows = [
    row('u', 'C', 1), row('u', 'C', 2, { status: 'blocked', reason: 'next: fix by hand' }),
    row('u', 'C', 3, { status: 'blocked', reason: 'next: fix by hand', accepted: false }),
    row('u', 'C', 4, { accepted: false }), row('u', 'C', 5),
  ];
  const agg = aggregate(rows, matrix(task('u')), protocol());
  const c = agg.units[0].variants.C;
  assert.equal(c.accepted, 3);
  assert.equal(c.blocked, 2);
  assert.equal(c.acceptedUnblocked, 2);
  assert.equal(agg.units[0].variants.A.blocked, 0);
  const md = toMarkdown(agg);
  assert.match(md, /\| blocked \|/);
  assert.match(md, /\| accepted without a block \|/);
  assert.match(md, /\| u \| C \| 3\/5 \|.*\| 2 \| 2\/5 \|/);
});
