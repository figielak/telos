import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkB, countWords, gather, loadCorpus, referenceTree, selectCorpus, WINDOW } from '../bench/select.mjs';

const FIXTURE = fileURLToPath(new URL('./fixtures/bench/corpus/', import.meta.url));
const CLI = fileURLToPath(new URL('../bench/select.mjs', import.meta.url));
const POOL = fileURLToPath(new URL('./fixtures/bench/pool/', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'bench-select-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const clone = (v) => JSON.parse(JSON.stringify(v));
const corpus = () => loadCorpus(FIXTURE);
const select = (mutate) => { const c = clone(corpus()); mutate?.(c); return selectCorpus(c); };
const put = (dir, repo, start, body) => {
  const path = join(dir, repo, start, 'CLAUDE.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
};

test('same candidate files give identical selection output', () => {
  const a = JSON.stringify(selectCorpus(corpus()));
  const reversed = clone(corpus());
  reversed.repos.reverse();
  reversed.starts.reverse();
  assert.equal(JSON.stringify(selectCorpus(reversed)), a);
});

test('per slot: earliest qualifying start, next one is the pilot; tasks derive from the following commits', () => {
  const sel = select();
  assert.deepEqual(sel.repos.map((r) => [r.slot, r.id]), [['go', 'go-fast'], ['python', 'pyrepo'], ['web', 'webrepo']]);
  const py = sel.repos.find((r) => r.id === 'pyrepo');
  assert.equal(py.start, '1000000000000000000000000000000000000001');
  assert.deepEqual(py.singles, ['a000000000000000000000000000000000000002', 'a000000000000000000000000000000000000004']);
  assert.equal(py.scenario, 'a000000000000000000000000000000000000005');
  assert.equal(py.pilotStart, '1000000000000000000000000000000000000003');
});

test('a slot without a qualifying repository stays empty and is listed in unfilled', () => {
  const base = select();
  const sel = select((c) => { for (const r of c.repos.filter((x) => x.slot === 'python')) r.files = 100; });
  assert.deepEqual(sel.repos.map((r) => r.slot), ['go', 'web']);
  assert.deepEqual(sel.repos, base.repos.filter((r) => r.slot !== 'python'));
  assert.deepEqual(sel.unfilled, [{ slot: 'python', reason: 'no repository qualifies (PROTOCOL §3.2)' }]);
  assert.deepEqual(base.unfilled, []);
});

test('fewer than two filled slots is a usage error', () => {
  assert.throws(() => select((c) => { for (const r of c.repos.filter((x) => x.slot !== 'go')) r.files = 100; }),
    /only 1 slot\(s\) filled.*python, web/);
});

test('unfilled slots keep the output deterministic', () => {
  const empty = (c) => { for (const r of c.repos.filter((x) => x.slot === 'python')) r.files = 100; };
  const reversed = (c) => { empty(c); c.repos.reverse(); c.starts.reverse(); c.slots = [...c.slots].reverse(); };
  assert.equal(JSON.stringify(select(reversed)), JSON.stringify(select(empty)));
});

test('a slot picks its fastest qualifying suite, ties by id', () => {
  assert.equal(select().repos.find((r) => r.slot === 'go').id, 'go-fast');
  const tie = select((c) => { c.repos.find((r) => r.id === 'go-big').suiteSeconds = 40; });
  assert.equal(tie.repos.find((r) => r.slot === 'go').id, 'go-big');
});

test('a changed rule input changes the output', () => {
  const base = JSON.stringify(selectCorpus(corpus()));
  assert.notEqual(JSON.stringify(select((c) => { c.repos.find((r) => r.id === 'go-fast').files = 100; })), base);
  assert.notEqual(JSON.stringify(select((c) => { c.starts.find((s) => s.repo === 'go-fast' && s.hash.endsWith('2')).testsGreen = false; })), base);
});

test('excluded candidates never appear in the selection and keep their reason', () => {
  const sel = select();
  const ids = sel.repos.map((r) => r.id);
  for (const id of ['go-net', 'py-other', 'go-big', 'web-huge', 'web-gpl', 'rb-one']) assert.ok(!ids.includes(id), id);
  const why = (kind, id) => sel.excluded.find((e) => e.kind === kind && e.id === id)?.reason;
  assert.equal(why('repo', 'go-net'), 'network tests');
  assert.equal(why('repo', 'py-other'), 'other: not selected, slower suite than pyrepo');
  assert.equal(why('repo', 'go-big'), 'other: not selected, slower suite than go-fast');
  assert.equal(why('repo', 'web-huge'), 'too large');
  assert.equal(why('repo', 'web-gpl'), 'licence');
  assert.equal(why('repo', 'rb-one'), 'other: stack outside the slots');
  assert.match(why('commit', 'go-fast@4000000000000000000000000000000000000001'), /native CLAUDE\.md or \.claude\/ present/);
  assert.equal(why('commit', 'go-fast@4000000000000000000000000000000000000003'), 'other: tests not green at the commit');
  assert.equal(why('commit', 'pyrepo@1000000000000000000000000000000000000002'), 'other: tests not green at the commit');
});

test('a listed exclusion removes a commit or repo even when it qualifies', () => {
  const sel = select((c) => { c.exclusions.push({ kind: 'repo', id: 'go-fast', reason: 'licence', detail: 'test' }); });
  assert.equal(sel.repos.find((r) => r.slot === 'go').id, 'go-big');
  assert.equal(sel.excluded.find((e) => e.id === 'go-fast').reason, 'licence');
  const commit = select((c) => { c.exclusions.push({ kind: 'commit', id: 'pyrepo@1000000000000000000000000000000000000001', reason: 'other: reference fails' }); });
  assert.equal(commit.repos.find((r) => r.id === 'pyrepo').start, '1000000000000000000000000000000000000003');
});

test('quota is checked before the suite: a repo without a usable start needs no measurement', () => {
  const sel = select();
  assert.equal(sel.excluded.find((e) => e.id === 'go-stale').reason, 'other: no start candidate yields the §3.5 task quota');
  assert.throws(() => select((c) => { c.repos.find((r) => r.id === 'go-fast').suiteSeconds = null; }), /go-fast: suite not measured/);
});

test('suites.jsonl fills unmeasured facts: suite at the earliest usable start, testsGreen per start', () => {
  const sel = select((c) => {
    const r = c.repos.find((x) => x.id === 'go-fast');
    r.offlineTests = null; r.suiteSeconds = null;
    for (const s of c.starts.filter((x) => x.repo === 'go-fast')) s.testsGreen = null;
    c.measurements = [
      { repo: 'go-fast', commit: '4000000000000000000000000000000000000002', offlineExit: 0, onlineExit: null, seconds: 30 },
      { repo: 'go-fast', commit: '4000000000000000000000000000000000000003', offlineExit: 1, onlineExit: 1, seconds: 31 },
      { repo: 'go-fast', commit: '4000000000000000000000000000000000000004', offlineExit: 1, onlineExit: 1, seconds: 31 },
    ];
  });
  const go = sel.repos.find((r) => r.slot === 'go');
  assert.equal(go.id, 'go-fast');
  assert.equal(go.pilotStart, null);
  assert.equal(sel.excluded.find((e) => e.id === 'go-fast@4000000000000000000000000000000000000004').reason, 'other: tests not green at the commit');
  const net = select((c) => {
    const r = c.repos.find((x) => x.id === 'go-fast');
    r.offlineTests = null; r.suiteSeconds = null;
    c.measurements = [{ repo: 'go-fast', commit: '4000000000000000000000000000000000000002', offlineExit: 1, onlineExit: 0, seconds: 30 }];
  });
  assert.equal(net.excluded.find((e) => e.id === 'go-fast').reason, 'network tests');
});

test('a suite red with and without network does not compete on time', () => {
  const sel = select((c) => {
    const r = c.repos.find((x) => x.id === 'go-fast');
    r.offlineTests = null; r.suiteSeconds = null;
    c.measurements = [{ repo: 'go-fast', commit: '4000000000000000000000000000000000000002', offlineExit: 1, onlineExit: 1, seconds: 3 }];
  });
  assert.equal(sel.repos.find((r) => r.slot === 'go').id, 'go-big');
  assert.equal(sel.excluded.find((e) => e.id === 'go-fast').reason, 'other: suite not green at the earliest usable start');
});

test('starts are checked in order until measured and pilot are found; a gap before that is an error', () => {
  const sel = select((c) => { c.starts.push({ ...clone(c.starts.find((s) => s.repo === 'go-fast' && s.hash.endsWith('4'))), hash: '4000000000000000000000000000000000000005', date: '2025-08-01', testsGreen: null }); });
  assert.equal(sel.repos.find((r) => r.id === 'go-fast').pilotStart, '4000000000000000000000000000000000000004');
  assert.ok(!sel.excluded.some((e) => e.id.endsWith('4000000000000000000000000000000000000005')));
  assert.throws(() => select((c) => { c.starts.find((s) => s.repo === 'go-fast' && s.hash.endsWith('3')).testsGreen = null; }),
    /go-fast: tests not measured at 4000000000000000000000000000000000000003/);
});

test('loadCorpus reads suites.jsonl when present', () => {
  const dir = join(tmp, 'jsonl');
  cpSync(FIXTURE, dir, { recursive: true });
  writeFileSync(join(dir, 'suites.jsonl'), '{"repo":"go-fast","commit":"4000000000000000000000000000000000000002","offlineExit":0,"onlineExit":null,"seconds":3}\n\n');
  assert.equal(loadCorpus(dir).measurements.length, 1);
});

test('a task commit must change tests too; trivial product-only commits are skipped', () => {
  const sel = select((c) => { c.starts.find((s) => s.hash === '1000000000000000000000000000000000000001').following[1].tests = 0; });
  assert.equal(sel.repos.find((r) => r.id === 'pyrepo').start, '1000000000000000000000000000000000000003');
  assert.equal(sel.excluded.find((e) => e.id === 'pyrepo@1000000000000000000000000000000000000001').reason,
    'other: task quota not derivable from the following commits');
});

test('a listed commit exclusion removes a task commit and the next eligible one is taken', () => {
  const sel = select((c) => {
    c.exclusions.push({ kind: 'commit', id: 'webrepo@b000000000000000000000000000000000000001', reason: 'other: reference fails the regression check' });
    c.starts.find((s) => s.repo === 'webrepo').following.splice(2, 0, { hash: 'b000000000000000000000000000000000000009', product: true, files: 1, lines: 5, branchCommits: 1, tests: 1 });
  });
  assert.deepEqual(sel.repos.find((r) => r.id === 'webrepo').singles, ['b000000000000000000000000000000000000002', 'b000000000000000000000000000000000000009']);
});

test('the pilot start must derive tasks disjoint from the measured start', () => {
  const sel = select((c) => {
    const first = c.starts.find((s) => s.hash === '1000000000000000000000000000000000000001');
    c.starts.find((s) => s.hash === '1000000000000000000000000000000000000003').following = clone(first.following);
  });
  const py = sel.repos.find((r) => r.id === 'pyrepo');
  assert.equal(py.pilotStart, null);
  assert.equal(sel.excluded.find((e) => e.id === 'pyrepo@1000000000000000000000000000000000000003').reason, 'other: pilot tasks overlap the measured start');
});

test('merges of integration branches (release, develop, main, …) are not tasks', () => {
  const sel = select((c) => {
    const f = c.starts.find((s) => s.hash === '1000000000000000000000000000000000000001').following;
    f.splice(4, 0, { hash: 'a000000000000000000000000000000000000099', subject: 'Merge pull request #12 from org/release/11.6.0', product: true, files: 9, lines: 300, branchCommits: 9, tests: 2 });
    f.push({ hash: 'a000000000000000000000000000000000000098', subject: "Merge branch 'develop'", product: true, files: 9, lines: 300, branchCommits: 9, tests: 2 });
  });
  assert.equal(sel.repos.find((r) => r.id === 'pyrepo').scenario, 'a000000000000000000000000000000000000005');
  const dev = select((c) => {
    const f = c.starts.find((s) => s.hash === '1000000000000000000000000000000000000001').following;
    f.splice(4, 0, { hash: 'a000000000000000000000000000000000000097', subject: 'Merge pull request #7 from someone/dev-2.0', product: true, files: 9, lines: 300, branchCommits: 9, tests: 2 });
  });
  assert.equal(dev.repos.find((r) => r.id === 'pyrepo').scenario, 'a000000000000000000000000000000000000005');
});

test('typo fixes and integration merges are never single tasks either', () => {
  const sel = select((c) => {
    const f = c.starts.find((s) => s.hash === '1000000000000000000000000000000000000001').following;
    f.splice(1, 0,
      { hash: 'a000000000000000000000000000000000000091', subject: 'Fix typos discovered by codespell (#3069)', product: true, files: 1, lines: 2, branchCommits: 1, tests: 1 },
      { hash: 'a000000000000000000000000000000000000092', subject: "Merge branch 'stable'", product: true, files: 2, lines: 20, branchCommits: 13, tests: 2 });
  });
  assert.deepEqual(sel.repos.find((r) => r.id === 'pyrepo').singles, ['a000000000000000000000000000000000000002', 'a000000000000000000000000000000000000004']);
});

test('a task may only add test lines: deleting or rewriting existing tests breaks the restored original suite', () => {
  const sel = select((c) => { c.starts.find((s) => s.hash === '1000000000000000000000000000000000000001').following[1].testDeletions = 2; });
  assert.ok(!sel.repos.find((r) => r.id === 'pyrepo').singles.includes('a000000000000000000000000000000000000002'));
});

test('dependency upgrades and bumps are not tasks', () => {
  const sel = select((c) => {
    const f = c.starts.find((s) => s.hash === '1000000000000000000000000000000000000001').following;
    f.splice(4, 0, { hash: 'a000000000000000000000000000000000000096', subject: 'Merge pull request #20842 from someone/nvp/upgrade-glimmer-vm-0-94', product: true, files: 9, lines: 300, branchCommits: 9, tests: 2, testDeletions: 0 });
    f.splice(1, 0, { hash: 'a000000000000000000000000000000000000095', subject: 'Bump devtools to 10.26.5', product: true, files: 1, lines: 2, branchCommits: 1, tests: 1, testDeletions: 0 });
  });
  const py = sel.repos.find((r) => r.id === 'pyrepo');
  assert.equal(py.scenario, 'a000000000000000000000000000000000000005');
  assert.ok(!py.singles.includes('a000000000000000000000000000000000000095'));
});

test('the reference is the start plus the task commit: a commit whose diff does not apply cleanly to the start is skipped', () => {
  const sel = select((c) => { c.starts.find((s) => s.hash === '1000000000000000000000000000000000000001').following[1].appliesToStart = false; });
  assert.ok(!sel.repos.find((r) => r.id === 'pyrepo').singles.includes('a000000000000000000000000000000000000002'));
});

test('an unknown exclusion reason is refused', () => {
  assert.throws(() => select((c) => { c.exclusions.push({ kind: 'repo', id: 'go-fast', reason: 'dislike' }); }), /reason/);
});

test('a slot without a qualifying repo is listed in unfilled, a chosen repo without a green start is an error', () => {
  const slotOf = (sel) => sel.unfilled.map((u) => u.slot);
  assert.deepEqual(slotOf(select((c) => { c.starts.find((s) => s.repo === 'webrepo').native = true; })), ['web']);
  assert.throws(() => select((c) => { c.starts.find((s) => s.repo === 'webrepo').testsGreen = false; }), /webrepo.*start/);
  assert.deepEqual(slotOf(select((c) => { c.repos = c.repos.filter((r) => r.slot !== 'go' || r.id === 'go-net'); })), ['go']);
});

test('gather derives start facts from git history (§3.5 classifier)', () => {
  const dir = join(tmp, 'git');
  mkdirSync(dir);
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  let date = '2024-12-01T00:00:00Z';
  const commit = (files, msg) => { for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), body); } g('add', '-A'); g('commit', '-qm', msg); return g('rev-parse', 'HEAD').trim(); };
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  const start = commit({ 'src/a.js': 'a\n', 'README.md': 'r\n' }, 'start');
  date = '2025-02-01T00:00:00Z';
  commit({ 'test/a.test.js': 'x\n', 'README.md': 'more\n' }, 'tests and docs only');
  const one = commit({ 'src/b.js': 'b\n'.repeat(10), 'test/b.test.js': 'y\n' }, 'small');
  commit({ 'vitest.config.mjs': 'c\n', 'biome.json': '{}\n', 'tsconfig.json': '{}\n', '.eslintrc.cjs': 'e\n', 'examples/x/README': 'r\n', 'examples/x/app.py': 'p\n',
    'type-tests/a.ts': 't\n', 'node-tests/blueprints/x-test.js': 'n\n', 'blueprints/y/files/z-test.js': 'b\n', 'packages/internal-test-helpers/lib/x.ts': 'h\n', 'bin/run-tests.js': 'r\n', 'tsconfig/compiler-options.json': '{}\n', 'testem.js': 't\n' }, 'tooling only');
  g('checkout', '-qb', 'feature');
  for (let i = 0; i < 3; i++) commit({ [`src/f${i}.js`]: 'f\n'.repeat(60) }, `feature ${i}`);
  g('checkout', '-q', 'main');
  g('merge', '-q', '--no-ff', '-m', 'merge feature', 'feature');
  const merge = g('rev-parse', 'HEAD').trim();
  writeFileSync(join(dir, 'test/b.test.js'), 'z\n');
  commit({ 'src/c.js': 'c\n' }, 'rewrites a test');
  commit({ 'src/a.js': 'b\n' }, 'changes a');
  commit({ 'src/a.js': 'c\n', 'test/c.test.js': 't\n' }, 'builds on that change');
  const [facts] = gather(dir, { until: ['2025-01-01'] });
  assert.equal(facts.hash, start);
  assert.equal(facts.date, '2024-12-01');
  assert.equal(facts.native, false);
  assert.equal(facts.testsGreen, null);
  assert.deepEqual(facts.following.map((c) => [c.product, c.files, c.lines, c.branchCommits, c.tests, c.testDeletions, c.appliesToStart]),
    [[false, 0, 0, 1, 1, 0, true], [true, 1, 10, 1, 1, 0, true], [false, 0, 0, 1, 3, 0, true], [true, 3, 180, 3, 0, 0, true], [true, 1, 1, 1, 1, 1, false],
      [true, 1, 2, 1, 0, 0, true], [true, 1, 2, 1, 1, 0, false]]);
  assert.equal(facts.following[1].hash, one);
  assert.equal(facts.following[1].subject, 'small');
  assert.equal(facts.following[3].hash, merge);
  commit({ '.claude/settings.json': '{}' }, 'native');
  assert.equal(gather(dir, { until: ['2025-03-01'] })[0].native, true);
});

test('countWords counts whitespace separated words', () => {
  assert.equal(countWords('# Title\n\nOne two  three\n'), 5);
});

const effort = (dir, sel, drop = null) => writeFileSync(join(dir, 'b-effort.json'), JSON.stringify({
  minutes: Object.fromEntries(sel.repos.filter((r) => r.id !== drop).map((r) => [`${r.id}/${r.start}`, 2.5])),
}));

function selected(dir) {
  const sel = selectCorpus(loadCorpus(dir));
  writeFileSync(join(dir, 'selection.json'), `${JSON.stringify(sel, null, 2)}\n`);
  return sel;
}

test('--check-b fails when a B file is missing, over 400 words, or stale selection; passes otherwise', () => {
  const dir = join(tmp, 'check');
  cpSync(FIXTURE, dir, { recursive: true });
  const sel = selected(dir);
  const run = () => spawnSync(process.execPath, [CLI, '--manifest', dir, '--check-b'], { encoding: 'utf8' });

  const missing = run();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing/);

  for (const r of sel.repos) put(dir, r.id, r.start, 'Run the tests with the suite command. '.repeat(10));
  const noEffort = run();
  assert.equal(noEffort.status, 1);
  assert.match(noEffort.stderr, /b-effort\.json/);
  effort(dir, sel);
  assert.equal(run().status, 0, run().stderr);

  put(dir, sel.repos[0].id, sel.repos[0].start, 'word '.repeat(401));
  const over = run();
  assert.equal(over.status, 1);
  assert.match(over.stderr, /401 words/);

  put(dir, sel.repos[0].id, sel.repos[0].start, 'word '.repeat(400));
  assert.equal(run().status, 0);

  const cand = JSON.parse(readFileSync(join(dir, 'candidates.json'), 'utf8'));
  cand.repos.find((r) => r.id === 'go-fast').suiteSeconds = 5;
  cand.repos.find((r) => r.id === 'go-big').suiteSeconds = 1;
  writeFileSync(join(dir, 'candidates.json'), JSON.stringify(cand));
  const stale = run();
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /selection\.json.*differs/);
});

test('--check-b fails when b-effort.json lacks minutes for a selected start', () => {
  const dir = join(tmp, 'effort');
  cpSync(FIXTURE, dir, { recursive: true });
  const sel = selected(dir);
  for (const r of sel.repos) put(dir, r.id, r.start, 'Run the tests.');
  const run = () => spawnSync(process.execPath, [CLI, '--manifest', dir, '--check-b'], { encoding: 'utf8' });
  const dropped = sel.repos[1];
  effort(dir, sel, dropped.id);
  const short = run();
  assert.equal(short.status, 1);
  assert.match(short.stderr, new RegExp(`b-effort\\.json.*${dropped.id}/${dropped.start}`));
  assert.deepEqual(checkB(dir, sel).problems.length, 1);
  writeFileSync(join(dir, 'b-effort.json'), JSON.stringify({ minutes: Object.fromEntries(sel.repos.map((r) => [`${r.id}/${r.start}`, 0])) }));
  assert.equal(run().status, 1, 'zero minutes are not a recording');
  effort(dir, sel);
  assert.equal(run().status, 0, run().stderr);
});

test('the same candidates, suites.jsonl and exclusions write a byte-identical selection.json', () => {
  const rows = [{ repo: 'go-fast', commit: '1000000000000000000000000000000000000001', offlineExit: 0, onlineExit: null, seconds: 30, recipe: 'x', host: 'h' }];
  const outputs = ['one', 'two'].map((name) => {
    const dir = join(tmp, `det-${name}`);
    cpSync(FIXTURE, dir, { recursive: true });
    writeFileSync(join(dir, 'suites.jsonl'), rows.map((r) => `${JSON.stringify(r)}\n`).join(''));
    const run = spawnSync(process.execPath, [CLI, '--manifest', dir, '--write'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    return readFileSync(join(dir, 'selection.json'), 'utf8');
  });
  assert.equal(outputs[0], outputs[1]);
  assert.equal(outputs[0], `${JSON.stringify(selectCorpus(loadCorpus(join(tmp, 'det-one'))), null, 2)}\n`);
});

test('checkB reports every problem, not just the first', () => {
  const dir = join(tmp, 'all');
  cpSync(FIXTURE, dir, { recursive: true });
  const sel = selected(dir);
  assert.equal(checkB(dir, sel).problems.length, 2 * sel.repos.length);
});

test('CLI usage errors exit 2; --write stores selection.json', () => {
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, '--manifest', join(tmp, 'nowhere')], { encoding: 'utf8' }).status, 2);
  const dir = join(tmp, 'write');
  cpSync(FIXTURE, dir, { recursive: true });
  const out = execFileSync(process.execPath, [CLI, '--manifest', dir, '--write'], { encoding: 'utf8' });
  assert.ok(JSON.parse(readFileSync(join(dir, 'selection.json'), 'utf8')).repos.length === 3);
  assert.ok(out.length > 0);
});

const PY1 = '1000000000000000000000000000000000000001';
const following = (c, start = PY1) => c.starts.find((x) => x.hash === start).following;
const commit = (hash, files, lines, extra = {}) => ({ hash, product: true, files, lines, branchCommits: 1, tests: 1, testDeletions: 0, appliesToStart: true, ...extra });
const pyScenario = (sel) => sel.repos.find((r) => r.id === 'pyrepo').scenario;

test('scenario: a non-merge commit with 150–1500 product lines is chosen; 149 and 1501 are not', () => {
  const sel = select((c) => { c.starts.find((s) => s.hash === PY1).following.splice(4, 1, commit('a000000000000000000000000000000000000081', 12, 149),
    commit('a000000000000000000000000000000000000082', 12, 1501), commit('a000000000000000000000000000000000000083', 12, 200)); });
  assert.equal(pyScenario(sel), 'a000000000000000000000000000000000000083');
  const low = select((c) => { following(c).splice(4, 1, commit('a000000000000000000000000000000000000084', 12, 150), commit('a000000000000000000000000000000000000085', 12, 400)); });
  assert.equal(pyScenario(low), 'a000000000000000000000000000000000000084');
  const high = select((c) => { following(c).splice(4, 1, commit('a000000000000000000000000000000000000086', 12, 1500)); });
  assert.equal(pyScenario(high), 'a000000000000000000000000000000000000086');
  const edge = select((c) => { following(c).splice(4, 1, commit('a000000000000000000000000000000000000081', 12, 149)); });
  assert.equal(edge.repos.find((r) => r.id === 'pyrepo').start, '1000000000000000000000000000000000000003', 'no scenario, no quota at this start');
});

test('scenario: no branch minimum: a one-commit change is a scenario', () => {
  assert.equal(pyScenario(select((c) => { following(c).find((x) => x.hash.endsWith('5')).branchCommits = 1; })), 'a000000000000000000000000000000000000005');
});

test('scenario: the two chosen singles are never reused; a third single-sized commit may be the scenario', () => {
  const none = select((c) => { following(c).splice(0, 5, commit('a000000000000000000000000000000000000071', 1, 150), commit('a000000000000000000000000000000000000072', 1, 150)); });
  assert.equal(none.repos.find((r) => r.id === 'pyrepo').start, '1000000000000000000000000000000000000003', 'two 150-line singles leave no scenario');
  const third = select((c) => { following(c).splice(0, 5, commit('a000000000000000000000000000000000000071', 1, 150), commit('a000000000000000000000000000000000000072', 1, 150),
    commit('a000000000000000000000000000000000000073', 1, 150)); });
  const py = third.repos.find((r) => r.id === 'pyrepo');
  assert.deepEqual(py.singles, ['a000000000000000000000000000000000000071', 'a000000000000000000000000000000000000072']);
  assert.equal(py.scenario, 'a000000000000000000000000000000000000073');
});

test('the task window is 100 commits after the start: commit 100 counts, commit 101 does not', () => {
  assert.equal(WINDOW, 100);
  const filler = (n) => Array.from({ length: n }, (_, i) => ({ hash: `f${String(i).padStart(39, '0')}`, product: false, files: 0, lines: 0, branchCommits: 1, tests: 0, testDeletions: 0, appliesToStart: true }));
  const place = (position) => select((c) => {
    const f = following(c);
    const keep = f.slice(0, 4);
    f.length = 0;
    f.push(...keep, ...filler(position - 5), commit('a000000000000000000000000000000000000005', 12, 400));
  });
  const in100 = place(100);
  assert.equal(in100.repos.find((r) => r.id === 'pyrepo').start, PY1);
  assert.equal(pyScenario(in100), 'a000000000000000000000000000000000000005');
  assert.equal(place(101).repos.find((r) => r.id === 'pyrepo').start, '1000000000000000000000000000000000000003');
});

test('a task commit that does not apply is skipped with "does not apply" and the next eligible one is taken', () => {
  const sel = select((c) => { const f = following(c); f[1].appliesToStart = false; f.push(commit('a000000000000000000000000000000000000009', 1, 5)); });
  const py = sel.repos.find((r) => r.id === 'pyrepo');
  assert.deepEqual(py.singles, ['a000000000000000000000000000000000000004', 'a000000000000000000000000000000000000009']);
  assert.equal(py.start, PY1);
  assert.equal(sel.excluded.find((e) => e.id === `pyrepo@a000000000000000000000000000000000000002`).reason, 'other: does not apply');
  assert.ok(!select().excluded.some((e) => e.reason === 'other: does not apply'));
});

test('referenceTree is the start tree plus the task commit own diff, not the commit tree; a conflicting diff gives null', () => {
  const dir = join(tmp, 'ref');
  mkdirSync(dir);
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  const save = (f, body) => writeFileSync(join(dir, f), body);
  const done = (msg) => { g('add', '-A'); g('commit', '-qm', msg); return g('rev-parse', 'HEAD').trim(); };
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  save('a.txt', '1\n2\n3\n4\n5\n6\n7\n8\n'); save('c.txt', 'c\n');
  const start = done('start');
  save('c.txt', 'c changed\n');
  done('unrelated');
  save('a.txt', '1\n2\n3\n4\n5\n6\n7\n8 task\n'); save('new.txt', 'n\n');
  const task = done('task');
  save('a.txt', '1\n2\n3\n4\n5\n6\n7 clash\n8 task\n');
  const clash = done('builds on the task');
  const tree = referenceTree(dir, start, task);
  assert.notEqual(tree, g('rev-parse', `${task}^{tree}`).trim());
  const index = join(tmp, 'ref.index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  const run = (args, input) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env, input });
  run(['read-tree', start]);
  run(['apply', '--cached'], g('diff', `${task}^`, task));
  assert.equal(tree, run(['write-tree']).trim());
  assert.equal(g('show', `${tree}:c.txt`), 'c\n');
  assert.equal(g('show', `${tree}:new.txt`), 'n\n');
  assert.equal(referenceTree(dir, start, clash), null);
});

test('gather records at most WINDOW following commits', () => {
  const dir = join(tmp, 'window');
  mkdirSync(dir);
  const date = '2025-02-01T00:00:00Z';
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  g('add', '-A');
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'start'], { env: { ...process.env, GIT_AUTHOR_DATE: '2024-12-01T00:00:00Z', GIT_COMMITTER_DATE: '2024-12-01T00:00:00Z' } });
  for (let i = 0; i < 101; i++) g('commit', '-q', '--allow-empty', '-m', `c${i}`);
  const [facts] = gather(dir, { until: ['2025-01-01'] });
  assert.equal(facts.following.length, 100);
  assert.equal(facts.following[99].subject, 'c99');
});

const poolRun = (dir, ...extra) => spawnSync(process.execPath, [CLI, '--manifest', dir, '--pool', join(dir, 'search'), ...extra], { encoding: 'utf8' });
const poolDir = (name) => { const dir = join(tmp, name); mkdirSync(dir); cpSync(join(POOL, 'search'), join(dir, 'search'), { recursive: true }); return dir; };

test('--pool turns saved responses into candidates.json byte for byte: slot, stars descending, id', () => {
  const dir = poolDir('pool');
  assert.equal(poolRun(dir).status, 0);
  const text = readFileSync(join(dir, 'candidates.json'), 'utf8');
  assert.equal(text, readFileSync(join(POOL, 'candidates.json'), 'utf8'));
  const cand = JSON.parse(text);
  assert.deepEqual(cand.slots, ['go', 'python', 'web']);
  assert.deepEqual(cand.repos.map((r) => [r.slot, r.id, r.stars]), [['go', 'g-faster', 9], ['go', 'g-fast', 7], ['python', 'a-alpha', 500], ['python', 'b-zeta-py', 100],
    ['python', 'c-beta', 100], ['web', 'w-site-js', 42]]);
  assert.equal(cand.repos[0].source, 'GitHub Search 2026-10-15');
  assert.equal(poolRun(dir).status, 0);
  assert.equal(readFileSync(join(dir, 'candidates.json'), 'utf8'), text, 'idempotent');
});

test('--pool keeps only the first 30 entries of a slot', () => {
  const dir = poolDir('pool30');
  const file = join(dir, 'search', 'go.json');
  const res = JSON.parse(readFileSync(file, 'utf8'));
  res.items = Array.from({ length: 31 }, (_, i) => ({ ...res.items[0], name: `r${i}`, full_name: `g/r${i}`, clone_url: `https://github.com/g/r${i}.git`, html_url: `https://github.com/g/r${i}`, stargazers_count: 1000 - i }));
  writeFileSync(file, JSON.stringify(res));
  assert.equal(poolRun(dir).status, 0);
  const go = JSON.parse(readFileSync(join(dir, 'candidates.json'), 'utf8')).repos.filter((r) => r.slot === 'go');
  assert.equal(go.length, 30);
  assert.equal(go.at(-1).id, 'g-r29');
});

test('--pool --check: 0 when candidates.json matches the saved responses, 1 when either side changed', () => {
  const dir = poolDir('poolcheck');
  assert.equal(poolRun(dir, '--check').status, 1, 'no candidates.json yet differs');
  assert.equal(poolRun(dir).status, 0);
  assert.equal(poolRun(dir, '--check').status, 0);
  const file = join(dir, 'candidates.json');
  const text = readFileSync(file, 'utf8');
  writeFileSync(file, text.replace('"stars": 500', '"stars": 501'));
  const edited = poolRun(dir, '--check');
  assert.equal(edited.status, 1);
  assert.match(edited.stderr, /candidates\.json/);
  writeFileSync(file, text);
  const go = join(dir, 'search', 'go.json');
  const res = JSON.parse(readFileSync(go, 'utf8'));
  res.items.pop();
  writeFileSync(go, JSON.stringify(res));
  assert.equal(poolRun(dir, '--check').status, 1);
});

test('--pool keeps git facts and starts that --gather recorded; --check accepts them', () => {
  const dir = poolDir('poolfacts');
  assert.equal(poolRun(dir).status, 0);
  const file = join(dir, 'candidates.json');
  const cand = JSON.parse(readFileSync(file, 'utf8'));
  Object.assign(cand.repos.find((r) => r.id === 'a-alpha'), { commits: 500, contributors: 9, files: 700, factsAt: PY1 });
  cand.starts.push({ repo: 'a-alpha', hash: PY1, date: '2024-12-31', testsGreen: null, native: false, following: [] });
  writeFileSync(file, `${JSON.stringify(cand, null, 2)}\n`);
  assert.equal(poolRun(dir, '--check').status, 0);
  assert.equal(poolRun(dir).status, 0);
  const again = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(again.repos.find((r) => r.id === 'a-alpha').commits, 500);
  assert.equal(again.starts.length, 1);
});

const gatherRun = (dir, git, id) => spawnSync(process.execPath, [CLI, '--manifest', dir, '--gather', git, '--repo', id], { encoding: 'utf8' });

test('--gather with --manifest stores repo facts always, starts only for candidates that pass the static criteria', () => {
  const dir = poolDir('gathered');
  assert.equal(poolRun(dir).status, 0);
  const small = join(tmp, 'gather-small');
  mkdirSync(small);
  const g = (...a) => execFileSync('git', ['-C', small, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: '2024-12-01T00:00:00Z', GIT_COMMITTER_DATE: '2024-12-01T00:00:00Z' } });
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  writeFileSync(join(small, 'a.txt'), 'a\n'); g('add', '-A'); g('commit', '-qm', 'one');
  g('-c', 'user.email=u@u', '-c', 'user.name=u', 'commit', '-q', '--allow-empty', '-m', 'two');
  const run = gatherRun(dir, small, 'a-alpha');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /0 starts recorded \(too small\)/);
  const repo = JSON.parse(readFileSync(join(dir, 'candidates.json'), 'utf8')).repos.find((r) => r.id === 'a-alpha');
  assert.deepEqual([repo.commits, repo.contributors, repo.files], [2, 2, 1]);
  assert.match(repo.factsAt, /^[0-9a-f]{40}$/);
  assert.equal(poolRun(dir, '--check').status, 0);
  assert.equal(gatherRun(dir, small, 'nope').status, 2);
});

test('--gather with --manifest records starts for a candidate of qualifying size, replacing earlier ones', () => {
  const dir = poolDir('gathered-big');
  assert.equal(poolRun(dir).status, 0);
  const big = join(tmp, 'gather-big');
  mkdirSync(big);
  const stamp = (n) => `${Date.parse('2024-06-01T00:00:00Z') / 1000 + n * 60} +0000`;
  let stream = '';
  for (let i = 0; i < 205; i++) {
    const who = ['a', 'b', 'c'][i % 3];
    stream += `commit refs/heads/main\ncommitter ${who} <${who}@x> ${stamp(i)}\ndata 3\nc${i % 10}\n`;
    if (i === 0) for (let f = 0; f < 300; f++) stream += `M 100644 inline f${f}.txt\ndata 2\nx\n`;
    stream += `M 100644 inline src/n${i}.txt\ndata 2\ny\n`;
  }
  stream += `commit refs/heads/main\ncommitter a <a@x> ${Date.parse('2025-02-01T00:00:00Z') / 1000} +0000\ndata 4\nlate\nM 100644 inline src/late.txt\ndata 2\nz\n`;
  execFileSync('git', ['-C', big, 'init', '-q', '-b', 'main']);
  execFileSync('git', ['-C', big, 'fast-import', '--quiet'], { input: stream });
  const first = gatherRun(dir, big, 'a-alpha');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /2 starts recorded/);
  const cand = () => JSON.parse(readFileSync(join(dir, 'candidates.json'), 'utf8'));
  const repo = cand().repos.find((r) => r.id === 'a-alpha');
  assert.deepEqual([repo.commits, repo.contributors, repo.files], [205, 3, 505]);
  assert.equal(cand().starts.length, 2);
  assert.equal(cand().starts[0].repo, 'a-alpha');
  assert.equal(cand().starts[0].hash, repo.factsAt);
  assert.equal(gatherRun(dir, big, 'a-alpha').status, 0);
  assert.equal(cand().starts.length, 2, "rerun replaces, not appends");
});

test('parallel --gather runs into one candidates.json keep every result', async () => {
  const dir = poolDir('parallel');
  assert.equal(poolRun(dir).status, 0);
  // A large file widens the read-modify-write window that the lock must cover.
  const file = join(dir, 'candidates.json');
  const big = JSON.parse(readFileSync(file, 'utf8'));
  big.starts.push({ repo: 'a-alpha', hash: PY1, date: '2024-12-31', testsGreen: null, native: false,
    following: Array.from({ length: 60000 }, (_, i) => commit(`f${String(i).padStart(39, '0')}`, 1, 1, { subject: 'padding padding padding' })) });
  writeFileSync(file, JSON.stringify(big));
  const ids = ['a-alpha', 'b-zeta-py', 'c-beta', 'g-fast', 'g-faster', 'w-site-js'];
  const src = join(tmp, 'parallel-src');
  mkdirSync(src);
  const env = { ...process.env, GIT_AUTHOR_DATE: '2024-12-01T00:00:00Z', GIT_COMMITTER_DATE: '2024-12-01T00:00:00Z' };
  const g = (...a) => execFileSync('git', ['-C', src, ...a], { encoding: 'utf8', env });
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  writeFileSync(join(src, 'a.txt'), 'a\n'); g('add', '-A'); g('commit', '-qm', 'one');
  const { spawn } = await import('node:child_process');
  const codes = await Promise.all(ids.map((id) => new Promise((done) => {
    spawn(process.execPath, [CLI, '--manifest', dir, '--gather', src, '--repo', id], { stdio: 'ignore' }).on('exit', done);
  })));
  assert.deepEqual(codes, ids.map(() => 0));
  const repos = JSON.parse(readFileSync(join(dir, 'candidates.json'), 'utf8')).repos;
  assert.deepEqual(repos.map((r) => r.commits), ids.map(() => 1));
});
