import { VARIANTS } from './manifest.mjs';
import { setupKey } from './matrix.mjs';

// Aggregation and rendering of the report (PROTOCOL §2, §8, §9): per unit-variant statistics, descriptive verdicts
// H1–H5, paired differences, break-even, a per-run CSV and Markdown tables. Pure functions; every list is sorted and
// every number printed with fixed decimals, so equal input gives byte-identical output.

const PROFILE = { C: 'deep', D: 'standard' };
const TIE = 0.01;
const SUPPORT = 2 / 3;
const DEFAULT_HORIZONS = [1, 5, 10, 20];
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byKey = (...keys) => (a, b) => { for (const k of keys) { const c = cmp(a[k], b[k]); if (c) return c; } return 0; };
const round6 = (x) => Math.round(x * 1e6) / 1e6;
const total = (values) => (values.length === 0 || values.some((v) => v == null) ? null : round6(values.reduce((a, b) => a + b, 0)));

// --- statistics ---------------------------------------------------------------------------------------------------
/** Median of numbers (mean of the middle two for even n); `null` for none. */
export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Quartiles by Tukey's hinges: Q1 and Q3 are the medians of the lower and upper half (the median excluded for odd n); n = 1 gives IQR 0. */
export function quartiles(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return { q1: s[0], median: s[0], q3: s[0], iqr: 0 };
  const half = s.length >> 1;
  const q1 = median(s.slice(0, half));
  const q3 = median(s.slice(s.length - half));
  return { q1, median: median(s), q3, iqr: q3 - q1 };
}

const stats = (values) => {
  const q = values.some((v) => v == null) ? null : quartiles(values);
  return { median: q?.median ?? null, q1: q?.q1 ?? null, q3: q?.q3 ?? null, iqr: q?.iqr ?? null };
};

// --- aggregation --------------------------------------------------------------------------------------------------
/** Setup entry of (repo, start, profile): the supplied `protocol.setup[key]`, else the setup USD the rows paid. */
function setupOf(key, rows, protocol) {
  const given = protocol.setup?.[key];
  if (given) return { usd: given.usd ?? null, fresh: given.fresh ?? null, explore: given.explore_calls ?? null };
  const paid = rows.filter((r) => r.setup_usd != null);
  return { usd: paid.length ? round6(paid.reduce((s, r) => s + r.setup_usd, 0)) : 0, fresh: null, explore: null };
}

function variantStats(taskRows, variant, setup) {
  const telos = variant in PROFILE;
  const runs = [...taskRows].sort(byKey('rep'));
  const add = (value, extra) => (value == null || (telos && extra == null) ? null : value + (telos ? extra : 0));
  const runCost = runs.map((r) => add(r.cost_usd, setup.usd));
  const fresh = runs.map((r) => add(r.fresh, setup.fresh));
  const explore = runs.map((r) => add(r.explore_calls, setup.explore));
  const accepted = runs.filter((r) => r.accepted === true).length;
  const blocked = runs.filter((r) => r.status === 'blocked').length;
  const acceptedUnblocked = runs.filter((r) => r.accepted === true && r.status !== 'blocked').length;
  const sumCost = total(runCost);
  const failures = {};
  for (const r of runs) if (r.accepted !== true) failures[r.reason ?? r.status] = (failures[r.reason ?? r.status] ?? 0) + 1;
  const usd = sumCost == null ? null : accepted ? round6(sumCost / accepted) : null;
  return {
    runs: runs.length, accepted, blocked, acceptedUnblocked, totalCost: sumCost, usdPerAccepted: usd,
    usdLabel: sumCost == null ? 'unverified' : accepted ? null : 'no accepted run',
    cost: stats(runCost), fresh: stats(fresh), explore: stats(explore), cacheRead: stats(runs.map((r) => r.cache_read ?? null)),
    perRun: runs.map((r, i) => ({ cell: r.cell, runCost: runCost[i], fresh: fresh[i], explore: explore[i] })),
    failures, unverified: { cost: sumCost == null, fresh: fresh.includes(null), explore: explore.includes(null) },
  };
}

const CSV_COLUMNS = ['cell', 'task', 'variant', 'rep', 'status', 'accepted', 'cost_usd', 'setup_usd', 'run_cost_usd', 'input', 'cache_creation', 'fresh', 'output',
  'cache_read', 'turns', 'wall_ms', 'sessions', 'attempts', 'explore_calls', 'explore_total', 'explore_bytes', 'out_of_scope', 'unverified', 'reason'];

/**
 * @param {object[]} rows metrics rows (bench/lib/metrics.mjs)
 * @param {{ repetitions: number, tasks: {id: string, type: string, repo: string, start: string}[] }} matrix
 * @param {{ horizons?: number[], setup?: object, bPrepMinutes?: object, bRateUsdPerMinute?: number, skipped?: object }} protocol
 *   `setup[key]` = `{ usd, fresh, explore_calls }` of one snapshot (key `<repo>.<start>.<profile>`), charged in full to each C/D run.
 * @returns `{ runs, units, differences, verdicts, breakEven, missing, nonCompleted }`
 */
export function aggregate(rows, matrix, protocol = {}) {
  const reps = matrix.repetitions;
  const tasks = [...matrix.tasks].sort(byKey('id'));
  const setups = {};
  const setupFor = (t, variant) => {
    const key = setupKey(t.repo, t.start, PROFILE[variant]);
    const used = rows.filter((r) => r.variant === variant && tasks.some((x) => x.id === r.task && x.repo === t.repo && x.start === t.start));
    return (setups[key] ??= setupOf(key, used, protocol));
  };

  const runs = [];
  const units = tasks.map((t) => {
    const variants = {};
    for (const v of VARIANTS) {
      const taskRows = rows.filter((r) => r.task === t.id && r.variant === v);
      const setup = v in PROFILE ? setupFor(t, v) : { usd: 0, fresh: 0, explore: 0 };
      variants[v] = variantStats(taskRows, v, setup);
      for (const [i, r] of [...taskRows].sort(byKey('rep')).entries()) {
        const p = variants[v].perRun[i];
        runs.push({ ...r, setup_paid_usd: r.setup_usd ?? null, setup_usd: v in PROFILE ? setup.usd : 0, run_cost_usd: p.runCost, explore_total: p.explore });
      }
    }
    const complete = Array.from({ length: reps }, (_, i) => i + 1).filter((rep) => VARIANTS.every((v) => rows.some((r) => r.task === t.id && r.variant === v && r.rep === rep)));
    return { unit: t.id, type: t.type, repo: t.repo, start: t.start, variants, blocks: complete.length, complete: complete.length === reps };
  });
  runs.sort(byKey('task', 'variant', 'rep'));

  const expected = tasks.flatMap((t) => VARIANTS.flatMap((v) => Array.from({ length: reps }, (_, i) => `${t.id}.${v}.${i + 1}`)));
  const have = new Set(rows.map((r) => r.cell));
  const missing = expected.filter((c) => !have.has(c)).sort().map((cell) => ({ cell, reason: protocol.skipped?.[cell] ?? 'no record' }));
  const nonCompleted = rows.filter((r) => r.status !== 'completed').sort(byKey('cell')).map((r) => ({ cell: r.cell, status: r.status, reason: r.reason ?? r.status }));

  const agg = { matrix, units, runs, missing, nonCompleted, setups, protocol, reps };
  agg.verdicts = verdicts(units, reps);
  agg.differences = differences(units);
  agg.breakEven = breakEvens(agg);
  return agg;
}

// --- comparisons and verdicts -------------------------------------------------------------------------------------
const METRICS = {
  usd: { unverified: (s) => s.unverified.cost, value: (s) => (s.accepted ? s.usdPerAccepted : Infinity), label: 'cost' },
  fresh: { unverified: (s) => s.unverified.fresh, value: (s) => s.fresh.median, label: 'fresh tokens' },
  explore: { unverified: (s) => s.unverified.explore, value: (s) => s.explore.median, label: 'exploration' },
  acc: { unverified: () => false, value: (s) => s.accepted, label: 'acceptance' },
};

/**
 * Signed difference of one unit for a pair (positive favours `second`, §9) → `{ d }` or `{ excluded: reason }`.
 * `usd`, `fresh`, `explore`: first − second; `acc`: second − first. `n/a` USD counts as +∞; both n/a is excluded.
 */
function pairDifference(unit, first, second, metric) {
  const a = unit.variants[first];
  const b = unit.variants[second];
  for (const [v, s] of [[first, a], [second, b]]) if (!s.runs) return { excluded: `variant ${v} has no runs` };
  const m = METRICS[metric];
  for (const s of [a, b]) if (m.unverified(s)) return { excluded: `unverified ${m.label}` };
  const x = m.value(a);
  const y = m.value(b);
  if (metric === 'usd' && x === Infinity && y === Infinity) return { excluded: 'both variants without an accepted run' };
  if (x == null || y == null) return { excluded: `unverified ${m.label}` };
  const d = metric === 'acc' ? y - x : x - y;
  const tie = x === y || (metric !== 'acc' && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= TIE * Math.max(Math.abs(x), Math.abs(y)));
  return { d: round6(d), tie };
}

const PAIRS = [['B', 'C'], ['B', 'D'], ['A', 'C'], ['A', 'D'], ['C', 'D']];

/** Paired differences per pair and metric over the units that have runs in both variants (incomplete units included, flagged). */
function differences(units) {
  const out = [];
  for (const [first, second] of PAIRS) {
    for (const metric of ['usd', 'fresh', 'acc', 'explore']) {
      const used = [];
      const excluded = [];
      for (const u of units) {
        const r = pairDifference(u, first, second, metric);
        if (r.excluded) excluded.push({ unit: u.unit, reason: r.excluded });
        else used.push({ unit: u.unit, d: r.d, complete: u.complete });
      }
      out.push({ first, second, metric, units: used, excluded, median: used.length ? finite(median(used.map((x) => x.d))) : null });
    }
  }
  return out;
}

/** Median that survives ±Infinity differences (n/a USD): opposite infinities average to 0 (no direction). */
const finite = (x) => (Number.isNaN(x) ? 0 : x);

/**
 * One comparison over the complete units of `kind` (§2.3–§2.4). `claim`: `better` (strict, second better), `not-worse`
 * (second at least as good; ties agree) or `not-better` (second not better; ties agree).
 */
function compare(units, reps, { hypothesis, first, second, metric, kind, claim }) {
  const included = [];
  const excluded = [];
  for (const u of units.filter((x) => kind === 'all' || x.type === kind)) {
    if (!u.complete) { excluded.push({ unit: u.unit, reason: `incomplete: ${u.blocks} of ${reps} blocks` }); continue; }
    const r = pairDifference(u, first, second, metric);
    if (r.excluded) { excluded.push({ unit: u.unit, reason: r.excluded }); continue; }
    let cls;
    if (claim === 'better') cls = r.tie || r.d === 0 ? 'tie' : r.d > 0 ? 'agree' : 'disagree';
    else if (claim === 'not-worse') cls = r.tie || r.d >= 0 ? 'agree' : 'disagree';
    else cls = r.tie || r.d <= 0 ? 'agree' : 'disagree';
    included.push({ unit: u.unit, d: r.d, class: cls });
  }
  const count = (c) => included.filter((x) => x.class === c).length;
  const n = included.length;
  const medianDiff = n ? finite(median(included.map((x) => x.d))) : null;
  let verdict = 'inconclusive';
  if (n >= 3) {
    const direction = claim === 'better' ? medianDiff > 0 : claim === 'not-worse' ? medianDiff >= 0 : medianDiff <= 0;
    if (count('agree') / n >= SUPPORT && direction) verdict = 'supported';
    else if (count('disagree') / n >= SUPPORT) verdict = 'contradicted';
  }
  return { hypothesis, comparison: `${first} vs ${second}`, metric, claim, units: included, agree: count('agree'), tie: count('tie'), disagree: count('disagree'),
    excluded, medianDiff, verdict };
}

/** Verdicts of H1–H5 (§2.2, §2.4) from the unit statistics → array of comparison results. */
export function verdicts(units, reps) {
  const out = [];
  const add = (spec) => out.push(compare(units, reps, spec));
  for (const v of ['C', 'D']) add({ hypothesis: 'H1', first: 'B', second: v, metric: 'usd', kind: 'multi', claim: 'better' });
  for (const v of ['C', 'D']) add({ hypothesis: 'H2', first: 'B', second: v, metric: 'usd', kind: 'single', claim: 'not-better' });
  for (const [a, b] of [['A', 'C'], ['A', 'D'], ['B', 'C'], ['B', 'D']]) add({ hypothesis: 'H3', first: a, second: b, metric: 'explore', kind: 'all', claim: 'better' });
  for (const v of ['C', 'D']) add({ hypothesis: 'H4', first: 'B', second: v, metric: 'acc', kind: 'all', claim: 'not-worse' });
  const h5 = compare(units, reps, { hypothesis: 'H5', first: 'C', second: 'D', metric: 'usd', kind: 'all', claim: 'better' });
  h5.floorFailures = units.filter((u) => u.complete && u.variants.D.accepted < u.variants.C.accepted - 1).map((u) => u.unit);
  if (h5.floorFailures.length || h5.verdict === 'contradicted') h5.verdict = 'contradicted';
  else if (h5.verdict !== 'supported') h5.verdict = 'inconclusive';
  out.push(h5);
  return out;
}

// --- break-even ---------------------------------------------------------------------------------------------------
/** Cumulative cost series for n = 1..horizon tasks: setup paid once + n × per-task cost. */
export const cumulative = (setup, perTask, horizon) => Array.from({ length: horizon }, (_, i) => setup + (i + 1) * perTask);

/** First n where `telos` is strictly cheaper than `base`, and the smallest n from which it stays cheaper to the end (1-based); `null` = not reached. */
export function breakEven(telos, base) {
  const cheaper = telos.map((t, i) => t < base[i]);
  const first = cheaper.indexOf(true);
  let sustained = null;
  for (let i = cheaper.length - 1; i >= 0 && cheaper[i]; i--) sustained = i + 1;
  return { first: first < 0 ? null : first + 1, sustained };
}

function breakEvens(agg) {
  const { protocol, units, runs } = agg;
  const horizons = protocol.horizons ?? DEFAULT_HORIZONS;
  const groups = [...new Set(units.map((u) => `${u.repo}.${u.start}`))].sort();
  const out = [];
  for (const group of groups) {
    const inGroup = units.filter((u) => `${u.repo}.${u.start}` === group);
    const perTask = (v) => median(runs.filter((r) => inGroup.some((u) => u.unit === r.task) && r.variant === v).map((r) => r.cost_usd));
    const base = perTask('B');
    const minutes = protocol.bPrepMinutes?.[group] ?? null;
    const prepUsd = minutes != null && protocol.bRateUsdPerMinute != null ? round6(minutes * protocol.bRateUsdPerMinute) : null;
    for (const variant of ['C', 'D']) {
      const key = setupKey(inGroup[0].repo, inGroup[0].start, PROFILE[variant]);
      const setup = agg.setups[key]?.usd ?? null;
      const telos = perTask(variant);
      const row = { group, variant, telosPerTask: telos, basePerTask: base, setupUsd: setup, bPrepMinutes: minutes, bPrepUsd: prepUsd, horizons: [] };
      for (const horizon of horizons) {
        const basis = horizon <= inGroup.length ? 'measured' : 'extrapolated';
        if (telos == null || base == null || setup == null) { row.horizons.push({ horizon, basis, first: null, sustained: null, unverified: true }); continue; }
        row.horizons.push({ horizon, basis, ...breakEven(cumulative(setup, telos, horizon), cumulative(prepUsd ?? 0, base, horizon)) });
      }
      out.push(row);
    }
  }
  return out;
}

// --- rendering ----------------------------------------------------------------------------------------------------
const num = (x, d) => (x == null ? '' : Number(x).toFixed(d));
/** Signed difference; ±∞ marks a variant without an accepted run (USD per accepted run is n/a, treated as +∞, §2.3). */
const signed = (x) => (x == null ? 'n/a' : Number.isFinite(x) ? num(x, 4) : x > 0 ? '+∞' : '−∞');
const usd = (x) => (x == null ? 'n/a' : `$${num(x, 4)}`);
const tok = (x) => (x == null ? 'n/a' : num(x, 0));
const csvCell = (x) => (x == null ? '' : /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));

/** Per-run CSV (stable column order, runs sorted by task, variant, rep; USD with 6 decimals; missing values empty). */
export function toCsv(agg) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of agg.runs) {
    const v = {
      ...r, cost_usd: num(r.cost_usd, 6), setup_usd: num(r.setup_usd, 6), run_cost_usd: num(r.run_cost_usd, 6),
      out_of_scope: r.out_of_scope_paths == null ? '' : r.out_of_scope_paths.join(';'), reason: r.reason ?? '',
    };
    lines.push(CSV_COLUMNS.map((c) => csvCell(v[c])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const iqr = (s, f) => (s.median == null ? 'n/a' : `${f(s.median)} (IQR ${f(s.iqr)})`);

/** Markdown tables of the report: primary table, failures, verdicts, differences vs baseline, break-even, missing cells. */
export function toMarkdown(agg) {
  const out = [];
  const reps = agg.reps;
  out.push('# Benchmark tables', '', 'Generated by `bench/report.mjs` from the metric rows; medians with IQR (Tukey hinges) over the runs of a unit-variant. Descriptive only (PROTOCOL §2.4).', '');
  out.push('## Cost per accepted run', '',
    '`blocked` counts C/D runs the workflow stopped on a task; they are graded like every finished run, so `accepted` includes those whose code passes, and `accepted without a block` leaves them out. USD per accepted run includes every failed attempt, retry, timeout and the attributed setup of C/D (full cost per trajectory, never divided). `fresh` = input + cache_creation (+ setup); `cache_read` is shown separately and never added. Exploration is the narrow proxy of §8.4 (setup + execution).', '');
  const rows = [];
  for (const u of agg.units) {
    for (const v of VARIANTS) {
      const s = u.variants[v];
      const prep = v === 'B' ? agg.protocol.bPrepMinutes?.[`${u.repo}.${u.start}`] : null;
      rows.push([u.unit, v, `${s.accepted}/${s.runs === reps ? reps : s.runs}`, s.usdPerAccepted != null ? usd(s.usdPerAccepted) : s.usdLabel, iqr(s.cost, usd), iqr(s.fresh, tok),
        iqr(s.cacheRead, tok), iqr(s.explore, (x) => num(x, 1)), String(s.blocked), `${s.acceptedUnblocked}/${s.runs === reps ? reps : s.runs}`, prep != null ? `${prep} min` : v === 'B' ? 'n/a' : '', Object.entries(s.failures).sort(([a], [b]) => cmp(a, b)).map(([k, n]) => `${k}: ${n}`).join(', ')]);
    }
  }
  out.push(table(['unit', 'variant', 'accepted', 'USD / accepted run', 'cost per run', 'fresh tokens', 'cache_read', 'exploration', 'blocked', 'accepted without a block', 'B preparation', 'not accepted'], rows), '');

  out.push('## Verdicts', '', 'Each included unit counts once; supported needs at least two thirds of the included units agreeing and the median difference not against the claim (§2.4). Differences are signed: positive favours the second-named variant.', '');
  const verdictRows = agg.verdicts.map((v) => [v.hypothesis, v.comparison, v.metric, v.claim, `${v.agree}/${v.agree + v.tie + v.disagree}`, v.tie, v.disagree,
    signed(v.medianDiff), v.excluded.map((e) => `${e.unit} (${e.reason})`).join('; ') || 'none',
    v.hypothesis === 'H5' && v.floorFailures.length ? `${v.verdict} (floor fails: ${v.floorFailures.join(', ')})` : v.verdict]);
  out.push(table(['hypothesis', 'comparison', 'metric', 'claim', 'units agreeing', 'ties', 'disagree', 'median difference', 'excluded', 'verdict'], verdictRows), '');

  out.push('## Difference vs baseline', '', 'Per unit, first − second for USD per accepted run, fresh tokens and exploration, second − first for acceptance, so positive favours the second-named variant (±∞: a variant without an accepted run). This is a difference between variants on the same unit, not a per-step attribution (F3).', '');
  const diffRows = agg.differences.map((d) => [`${d.first}→${d.second}`, d.metric, d.units.map((u) => `${u.unit}: ${signed(u.d)}${u.complete ? '' : ' (incomplete)'}`).join('; ') || 'none',
    signed(d.median), d.excluded.map((e) => `${e.unit} (${e.reason})`).join('; ') || 'none']);
  out.push(table(['pair', 'metric', 'units', 'median', 'excluded'], diffRows), '');

  out.push('## Break-even', '', 'Per repository start: Telos cost = setup (paid once) + n × median per-task cost; baseline B = preparation (USD only when a rate is stated, else minutes are listed and 0 is used) + n × median per-task cost. First crossover = smallest n where Telos is cheaper; sustained = smallest n after which it stays cheaper to the horizon end. Horizons beyond the measured units of the group are extrapolated.', '');
  const beRows = agg.breakEven.flatMap((b) => b.horizons.map((h) => [b.group, b.variant, h.horizon, h.basis, usd(b.setupUsd), usd(b.telosPerTask), usd(b.basePerTask),
    b.bPrepUsd != null ? usd(b.bPrepUsd) : b.bPrepMinutes != null ? `${b.bPrepMinutes} min (not converted)` : 'n/a',
    h.unverified ? 'unverified' : h.first ?? 'not reached', h.unverified ? 'unverified' : h.sustained ?? 'not reached']));
  out.push(table(['group', 'variant', 'horizon', 'basis', 'setup', 'Telos per task', 'B per task', 'B preparation', 'first crossover', 'sustained'], beRows), '');

  out.push('## Missing and non-completed cells', '');
  out.push(agg.missing.length ? table(['cell', 'reason'], agg.missing.map((m) => [m.cell, m.reason])) : 'No missing cells.', '');
  out.push(agg.nonCompleted.length ? table(['cell', 'status', 'reason'], agg.nonCompleted.map((m) => [m.cell, m.status, m.reason])) : 'Every recorded cell completed.', '');
  const incomplete = agg.units.filter((u) => !u.complete);
  out.push(incomplete.length ? `Units without all ${reps} blocks (excluded from verdicts): ${incomplete.map((u) => `${u.unit} (${u.blocks}/${reps})`).join(', ')}.` : `Every unit has all ${reps} blocks.`, '');
  return out.join('\n');
}
