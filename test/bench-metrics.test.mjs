import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { classifyBash, readTranscript, rowFromRecord } from '../bench/lib/metrics.mjs';
import { sanitize, sanitizeJsonl } from '../bench/lib/sanitize.mjs';

function dir(t) {
  const d = mkdtempSync(join(tmpdir(), 'bench-metrics-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

// Hand-made host-like transcript lines (shape of Claude Code session JSONL: assistant message with usage and tool_use
// blocks, user message with tool_result blocks, a cost-state line with per-model usage).
let clock = 0;
const ts = () => new Date(Date.UTC(2026, 10, 1, 12, 0, clock++)).toISOString();
let n = 0;
const turn = (model, ...blocks) => ({ type: 'assistant', timestamp: ts(), message: { id: `msg_${n++}`, model, role: 'assistant', content: blocks,
  usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 1, cache_read_input_tokens: 1 } } });
const use = (name, input, id = `tu_${n++}`) => ({ type: 'tool_use', id, name, input });
const result = (id, content, extra = {}) => ({ type: 'user', timestamp: ts(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, ...extra }] } });
const costState = (modelUsage) => ({ type: 'cost-state', totalCostUSD: Object.values(modelUsage).reduce((s, m) => s + m.costUSD, 0), modelUsage });

function write(d, sessionId, lines, subagents = {}) {
  writeFileSync(join(d, `${sessionId}.jsonl`), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  for (const [name, sub] of Object.entries(subagents)) {
    mkdirSync(join(d, sessionId, 'subagents'), { recursive: true });
    writeFileSync(join(d, sessionId, 'subagents', `agent-${name}.jsonl`), `${sub.map((l) => JSON.stringify(l)).join('\n')}\n`);
  }
}
const usage = (input, cc, out, cr) => ({ input_tokens: input, cache_creation_input_tokens: cc, output_tokens: out, cache_read_input_tokens: cr });
const attempt = (sessionId, extra = {}) => ({ sessionId, exit: 0, costUsd: 0.5, usage: usage(10, 100, 20, 1000), turns: 3, ms: 1000, ...extra });
const session = (step, attempts) => ({ step, sessionId: attempts.at(-1).sessionId, attempts, ...attempts.at(-1) });
const record = (sessions, extra = {}) => ({ cell: 't1.C.1', task: 't1', variant: 'C', rep: 1, status: 'completed', accepted: true, changedPaths: ['src/a.py'],
  sessions, spentUsd: null, setupUsd: 0, ...extra });

test('usage of two sessions sums per field: fresh = input + cache_creation, cache_read separate, retries included in cost', (t) => {
  const d = dir(t);
  write(d, 's1', [turn('m', use('Read', { file_path: 'a' }))]);
  write(d, 's2', [turn('m')]);
  write(d, 's0', [turn('m')]);
  const rec = record([session('plan', [attempt('s0', { exit: 1, turns: 0, costUsd: 0.01, usage: usage(5, 0, 0, 0) }), attempt('s1')]),
    session('do', [attempt('s2', { costUsd: 0.25, usage: usage(1, 2, 3, 4), turns: 2, ms: 500 })])], { setupUsd: 0.3 });
  const row = rowFromRecord(rec, { transcriptsDir: d });
  assert.equal(row.input, 16);
  assert.equal(row.cache_creation, 102);
  assert.equal(row.fresh, 118);
  assert.equal(row.output, 23);
  assert.equal(row.cache_read, 1004);
  assert.ok(!('total' in row));
  assert.equal(row.cost_usd, 0.76);
  assert.equal(row.setup_usd, 0.3);
  assert.equal(row.turns, 5);
  assert.equal(row.wall_ms, 2500);
  assert.equal(row.sessions, 2);
  assert.equal(row.attempts, 3);
  assert.equal(row.status, 'completed');
  assert.equal(row.accepted, true);
});

test('missing usage or cost stays null and marks the row unverified, never 0', (t) => {
  const d = dir(t);
  write(d, 's1', [turn('m')]);
  const row = rowFromRecord(record([session('task', [attempt('s1', { usage: null, costUsd: null })])]), { transcriptsDir: d });
  assert.equal(row.input, null);
  assert.equal(row.fresh, null);
  assert.equal(row.cache_read, null);
  assert.equal(row.cost_usd, null);
  assert.equal(row.unverified, true);
});

test('per-model cost and turns come from the transcript (cost-state + assistant turns, split lines of one message counted once)', (t) => {
  const d = dir(t);
  const split = turn('claude-opus-5-5', { type: 'thinking', thinking: 'x' });
  write(d, 's1', [turn('claude-sonnet-5-5'), turn('claude-sonnet-5-5'), split, { ...split, timestamp: ts() }, turn('claude-opus-5-5'),
    costState({ 'claude-sonnet-5-5': { costUSD: 0.1 }, 'claude-opus-5-5': { costUSD: 0.4 } })]);
  const row = rowFromRecord(record([session('task', [attempt('s1')])]), { transcriptsDir: d });
  assert.deepEqual(row.per_model, { 'claude-opus-5-5': { cost_usd: 0.4, turns: 2 }, 'claude-sonnet-5-5': { cost_usd: 0.1, turns: 2 } });
});

test('tool counts and denied tool calls from the transcript', (t) => {
  const d = dir(t);
  write(d, 's1', [
    turn('m', use('Read', { file_path: 'a' }, 'r1'), use('Bash', { command: 'npm test' }, 'b1'), use('Edit', { file_path: 'src/a.py' }, 'e1')),
    result('r1', 'x'), result('b1', 'Permission to use Bash with command npm test has been denied.', { is_error: true }),
    result('e1', 'ok'), turn('m', use('Read', { file_path: 'b' }, 'r2')), result('r2', 'denied by hook', { is_error: true, permissionDecision: { decision: 'deny' } }),
  ]);
  const row = rowFromRecord(record([session('task', [attempt('s1')])]), { transcriptsDir: d });
  assert.deepEqual(row.tools, { Bash: 1, Edit: 1, Read: 2 });
  assert.equal(row.denied, 2);
});

test('exploration stops at the first product-code edit; an earlier .telos/STATUS.md edit does not stop it', (t) => {
  const d = dir(t);
  write(d, 's1', [
    turn('m', use('Read', { file_path: 'src/a.py' }, 'r1')), result('r1', 'abcde'),
    turn('m', use('Edit', { file_path: '/work/.telos/STATUS.md' }, 'e0')), result('e0', 'ok'),
    turn('m', use('Edit', { file_path: '/work/CLAUDE.md' }, 'e00')), result('e00', 'ok'),
    turn('m', use('Grep', { pattern: 'x' }, 'g1')), result('g1', '123'),
    turn('m', use('Edit', { file_path: '/work/src/a.py' }, 'e1')), result('e1', 'ok'),
    turn('m', use('Read', { file_path: 'src/b.py' }, 'r2')), result('r2', 'ignored after the edit'),
  ]);
  const row = rowFromRecord(record([session('task', [attempt('s1')])]), { transcriptsDir: d });
  assert.equal(row.explore_calls, 2);
  assert.equal(row.explore_bytes, 8);
  assert.equal(row.unverified, false);
});

test('a Bash write to a product path ends the window, a write to .telos/ does not', (t) => {
  const d = dir(t);
  write(d, 's1', [
    turn('m', use('Bash', { command: 'echo x > .telos/note.md' }, 'w0')), result('w0', ''),
    turn('m', use('Read', { file_path: 'a' }, 'r1')), result('r1', 'ab'),
    turn('m', use('Bash', { command: "sed -i 's/a/b/' src/a.py" }, 'w1')), result('w1', ''),
    turn('m', use('Read', { file_path: 'b' }, 'r2')), result('r2', 'zz'),
  ]);
  const row = rowFromRecord(record([session('task', [attempt('s1')])]), { transcriptsDir: d });
  assert.equal(row.explore_calls, 1);
});

test('each session has its own window; a session without a product edit counts all its calls', (t) => {
  const d = dir(t);
  write(d, 's1', [turn('m', use('Read', { file_path: 'a' }, 'r1')), result('r1', 'a'), turn('m', use('Edit', { file_path: 'src/x.py' }, 'e1')), result('e1', ''),
    turn('m', use('Read', { file_path: 'z' }, 'r9')), result('r9', 'late')]);
  write(d, 's2', [turn('m', use('Read', { file_path: 'a' }, 'q1')), result('q1', 'bb'), turn('m', use('Glob', { pattern: '*' }, 'q2')), result('q2', 'cc')]);
  const row = rowFromRecord(record([session('plan', [attempt('s1')]), session('do', [attempt('s2')])]), { transcriptsDir: d });
  assert.equal(row.explore_calls, 3);
  assert.equal(row.explore_bytes, 5);
});

test('classifyBash: read-like commands explore, known others do not, unknown is unclassified', () => {
  for (const c of ['cat src/a.py', 'head -20 x', 'tail -f log', "sed -n '1,5p' a", 'grep -rn foo .', 'rg foo', 'find . -name "*.py"', 'ls -la', 'git show HEAD', 'git log --oneline',
    'git diff', 'cd src && cat a.py', 'cat a | wc -l']) assert.equal(classifyBash(c), 'explore', c);
  for (const c of ['npm test', 'pytest -q', 'go test ./...', 'git commit -m x', 'git status', 'mkdir -p x', 'telos accept 01-01', 'python3 run.py']) assert.equal(classifyBash(c), 'other', c);
  for (const c of ['frobnicate --all', 'curl http://x', '']) assert.equal(classifyBash(c), 'unclassified', c);
});

test('cat via Bash counts as exploration with its returned bytes; npm test does not; an unknown command is counted separately', (t) => {
  const d = dir(t);
  write(d, 's1', [
    turn('m', use('Bash', { command: 'cat src/a.py' }, 'b1')), result('b1', '12345'),
    turn('m', use('Bash', { command: 'npm test' }, 'b2')), result('b2', 'many many bytes of test output'),
    turn('m', use('Bash', { command: 'frobnicate' }, 'b3')), result('b3', 'huh'),
  ]);
  const row = rowFromRecord(record([session('task', [attempt('s1')])]), { transcriptsDir: d });
  assert.equal(row.explore_calls, 1);
  assert.equal(row.explore_bytes, 5);
  assert.equal(row.explore_unclassified, 1);
});

test('subagent transcript reads before the main session\'s first product edit are included, later ones are not', (t) => {
  const d = dir(t);
  clock = 0;
  const main1 = [turn('m', use('Task', { prompt: 'look around' }, 't1'))];
  const sub = [turn('m', use('Read', { file_path: 'a' }, 'x1')), result('x1', 'sub'), turn('m', use('Grep', { pattern: 'p' }, 'x2')), result('x2', 'sub2')];
  const main2 = [result('t1', 'done'), turn('m', use('Edit', { file_path: 'src/a.py' }, 'e1')), result('e1', '')];
  const late = [turn('m', use('Read', { file_path: 'b' }, 'x3')), result('x3', 'late')];
  write(d, 's1', [...main1, ...main2], { a: [...sub, ...[]] });
  // the late subagent runs after the edit: its timestamps are later than every main line
  mkdirSync(join(d, 's1', 'subagents'), { recursive: true });
  writeFileSync(join(d, 's1', 'subagents', 'agent-b.jsonl'), `${late.map((l) => JSON.stringify(l)).join('\n')}\n`);
  const row = rowFromRecord(record([session('task', [attempt('s1')])]), { transcriptsDir: d });
  assert.equal(row.explore_calls, 2);
  assert.equal(row.explore_bytes, 7);
});

test('missing or unparsable transcript → exploration null with unverified: true', (t) => {
  const d = dir(t);
  write(d, 's1', [turn('m', use('Read', { file_path: 'a' }, 'r1')), result('r1', 'a')]);
  const missing = rowFromRecord(record([session('plan', [attempt('s1')]), session('do', [attempt('gone')])]), { transcriptsDir: d });
  assert.equal(missing.explore_calls, null);
  assert.equal(missing.explore_bytes, null);
  assert.equal(missing.unverified, true);
  assert.equal(missing.input, 20, 'host usage does not depend on transcripts');
  writeFileSync(join(d, 'bad.jsonl'), '{"type":"assistant"\nnot json\n');
  const bad = rowFromRecord(record([session('task', [attempt('bad')])]), { transcriptsDir: d });
  assert.equal(bad.explore_calls, null);
  assert.equal(bad.unverified, true);
  assert.equal(readTranscript(join(d, 'nope.jsonl')), null);
  assert.equal(readTranscript(join(d, 'bad.jsonl')), null);
});

test('changed paths outside expectedPaths → out_of_scope_paths', (t) => {
  const d = dir(t);
  write(d, 's1', [turn('m')]);
  const rec = record([session('task', [attempt('s1')])], { changedPaths: ['src/a.py', 'src/deep/b.py', 'docs/x.md', 'README.md', '.telos/STATUS.md'] });
  const row = rowFromRecord(rec, { transcriptsDir: d, expectedPaths: ['src/', 'README.md'] });
  assert.deepEqual(row.out_of_scope_paths, ['.telos/STATUS.md', 'docs/x.md']);
  assert.equal(rowFromRecord(rec, { transcriptsDir: d }).out_of_scope_paths, null, 'no expectedPaths, no verdict');
});

test('sanitize strips home paths, user names, e-mail, key-like strings and work dirs, and reports hit counts per rule', () => {
  const text = [
    'cwd /work/bench/copies/t1.A.1/src and /work/bench/copies/t1.A.1',
    'file /home/figielak/Documents/x.py and /home/otheruser/y',
    'by figielak <krystian.figiela@proton.me>, cc a.b@example.org',
    'key sk-ant-api03-AbCdEf_123456789-xyz and sk-proj1234567890abcdefghijkl and ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'Authorization: Bearer abcdefghijklmnop1234567890',
  ].join('\n');
  const { text: out, hits } = sanitize(text, { home: '/home/figielak', user: 'figielak', workDir: '/work/bench' });
  assert.ok(!/figielak|proton|example\.org|sk-ant|sk-proj|ghp_|abcdefghijklmnop|\/work\/bench/.test(out), out);
  assert.match(out, /<WORKDIR>\/copies\/t1\.A\.1\/src/);
  assert.match(out, /<HOME>\/Documents\/x\.py/);
  assert.match(out, /\/home\/<USER>\/y/);
  assert.equal(hits.workdir, 2);
  assert.equal(hits.home, 1);
  assert.equal(hits.home_other, 1);
  assert.equal(hits.email, 2);
  assert.equal(hits.secret, 4);
  assert.equal(hits.user, 1);
  assert.equal(sanitize('nothing here 123', { home: '/home/u', user: 'u', workDir: '/w' }).text, 'nothing here 123');
});

test('sanitize leaves short user names alone and never touches digits (token counts survive)', () => {
  const line = JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 1234, output_tokens: 56 } }, note: 'run as ab at /home/ab/x' });
  const { text } = sanitize(line, { home: '/home/ab', user: 'ab', workDir: '/work' });
  assert.deepEqual(JSON.parse(text).message.usage, { input_tokens: 1234, output_tokens: 56 });
  assert.match(JSON.parse(text).note, /run as ab at <HOME>\/x/);
});

test('sanitizeJsonl keeps every line valid JSON and sums hits', () => {
  const lines = [JSON.stringify({ a: '/home/figielak/x', n: 7 }), JSON.stringify({ mail: 'a@b.co' }), 'not json at all /home/figielak'].join('\n');
  const { text, hits } = sanitizeJsonl(lines, { home: '/home/figielak', user: 'figielak', workDir: '/w' });
  const out = text.split('\n');
  assert.deepEqual(JSON.parse(out[0]), { a: '<HOME>/x', n: 7 });
  assert.deepEqual(JSON.parse(out[1]), { mail: '<EMAIL>' });
  assert.ok(!out[2].includes('figielak'));
  assert.equal(hits.home, 2);
  assert.equal(hits.email, 1);
});
