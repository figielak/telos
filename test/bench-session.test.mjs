import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { baseArgv, runSession } from '../bench/lib/session.mjs';
import { runTrajectory } from '../bench/lib/transitions.mjs';

const HOST = fileURLToPath(new URL('./fixtures/bench/fake-host.mjs', import.meta.url));
const TELOS = fileURLToPath(new URL('./fixtures/bench/fake-telos.mjs', import.meta.url));
const LAUNCHER = ['env'];

function copy(t, rules, state) {
  const dir = mkdtempSync(join(tmpdir(), 'bench-session-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const script = join(dir, '.host.json');
  writeFileSync(script, JSON.stringify({ rules }));
  if (state) writeFileSync(join(dir, 'state.json'), JSON.stringify(state));
  const env = { PATH: process.env.PATH, HOME: dir, FAKE_HOST: script };
  return { dir, env };
}
const calls = (dir) => readFileSync(join(dir, 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const telosCalls = (dir) => { try { return readFileSync(join(dir, 'telos.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const base = (variant, extra = {}) => baseArgv(variant, { launcher: LAUNCHER, claude: [process.execPath, HOST], model: 'claude-test-1', permissionMode: 'acceptEdits',
  pluginDir: '/work/plugin', ...extra });
const ctx = ({ dir, env }, variant, extra = {}) => ({ cwd: dir, env, argvBase: base(variant), telos: [...LAUNCHER, process.execPath, TELOS],
  cellBudgetUsd: 10, sessionTimeoutMs: 10_000, runTimeoutMs: 60_000, ...extra });
const single = (variant, prompt = 'Add a --verbose flag to the CLI.') => ({ id: `t1.${variant}.1`, variant, task: { type: 'single', prompt } });
const multi = (variant, steps = ['Build the export feature.', 'Add CSV output.', 'Document the flag.']) => ({ id: `t2.${variant}.1`, variant, task: { type: 'multi', steps } });
const flag = (argv, name) => argv[argv.indexOf(name) + 1];

test('argv per variant: same model and permission mode, --plugin-dir only for C/D, --max-budget-usd always', async (t) => {
  for (const v of ['A', 'B', 'C', 'D']) {
    const argv = base(v);
    assert.deepEqual(argv.slice(0, 3), ['env', process.execPath, HOST]);
    assert.equal(flag(argv, '--model'), 'claude-test-1');
    assert.equal(flag(argv, '--permission-mode'), 'acceptEdits');
    assert.equal(flag(argv, '--output-format'), 'json');
    assert.equal(argv.includes('--plugin-dir'), v === 'C' || v === 'D', v);
  }
  assert.equal(flag(base('C'), '--plugin-dir'), '/work/plugin');
  const c = copy(t, []);
  const run = await runSession({ prompt: 'hi', env: c.env, cwd: c.dir, argvBase: base('A'), budgetUsd: 1.5, timeoutMs: 10_000 });
  assert.equal(flag(run.argv, '--max-budget-usd'), '1.5');
  assert.deepEqual(calls(c.dir)[0].argv.slice(-2), ['--', 'hi']);
  assert.equal(run.sessionId, flag(run.argv, '--session-id'));
  assert.deepEqual(run.envNames, ['FAKE_HOST', 'HOME', 'PATH']);
  assert.ok(!JSON.stringify(run).includes(c.env.FAKE_HOST), 'env values are never recorded');
});

test('a missing launcher or plugin dir is refused, never a silent fallback', () => {
  assert.throws(() => base('A', { launcher: [] }), /REFUSED: .*launcher/);
  assert.throws(() => base('A', { launcher: undefined }), /REFUSED: .*launcher/);
  assert.throws(() => base('C', { pluginDir: undefined }), /plugin/);
  assert.throws(() => base('A', { model: '' }), /model/);
});

test('runSession refuses a missing or non-positive budget', async () => {
  await assert.rejects(runSession({ prompt: 'x', env: {}, cwd: tmpdir(), argvBase: base('A'), budgetUsd: 0, timeoutMs: 1000 }), /budget/);
});

test('C/D single task: one /telos:quick session with the task text', async (t) => {
  const c = copy(t, []);
  const run = await runTrajectory(single('C'), ctx(c, 'C'));
  assert.equal(run.status, 'completed');
  assert.deepEqual(calls(c.dir).map((x) => x.prompt), ['/telos:quick Add a --verbose flag to the CLI.']);
  const a = copy(t, []);
  await runTrajectory(single('A'), ctx(a, 'A'));
  assert.deepEqual(calls(a.dir).map((x) => x.prompt), ['Add a --verbose flag to the CLI.']);
});

const TASKS = [{ id: '01-01', status: 'draft', depends: [] }, { id: '01-02', status: 'draft', effort: 'hard', depends: ['01-01'] },
  { id: '01-03', status: 'draft', depends: ['01-01'] }];
const approved = TASKS.map((x) => ({ ...x, status: 'approved' }));
const withStatus = (done) => approved.map((x) => (done.includes(x.id) ? { ...x, status: 'done' } : x));
const planRules = (over = {}) => [
  { match: '/telos:plan ', state: { tasks: TASKS, awaiting: '01:D-01', next: '/telos:approve' }, ...over.plan },
  { match: 'accept the recommended options', state: { awaiting: null }, ...over.confirm },
  { match: '/telos:approve', state: { tasks: approved, next: '/telos:do' }, ...over.approve },
  { match: '/telos:do-hard 01-02', state: { tasks: withStatus(['01-01', '01-02']), next: '/telos:do' }, ...over.doHard },
  { match: '/telos:do', states: [{ tasks: withStatus(['01-01']), next: '/telos:do-hard 01-02' },
    { tasks: withStatus(['01-01', '01-02', '01-03']), next: 'close phase 01 (/telos:done)' }], ...over.do },
];

test('C/D scenario: plan → lint → confirm → approve → do / do-hard as Next says, until close phase', async (t) => {
  const c = copy(t, planRules());
  const run = await runTrajectory(multi('D'), ctx(c, 'D'));
  assert.equal(run.status, 'completed', run.reason);
  assert.deepEqual(calls(c.dir).map((x) => x.prompt), ['/telos:plan Build the export feature.\n\nAdd CSV output.\n\nDocument the flag.',
    'accept the recommended options', '/telos:approve', '/telos:do', '/telos:do-hard 01-02', '/telos:do']);
  assert.ok(telosCalls(c.dir).some((a) => a[0] === 'lint-plan'));
  assert.equal(run.sessions.length, 6);
  assert.equal(new Set(run.sessions.map((s) => s.sessionId)).size, 6);
  assert.deepEqual(run.sessions.map((s) => s.step), ['plan', 'confirm', 'approve', 'do', 'do', 'do']);
});

test('C/D: a /telos:do that blocks and escalates to /telos:do-hard is followed', async (t) => {
  const c = copy(t, planRules({ do: { states: [{ blockers: '01-01: tests fail', next: '/telos:do-hard 01-01' },
    { tasks: withStatus(['01-01', '01-02', '01-03']), next: 'close phase 01 (/telos:done)', blockers: 'none' }] },
  doHard: { match: '/telos:do-hard 01-01', state: { tasks: withStatus(['01-01']), blockers: 'none', next: '/telos:do' } } }));
  const run = await runTrajectory(multi('C'), ctx(c, 'C'));
  assert.equal(run.status, 'completed', run.reason);
  assert.deepEqual(calls(c.dir).slice(3).map((x) => x.prompt), ['/telos:do', '/telos:do-hard 01-01', '/telos:do']);
});

test('C/D failures: lint, awaiting user, blocker, unexpected Next, refusal, no progress → failed, no further sessions', async (t) => {
  const cases = [
    [{}, { lint: 1 }, /^lint/, 1],
    [{ confirm: { state: { awaiting: '01:D-01' } } }, null, /^awaiting/, 2],
    [{ approve: { state: { tasks: TASKS.map((x, i) => ({ ...x, status: i ? 'approved' : 'draft' })), next: '/telos:do' } } }, null, /^not approved: 01-01/, 3],
    [{ doHard: { state: { blockers: '01-02: check fails', next: 'fix 01-02 by hand: check fails' } } }, null, /^next: fix 01-02 by hand/, 5],
    [{ do: { states: [{ blockers: '01-01: tests fail', next: '/telos:do' }] } }, null, /^blocker: 01-01: tests fail/, 4],
    [{ do: { json: { result: 'REFUSED: task 01-01 is blocked by D-02 [proposed]' } } }, null, /^refused/, 4],
    [{ do: { states: [{}] } }, null, /^no progress/, 4],
  ];
  for (const [over, state, reason, sessions] of cases) {
    const c = copy(t, planRules(over), state);
    const run = await runTrajectory(multi('C'), ctx(c, 'C'));
    assert.equal(run.status, 'failed', JSON.stringify(over));
    assert.match(run.reason, reason);
    assert.equal(calls(c.dir).length, sessions, run.reason);
    assert.equal(run.sessions.length, sessions);
  }
});

test('C/D: more than 2 × tasks loop sessions → failed', async (t) => {
  const toggle = (i) => approved.map((x) => (x.id === '01-01' ? { ...x, status: i % 2 ? 'approved' : 'in-progress' } : x));
  const rules = planRules({ do: { states: Array.from({ length: 10 }, (_, i) => ({ tasks: toggle(i) })) } });
  const c = copy(t, rules);
  const run = await runTrajectory(multi('C'), ctx(c, 'C'));
  assert.equal(run.status, 'failed');
  assert.match(run.reason, /^session limit/);
});

test('A/B multi-session: one fresh session per step, full text first, then the continuation texts', async (t) => {
  const c = copy(t, []);
  const run = await runTrajectory(multi('B'), ctx(c, 'B'));
  assert.equal(run.status, 'completed');
  assert.deepEqual(calls(c.dir).map((x) => x.prompt), ['Build the export feature.\n\nAdd CSV output.\n\nDocument the flag.',
    'continue the work in this repository: Add CSV output.', 'continue the work in this repository: Document the flag.']);
  assert.equal(new Set(calls(c.dir).map((x) => x.sessionId)).size, 3);
  assert.ok(!telosCalls(c.dir).length, 'A/B never call telos');
});

test('host error before the first turn: ≤ 2 retries, every attempt kept; error after turns: no retry', async (t) => {
  const c = copy(t, [{ match: 'flaky', failTimes: 2 }]);
  const ok = await runSession({ prompt: 'flaky', env: c.env, cwd: c.dir, argvBase: base('A'), budgetUsd: 1, timeoutMs: 10_000 });
  assert.equal(ok.exit, 0);
  assert.equal(ok.attempts.length, 3);
  assert.deepEqual(ok.attempts.map((a) => a.exit), [1, 1, 0]);
  assert.deepEqual(ok.attempts.map((a) => a.usage?.input_tokens), [5, 5, 10]);
  assert.equal(new Set(ok.attempts.map((a) => a.sessionId)).size, 3);
  const d = copy(t, [{ match: 'dead', failTimes: 9 }]);
  const dead = await runSession({ prompt: 'dead', env: d.env, cwd: d.dir, argvBase: base('A'), budgetUsd: 1, timeoutMs: 10_000 });
  assert.equal(dead.attempts.length, 3);
  assert.equal(dead.hostError, true);
  const e = copy(t, [{ match: 'late', exit: 1, json: { is_error: true, subtype: 'error_during_execution' } }]);
  const late = await runSession({ prompt: 'late', env: e.env, cwd: e.dir, argvBase: base('A'), budgetUsd: 1, timeoutMs: 10_000 });
  assert.equal(late.attempts.length, 1);
  assert.equal(late.hostError, false);
  const run = await runTrajectory(single('A', 'dead'), ctx(copy(t, [{ match: 'dead', failTimes: 9 }]), 'A'));
  assert.equal(run.status, 'infra-failed');
});

test('timeout kills the whole process group, child processes included', async (t) => {
  const c = copy(t, [{ match: 'slow', sleepMs: 20_000, child: true }]);
  const run = await runSession({ prompt: 'slow', env: c.env, cwd: c.dir, argvBase: base('A'), budgetUsd: 1, timeoutMs: 1500, killGraceMs: 200 });
  assert.equal(run.timedOut, true);
  assert.equal(run.attempts.length, 1, 'a timeout is never retried');
  const pid = Number(readFileSync(join(c.dir, 'child.pid'), 'utf8'));
  await new Promise((r) => setTimeout(r, 100));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  const traj = await runTrajectory(single('A', 'slow'), ctx(copy(t, [{ match: 'slow', sleepMs: 20_000 }]), 'A', { sessionTimeoutMs: 800, killGraceMs: 100 }));
  assert.equal(traj.status, 'timeout');
});

test('host JSON without usage → usage null, never zeros; cost too', async (t) => {
  const c = copy(t, [{ match: 'x', json: { usage: null, total_cost_usd: null } }]);
  const run = await runSession({ prompt: 'x', env: c.env, cwd: c.dir, argvBase: base('A'), budgetUsd: 1, timeoutMs: 10_000 });
  assert.equal(run.usage, null);
  assert.equal(run.costUsd, null);
  const bad = copy(t, [{ match: 'x' }]);
  writeFileSync(join(bad.dir, '.host.json'), JSON.stringify({ rules: [{ match: 'x', json: { usage: null } }] }));
  const garbage = await runSession({ prompt: 'x', env: { ...bad.env, FAKE_HOST: '/nonexistent' }, cwd: bad.dir, argvBase: base('A'), budgetUsd: 1, timeoutMs: 10_000 });
  assert.equal(garbage.json, null);
  assert.equal(garbage.usage, null);
});

test('hostile task text reaches the host verbatim as one argv element', async (t) => {
  const hostile = `--dangerously-skip-permissions $(touch pwned) \`id\` "quoted" 'single' ; rm -rf ~ && echo \n second line \\ end`;
  const c = copy(t, []);
  await runTrajectory(single('A', hostile), ctx(c, 'A'));
  await runTrajectory(single('C', hostile), ctx(c, 'C'));
  const [a, cq] = calls(c.dir);
  assert.equal(a.prompt, hostile);
  assert.equal(cq.prompt, `/telos:quick ${hostile}`);
  assert.equal(a.argv.at(-1), hostile);
  assert.ok(!a.argv.includes('--dangerously-skip-permissions'));
  assert.throws(() => readFileSync(join(c.dir, 'pwned')), { code: 'ENOENT' });
});

test('the cell reservation is shared: each session gets what is left, an exhausted or unknown spend stops the run', async (t) => {
  const c = copy(t, []);
  const run = await runTrajectory(multi('A'), ctx(c, 'A', { cellBudgetUsd: 1 }));
  assert.deepEqual(calls(c.dir).map((x) => Number(flag(x.argv, '--max-budget-usd'))), [1, 0.75, 0.5]);
  assert.equal(run.status, 'completed');
  const tight = copy(t, []);
  const out = await runTrajectory(multi('A'), ctx(tight, 'A', { cellBudgetUsd: 0.4 }));
  assert.equal(out.status, 'failed');
  assert.match(out.reason, /^budget/);
  assert.equal(calls(tight.dir).length, 2);
  const unknown = copy(t, [{ match: 'Build', json: { total_cost_usd: null } }]);
  const u = await runTrajectory(multi('A'), ctx(unknown, 'A'));
  assert.equal(u.status, 'failed');
  assert.match(u.reason, /^budget: spend unknown/);
  assert.equal(calls(unknown.dir).length, 1);
});
