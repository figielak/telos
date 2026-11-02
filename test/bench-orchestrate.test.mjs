import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expandMatrix } from '../bench/lib/matrix.mjs';
import { runMatrix } from '../bench/lib/orchestrate.mjs';

const FIX = fileURLToPath(new URL('./fixtures/bench/orchestrate/', import.meta.url));
const RUN = fileURLToPath(new URL('../bench/run.mjs', import.meta.url));
const MANIFEST = fileURLToPath(new URL('./fixtures/bench/manifest', import.meta.url));

function tmp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'bench-orch-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const manifest = (tasks = ['t-one', 't-two']) => ({
  dir: FIX, repetitions: 1, repos: [{ id: 'r1', url: 'https://example.invalid/r1.git' }],
  tasks: tasks.map((id) => ({ id, repo: 'r1', start: '1'.repeat(40), reference: 'a'.repeat(40), type: 'single', prompt: `do ${id}`,
    expectedPaths: [], acceptance: `acceptance/${id}.mjs`, b: 'unused' })),
});
const cellsOf = (m, opts = {}) => expandMatrix(m, { seed: '7', reps: 1, ...opts }).cells;

/** Every file below `root` (for the visibility check). */
function files(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true }).map((p) => join(root, p)).filter((p) => !p.includes('/.git/') && statSync(p).isFile());
}

/**
 * Fake workspace + trajectory: each copy is a fresh git repo at a "start" commit; the trajectory writes out.txt and
 * reports the scripted cost. `seen` collects what the agent could see while it "ran".
 */
function fakeDeps(work, { cost = 0.2, status = 'completed', write = 'done', costs, out } = {}) {
  const seen = [];
  const calls = [];
  let n = 0;
  return {
    seen, calls,
    prepare(cell) {
      const dir = join(work, 'copies', cell.id);
      const config = join(work, 'config', cell.id);
      mkdirSync(dir, { recursive: true });
      mkdirSync(config, { recursive: true });
      const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
      g('init', '-q', '-b', 'bench'); g('config', 'user.email', 'b@b'); g('config', 'user.name', 'b');
      writeFileSync(join(dir, 'src.txt'), 'start\n');
      g('add', '-A'); g('commit', '-qm', 'start');
      return { dir, start: g('rev-parse', 'HEAD').trim(), env: { PATH: process.env.PATH }, readable: [dir, config], setupUsd: 0 };
    },
    async runTrajectory(cell, ctx) {
      calls.push({ id: cell.id, budget: ctx.cellBudgetUsd });
      const visible = [...ctx.readable.flatMap(files), ...files(work), ...(out ? files(out) : [])];
      seen.push({ id: cell.id, acceptance: visible.filter((p) => readFileSync(p, 'utf8').includes('Hidden acceptance fixture')) });
      writeFileSync(join(ctx.cwd, 'out.txt'), `${write}\n`);
      writeFileSync(join(ctx.cwd, 'src.txt'), 'changed\n');
      const usd = costs ? costs[n++] : cost;
      return { status, sessions: [{ step: 'task', sessionId: `s-${cell.id}`, costUsd: usd, usage: { input_tokens: 1 } }], spentUsd: usd };
    },
    versions: () => ({ claude: 'fake 1.0', telos: 'abc123', node: process.version }),
  };
}
const records = (out) => readdirSync(join(out, 'records')).filter((f) => f.endsWith('.json')).sort();
const record = (out, id) => JSON.parse(readFileSync(join(out, 'records', `${id}.json`), 'utf8'));

test('acceptance material is invisible while the agent runs, present only during grading, removed after', async (t) => {
  const root = tmp(t);
  const out = join(root, 'out');
  const deps = fakeDeps(join(root, 'work'), { out });
  const m = manifest(['t-one']);
  const res = await runMatrix(cellsOf(m, { variant: 'A' }), m, { outDir: out, capUsd: 5, reservation: 1, deps });
  assert.equal(res.records.length, 1, 'one record');
  assert.deepEqual(deps.seen, [{ id: 't-one.A.1', acceptance: [] }]);
  const graded = JSON.parse(readFileSync(join(root, 'work', 'copies', 't-one.A.1', 'graded.json'), 'utf8'));
  assert.equal(graded.ok, true);
  assert.equal(graded.cwd, join(root, 'work', 'copies', 't-one.A.1'));
  assert.ok(!graded.dir.startsWith(FIX), 'graded from a fresh copy, not the manifest dir');
  assert.ok(graded.dir.startsWith(join(out, 'grading')), graded.dir);
  assert.ok(!existsSync(graded.dir), 'grading dir removed afterwards');
  assert.equal(res.records[0].accepted, true);
});

test('record holds status, acceptance result, patch, changed paths, sessions, spend and versions', async (t) => {
  const root = tmp(t);
  const deps = fakeDeps(join(root, 'work'));
  const m = manifest(['t-one']);
  const out = join(root, 'out');
  const res = await runMatrix(cellsOf(m, { variant: 'B' }), m, { outDir: out, capUsd: 5, reservation: 1, deps });
  assert.equal(res.records.length, 1, 'one record');
  const r = record(out, 't-one.B.1');
  assert.equal(r.cell, 't-one.B.1');
  assert.equal(r.status, 'completed');
  assert.equal(r.accepted, true);
  assert.equal(r.acceptance.exit, 0);
  assert.match(r.acceptance.tail, /behavioural: pass/);
  assert.match(r.patch, /^\+changed$/m);
  assert.deepEqual(r.changedPaths, ['out.txt', 'src.txt']);
  assert.equal(r.sessions[0].sessionId, 's-t-one.B.1');
  assert.equal(r.spentUsd, 0.2);
  assert.deepEqual(r.versions, { claude: 'fake 1.0', telos: 'abc123', node: process.version });
  assert.equal(r.attempt, 1);
  assert.ok(!existsSync(join(out, 'records', 't-one.B.1.inprogress')));
});

test('a failing acceptance or a failed trajectory is not accepted', async (t) => {
  const root = tmp(t);
  const m = manifest(['t-one']);
  const bad = await runMatrix(cellsOf(m, { variant: 'A' }), m, { outDir: join(root, 'o1'), capUsd: 5, reservation: 1, deps: fakeDeps(join(root, 'w1'), { write: 'nope' }) });
  assert.equal(bad.records.length, 1, 'one record');
  assert.equal(bad.records[0].accepted, false);
  assert.equal(bad.records[0].acceptance.exit, 1);
  const failed = await runMatrix(cellsOf(m, { variant: 'A' }), m, { outDir: join(root, 'o2'), capUsd: 5, reservation: 1, deps: fakeDeps(join(root, 'w2'), { status: 'failed' }) });
  assert.equal(failed.records.length, 1, 'one record');
  assert.equal(failed.records[0].accepted, false);
  assert.equal(failed.records[0].acceptance, null, 'a failed run is not graded');
});

test('cap: a block whose reservation would exceed the cap is not started, its cells and the rest are listed as skipped', async (t) => {
  const root = tmp(t);
  const deps = fakeDeps(join(root, 'work'), { cost: 0.9 });
  const m = manifest(['t-one', 't-two']);
  const cells = cellsOf(m);
  const res = await runMatrix(cells, m, { outDir: join(root, 'out'), capUsd: 5, reservation: 1, deps });
  assert.equal(res.records.length, 4, 'one block of four fits: 4 × 1 ≤ 5; the second (spent 3.6 + 4) does not');
  assert.deepEqual(res.skipped, cells.slice(4).map((c) => c.id));
  assert.ok(res.spentUsd <= 5);
  assert.equal(res.spentUsd, 3.6);
  assert.deepEqual(deps.calls.map((c) => c.budget), [1, 1, 1, 1]);
});

test('spend never exceeds the cap in a fake run whose sessions use their whole budget', async (t) => {
  const root = tmp(t);
  const m = manifest(['t-one', 't-two']);
  const deps = fakeDeps(join(root, 'work'));
  deps.runTrajectory = async (cell, ctx) => ({ status: 'failed', reason: 'budget', sessions: [{ costUsd: ctx.cellBudgetUsd }], spentUsd: ctx.cellBudgetUsd });
  const res = await runMatrix(cellsOf(m), m, { outDir: join(root, 'out'), capUsd: 7.5, reservation: 1, deps });
  assert.ok(res.spentUsd <= 7.5, String(res.spentUsd));
  assert.equal(res.records.length, 4);
});

test('unknown spend of a cell is charged as its whole reservation', async (t) => {
  const root = tmp(t);
  const m = manifest(['t-one']);
  const deps = fakeDeps(join(root, 'work'), { costs: [null, 0.1, 0.1, 0.1] });
  const res = await runMatrix(cellsOf(m), m, { outDir: join(root, 'out'), capUsd: 5, reservation: 1, deps });
  assert.equal(res.spentUsd, 1.3);
  assert.equal(res.records.find((r) => r.spentUsd === null).spendUnverified, true);
});

test('crash after the sessions, before the record: resume reruns the cell once, no duplicate, both spends counted', async (t) => {
  const root = tmp(t);
  const m = manifest(['t-one']);
  const out = join(root, 'out');
  const cells = cellsOf(m, { variant: 'A' });
  const crash = fakeDeps(join(root, 'w1'));
  crash.beforeRecord = () => { throw new Error('host crashed'); };
  await assert.rejects(runMatrix(cells, m, { outDir: out, capUsd: 5, reservation: 1, deps: crash }), /host crashed/);
  assert.ok(existsSync(join(out, 'records', 't-one.A.1.inprogress')));
  assert.deepEqual(records(out), []);
  const deps = fakeDeps(join(root, 'w2'));
  const res = await runMatrix(cells, m, { outDir: out, capUsd: 5, reservation: 1, deps });
  assert.deepEqual(records(out), ['t-one.A.1.json']);
  assert.equal(record(out, 't-one.A.1').attempt, 2);
  assert.equal(res.spentUsd, 0.4, 'the abandoned attempt still counts');
  assert.ok(!existsSync(join(out, 'records', 't-one.A.1.inprogress')));
  const again = fakeDeps(join(root, 'w3'));
  again.beforeRecord = () => { throw new Error('crash again'); };
  const out2 = join(root, 'out2');
  await assert.rejects(runMatrix(cells, m, { outDir: out2, capUsd: 5, reservation: 1, deps: crash }));
  await assert.rejects(runMatrix(cells, m, { outDir: out2, capUsd: 5, reservation: 1, deps: again }));
  const third = fakeDeps(join(root, 'w4'));
  const last = await runMatrix(cells, m, { outDir: out2, capUsd: 5, reservation: 1, deps: third });
  assert.equal(third.calls.length, 0, 'never a third attempt');
  assert.equal(last.records[0].status, 'failed');
  assert.match(last.records[0].reason, /abandoned/);
  assert.equal(last.spentUsd, 0.4);
});

test('a completed record is never rerun on resume', async (t) => {
  const root = tmp(t);
  const m = manifest(['t-one']);
  const out = join(root, 'out');
  const cells = cellsOf(m);
  await runMatrix(cells, m, { outDir: out, capUsd: 5, reservation: 1, deps: fakeDeps(join(root, 'w1')) });
  const deps = fakeDeps(join(root, 'w2'));
  const res = await runMatrix(cells, m, { outDir: out, capUsd: 5, reservation: 1, deps });
  assert.equal(deps.calls.length, 0);
  assert.equal(res.records.length, 0);
  assert.equal(res.spentUsd, 0.8, 'earlier spend still counts toward the cap');
  assert.equal(records(out).length, 4);
});

test('grading script missing → record failed: no-acceptance, nothing spent on it, the run stops', async (t) => {
  const root = tmp(t);
  const m = manifest(['t-one', 't-three']);
  const deps = fakeDeps(join(root, 'work'));
  const cells = cellsOf(m, { variant: 'A' });
  const res = await runMatrix(cells, m, { outDir: join(root, 'out'), capUsd: 5, reservation: 1, deps });
  const bad = res.records.find((r) => r.cell === 't-three.A.1');
  assert.ok(bad, 'a record for the cell without acceptance');
  assert.equal(bad.status, 'failed');
  assert.equal(bad.reason, 'no-acceptance');
  assert.ok(!deps.calls.some((c) => c.id === 't-three.A.1'));
  const after = cells.slice(cells.findIndex((c) => c.id === 't-three.A.1') + 1).map((c) => c.id);
  assert.deepEqual(res.skipped, after);
  assert.equal(res.stopped, 'no-acceptance: t-three.A.1');
});

test('acceptance material inside the readable set is refused before any session', async (t) => {
  const root = tmp(t);
  const m = manifest(['t-one']);
  const deps = fakeDeps(join(root, 'work'));
  const prepare = deps.prepare;
  deps.prepare = (cell) => ({ ...prepare(cell), readable: [FIX] });
  const res = await runMatrix(cellsOf(m, { variant: 'A' }), m, { outDir: join(root, 'out'), capUsd: 5, reservation: 1, deps });
  assert.equal(res.records.length, 1, 'one record');
  assert.equal(res.records[0].status, 'refused');
  assert.match(res.records[0].reason, /acceptance .* readable/);
  assert.equal(deps.calls.length, 0);
  assert.ok(res.stopped);
});

test('wall-clock gaps between cells are recorded', async (t) => {
  const root = tmp(t);
  const m = manifest(['t-one']);
  const res = await runMatrix(cellsOf(m), m, { outDir: join(root, 'out'), capUsd: 5, reservation: 1, deps: fakeDeps(join(root, 'w')) });
  assert.equal(res.records.length, 4, 'four records');
  assert.equal(res.records[0].gapMs, null);
  for (const r of res.records.slice(1)) assert.ok(Number.isInteger(r.gapMs) && r.gapMs >= 0);
});

const run = (...args) => spawnSync(process.execPath, [RUN, ...args], { encoding: 'utf8' });

test('run.mjs --dry-run prints the ordered cells with argv and spawns nothing', (t) => {
  const out = join(tmp(t), 'dry');
  const r = run('--manifest', MANIFEST, '--dry-run', '--seed', '1', '--cap-usd', '1', '--cell-usd', '0.1', '--out', out, '--reps', '1', '--only', 't-one');
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  const cells = expandMatrix({ ...JSON.parse(readFileSync(join(MANIFEST, 'manifest.json'), 'utf8')), repetitions: 5 }, { seed: '1', reps: 1, only: ['t-one'] }).cells;
  assert.deepEqual(lines.filter((l) => l.startsWith('cell ')).map((l) => l.split(' ')[1]), cells.map((c) => c.id));
  assert.match(r.stdout, /--model <model>/);
  assert.match(r.stdout, /--plugin-dir/);
  assert.ok(!existsSync(join(out, 'records')), 'dry run writes no records');
});

test('run.mjs usage errors exit 2; an out dir inside the repo is refused unless it is bench/results/raw', (t) => {
  assert.equal(run().status, 2);
  assert.equal(run('--manifest', MANIFEST, '--dry-run', '--seed', '1', '--cap-usd', 'x', '--cell-usd', '0.1', '--out', '/tmp/x').status, 2);
  assert.equal(run('--manifest', MANIFEST, '--seed', '1', '--cap-usd', '1', '--cell-usd', '0.1', '--out', join(tmp(t), 'o')).status, 2, 'a real run needs --config');
  assert.equal(run('--manifest', MANIFEST, '--dry-run', '--seed', '1', '--cap-usd', '1', '--cell-usd', '2', '--out', '/tmp/x').status, 2, 'cell over cap');
  assert.equal(run('--manifest', MANIFEST, '--dry-run', '--seed', '1', '--cap-usd', '1', '--cell-usd', '0.1', '--out', fileURLToPath(new URL('../bench/out', import.meta.url))).status, 2);
  assert.equal(run('--manifest', MANIFEST, '--dry-run', '--bogus').status, 2);
});

test('cap: spend of a cell interrupted during its sessions counts before the next block check, not after', async (t) => {
  const root = tmp(t);
  const m = manifest(['t-one']);
  const out = join(root, 'out');
  const cells = cellsOf(m);
  const crash = fakeDeps(join(root, 'w1'));
  crash.runTrajectory = async () => { throw new Error('killed mid-session'); };
  await assert.rejects(runMatrix(cells, m, { outDir: out, capUsd: 4.5, reservation: 1, deps: crash }), /killed mid-session/);
  const deps = fakeDeps(join(root, 'w2'));
  const res = await runMatrix(cells, m, { outDir: out, capUsd: 4.5, reservation: 1, deps });
  assert.equal(deps.calls.length, 0, 'abandoned 1 + block 4 > 4.5: the block must not start');
  assert.deepEqual(res.skipped, cells.map((c) => c.id));
  assert.equal(res.spentUsd, 1);
  const again = await runMatrix(cells, m, { outDir: out, capUsd: 4.5, reservation: 1, deps: fakeDeps(join(root, 'w3')) });
  assert.equal(again.spentUsd, 1, 'the abandoned charge is made once');
});

test('patch capture never runs the copy\'s own git config, hooks or filters', async (t) => {
  const root = tmp(t);
  const m = manifest(['t-one']);
  const deps = fakeDeps(join(root, 'work'));
  const marker = join(root, 'pwned');
  const traj = deps.runTrajectory;
  deps.runTrajectory = async (cell, ctx) => {
    const r = await traj(cell, ctx);
    const g = (...a) => execFileSync('git', ['-C', ctx.cwd, ...a]);
    g('config', 'core.fsmonitor', `touch ${marker}.fsmonitor; false`);
    g('config', 'filter.evil.clean', `touch ${marker}.filter; cat`);
    g('config', 'core.hooksPath', join(root, 'hooks'));
    writeFileSync(join(ctx.cwd, '.gitattributes'), '* filter=evil\n');
    return r;
  };
  const res = await runMatrix(cellsOf(m, { variant: 'A' }), m, { outDir: join(root, 'out'), capUsd: 5, reservation: 1, deps });
  assert.equal(res.records.length, 1);
  assert.ok(!existsSync(`${marker}.fsmonitor`), 'fsmonitor ran');
  assert.ok(!existsSync(`${marker}.filter`), 'clean filter ran');
  assert.match(res.records[0].patch, /^\+changed$/m);
  assert.deepEqual(res.records[0].changedPaths, ['.gitattributes', 'out.txt', 'src.txt']);
});

test('grading uses gradeRoot when given; release runs after grading on every prepared cell, refused ones included', async (t) => {
  const root = tmp(t);
  const deps = fakeDeps(join(root, 'work'));
  const released = [];
  deps.release = (cell, ws) => released.push({ id: cell.id, graded: existsSync(join(ws.dir, 'graded.json')) });
  const prepare = deps.prepare;
  deps.prepare = (cell) => (cell.task === 't-two' ? { ...prepare(cell), readable: [FIX] } : prepare(cell));
  const gradeRoot = join(root, 'work', 'grading');
  for (const id of ['t-one', 't-two']) {
    const m = manifest([id]);
    await runMatrix(cellsOf(m, { variant: 'A' }), m, { outDir: join(root, `out-${id}`), gradeRoot, capUsd: 5, reservation: 1, deps });
  }
  const graded = JSON.parse(readFileSync(join(root, 'work', 'copies', 't-one.A.1', 'graded.json'), 'utf8'));
  assert.ok(graded.dir.startsWith(gradeRoot), graded.dir);
  assert.deepEqual(released.sort((a, b) => a.id.localeCompare(b.id)), [{ id: 't-one.A.1', graded: true }, { id: 't-two.A.1', graded: false }]);
});

test('grading runs through the given grader argv (the launcher), never directly when one is set', async (t) => {
  const root = tmp(t);
  const m = manifest(['t-one']);
  const log = join(root, 'grader.log');
  const wrapper = join(root, 'launch.sh');
  writeFileSync(wrapper, `#!/bin/sh\necho "$@" >> ${log}\nexec "$@"\n`, { mode: 0o755 });
  const res = await runMatrix(cellsOf(m, { variant: 'A' }), m, { outDir: join(root, 'out'), capUsd: 5, reservation: 1,
    deps: fakeDeps(join(root, 'work')), graderArgv: [wrapper, process.execPath] });
  assert.equal(res.records[0].accepted, true);
  assert.match(readFileSync(log, 'utf8'), /grading\/t-one\.A\.1-.*\/t-one\.mjs/);
});
