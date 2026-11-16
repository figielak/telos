import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ask, parseOutput, prompt, runAll, workingCopy } from '../lib/resume-run.mjs';
import { memoryRepo, write } from './memory-repo.mjs';

const STUB = fileURLToPath(new URL('./fixtures/resume-agent.mjs', import.meta.url));
const stub = (mode = 'json') => `node '${STUB}' ${mode}`;

function repo(t) {
  const root = memoryRepo(t);
  write(root, '.telos/resume-test.md', '- Q: secret?\n  expect: x\n');
  write(root, 'AGENTS.md', `# Own rules\n\n${read(root, 'AGENTS.md')}`);
  write(root, 'src.mjs', 'export {};\n');
  return root;
}
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');

test('working copy: memory keeps .telos/ but not the questions file; bare drops .telos/ and the block', (t) => {
  const root = repo(t);
  const memory = workingCopy(root, 'memory');
  const bare = workingCopy(root, 'bare');
  t.after(() => { memory.cleanup(); bare.cleanup(); });
  assert.equal(basename(memory.dir), basename(root));
  assert.equal(basename(bare.dir), basename(root));
  assert.ok(existsSync(join(memory.dir, '.telos/STATUS.md')));
  assert.ok(!existsSync(join(memory.dir, '.telos/resume-test.md')));
  assert.equal(read(memory.dir, 'AGENTS.md'), read(root, 'AGENTS.md'));
  assert.ok(!existsSync(join(bare.dir, '.telos')));
  assert.equal(read(bare.dir, 'AGENTS.md').trimEnd(), '# Own rules');
  assert.ok(existsSync(join(bare.dir, 'src.mjs')) && existsSync(join(bare.dir, '.git')));
  bare.cleanup();
  assert.ok(!existsSync(bare.dir));
  assert.ok(existsSync(join(root, '.telos/resume-test.md')), 'the original is untouched');
});

test('ask: both variants with the stub; answer, tokens, cost and unique tool calls', async (t) => {
  const root = repo(t);
  const memory = await ask({ root, question: 'What is next?', variant: 'memory', agentCmd: stub() });
  assert.equal(memory.error, null);
  assert.equal(memory.answer, `memory: next is 15-02\nquestions hidden\nrules block\nasked: What is next?`);
  assert.deepEqual([memory.tokens, memory.cost, memory.toolCalls], [4330, 0.25, 2]);
  const bare = await ask({ root, question: 'What is next?', variant: 'bare', agentCmd: stub() });
  assert.equal(bare.answer, 'no memory\nquestions hidden\nno rules block\nasked: What is next?');
});

test('ask: a timeout, a failing command and plain-text output', async (t) => {
  const root = repo(t);
  const slow = await ask({ root, question: 'q', variant: 'memory', agentCmd: stub('sleep'), timeoutMs: 300 });
  assert.equal(slow.error, 'timeout after 0.3s');
  assert.ok(slow.ms < 5000);
  const failed = await ask({ root, question: 'q', variant: 'bare', agentCmd: stub('fail') });
  assert.equal(failed.error, 'exit 3: stub failed');
  const text = await ask({ root, question: 'q', variant: 'bare', agentCmd: stub('text') });
  assert.equal(text.error, null);
  assert.match(text.answer, /^no memory/);
  assert.deepEqual([text.tokens, text.cost, text.toolCalls], [null, null, null]);
});

test('runAll: every question in every variant, in order, with progress callbacks', async (t) => {
  const root = repo(t);
  const seen = [];
  const results = await runAll({ root, questions: [{ q: 'A?' }, { q: 'B?' }], agentCmd: stub(),
    onRun: (i, v, r) => seen.push(`${i}:${v}:${r.error}`) });
  assert.deepEqual(seen, ['0:memory:null', '0:bare:null', '1:memory:null', '1:bare:null']);
  assert.match(results[1].bare.answer, /asked: B\?/);
  const one = await runAll({ root, questions: [{ q: 'A?' }], variants: ['bare'], agentCmd: stub() });
  assert.deepEqual(Object.keys(one[0]), ['bare']);
});

test('parseOutput: single JSON result, error results and missing result events', () => {
  const result = { type: 'result', is_error: false, result: ' ok ', total_cost_usd: 0.1, usage: { input_tokens: 5 } };
  assert.deepEqual(parseOutput(JSON.stringify(result)), { answer: 'ok', tokens: 5, cost: 0.1, toolCalls: 0, error: null });
  assert.equal(parseOutput(JSON.stringify({ ...result, is_error: true, subtype: 'error_max_turns' })).error,
    'agent error: error_max_turns');
  assert.equal(parseOutput('{"type":"system"}\n').error, 'no result event');
  assert.equal(parseOutput('').answer, '');
});

test('prompt: the question, then the five-line limit', () => {
  assert.match(prompt('Why?'), /^Why\?\n\nAnswer in English, in at most five lines\./);
});
