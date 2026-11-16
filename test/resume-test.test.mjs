import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { UsageError } from '../lib/errors.mjs';
import { parseQuestions, renderReport, resumeTestCommand, score, summarize } from '../lib/resume-test.mjs';
import { memoryRepo, write } from './memory-repo.mjs';

const TEMPLATE = readFileSync(new URL('../templates/resume-test.md', import.meta.url), 'utf8');

const entry = (n) => `- Q: Question ${n}?\n  expect: fact ${n}; a|b\n`;
const file = (n) => `# Resume test\n\n${Array.from({ length: n }, (_, i) => entry(i + 1)).join('\n')}`;

test('parse: five questions with facts and alternatives, line numbers kept', () => {
  const { questions, errors } = parseQuestions(file(5));
  assert.deepEqual(errors, []);
  assert.equal(questions.length, 5);
  assert.deepEqual(questions[0], { line: 3, q: 'Question 1?', facts: [['fact 1'], ['a', 'b']] });
  assert.equal(questions[4].line, 15);
});

test('parse: fewer than five or more than ten questions is an error', () => {
  assert.deepEqual(parseQuestions(file(4)).errors, ['4 questions; 5–10 needed']);
  assert.deepEqual(parseQuestions(file(11)).errors, ['11 questions; 5–10 needed']);
  assert.deepEqual(parseQuestions(file(10)).errors, []);
});

test('parse: a question without expect, or with an empty one, is named by line', () => {
  const text = `${file(5)}\n- Q: Orphan?\n\n- Q: Empty?\n  expect: ; |\n- Q: Last?\n`;
  assert.deepEqual(parseQuestions(text).errors, [
    'line 18: question without an expect line',
    'line 21: expect has no fact',
    'line 22: question without an expect line',
  ]);
});

test('parse: an expect line without a question is an error', () => {
  assert.deepEqual(parseQuestions(`  expect: x\n${file(5)}`).errors, ['line 1: expect without a question']);
});

test('template: its examples are commented out, and parse once uncommented', () => {
  assert.deepEqual(parseQuestions(TEMPLATE).questions, []);
  const open = TEMPLATE.replace('<!--', '').replace('-->', '');
  const { questions } = parseQuestions(open);
  assert.deepEqual(questions.map((q) => q.facts), [
    [['03-02'], ['rate limit', 'rate limiting']],
    [['src/auth/session.ts']],
    [['stale reads', 'stale data'], ['Postgres']],
  ]);
});

test('score: every fact, case-insensitive, whitespace collapsed', () => {
  const facts = [['15-02'], ['Runner']];
  assert.deepEqual(score('Next is 15-02: the runner.', facts), { correct: true, missing: [] });
  assert.deepEqual(score('Next:\n  the\n\nrunner, 15-02', [['the runner']]), { correct: true, missing: [] });
});

test('score: alternatives match any one; a partial match lists what is missing', () => {
  const facts = [['stale reads', 'stale data'], ['Postgres'], ['lib/x.mjs']];
  assert.deepEqual(score('We had STALE DATA, so we moved to postgres.', facts),
    { correct: false, missing: ['lib/x.mjs'] });
  assert.deepEqual(score('', facts),
    { correct: false, missing: ['stale reads|stale data', 'Postgres', 'lib/x.mjs'] });
});

const run = (answer, extra = {}) => ({ answer, tokens: 1500, cost: 0.1, toolCalls: 2, error: null, ms: 10, ...extra });

test('summarize and report: marks, D4 totals and missing facts per incorrect answer', () => {
  const questions = [
    { line: 1, q: 'What is next?', facts: [['15-02']] },
    { line: 4, q: 'Where does the CLI dispatch commands to their handlers, exactly?', facts: [['lib/cli.mjs'], ['commands']] },
  ];
  const results = [
    { memory: run('15-02'), bare: run('', { error: 'timeout after 300s', tokens: null, cost: null, toolCalls: null }) },
    { memory: run('lib/cli.mjs, the commands map'), bare: run('somewhere in lib/cli.mjs', { tokens: 800 }) },
  ];
  const summary = summarize(questions, results, ['memory', 'bare']);
  assert.deepEqual(summary.totals, {
    memory: { correct: 2, total: 2, tokens: 3000, cost: 0.2, toolCalls: 4, failed: 0 },
    bare: { correct: 0, total: 2, tokens: 800, cost: 0.1, toolCalls: 2, failed: 1 },
  });
  assert.equal(renderReport(summary), [
    'Resume test · 2 questions · memory vs bare',
    '',
    '#  Question                                          memory  bare',
    '1  What is next?                                     ✓       failed',
    '2  Where does the CLI dispatch commands to their h…  ✓       ✗',
    '',
    '             memory  bare',
    'Correct      2/2     0/2',
    'Tokens       3.0K    800',
    'Cost         $0.20   $0.10',
    'Tool calls   4       2',
    'Failed runs  0       1',
    '',
    'Missing facts',
    '- 1 bare: failed (timeout after 300s)',
    '- 2 bare: missing "commands"',
    '',
  ].join('\n'));
});

test('report: one variant only, unknown usage shown as –, no missing section when all correct', () => {
  const questions = [{ line: 1, q: 'Q?', facts: [['a']] }];
  const summary = summarize(questions, [{ bare: run('A', { tokens: null, cost: null, toolCalls: null }) }], ['bare']);
  const text = renderReport(summary);
  assert.match(text, /^Resume test · 1 questions · bare\n/);
  assert.match(text, /Tokens       –\nCost         –\nTool calls   –\n/);
  assert.doesNotMatch(text, /memory|Missing facts/);
});

// The command, run directly with the stub agent; registration is covered in the CLI test.
const STUB = fileURLToPath(new URL('./fixtures/resume-agent.mjs', import.meta.url));
const QUESTIONS = Array.from({ length: 5 }, (_, i) => `- Q: Question ${i + 1}?\n  expect: memory; 15-02\n`).join('');

async function command(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await resumeTestCommand.run({ args, root, cwd: root, stdout: out, stderr: err });
  return { code, out: out.text, err: err.text };
}

test('command: both variants with the stub; memory 5/5, bare 0/5; --json and --variant', async (t) => {
  const root = memoryRepo(t);
  write(root, '.telos/resume-test.md', QUESTIONS);
  const agent = `node '${STUB}'`;
  const r = await command(root, '--agent-cmd', agent);
  assert.equal(r.code, 0);
  assert.match(r.out, /Correct      5\/5     0\/5\nTokens       21\.6K   21\.6K\nCost         \$1\.25   \$1\.25\nTool calls   10      10\n/);
  assert.match(r.out, /- 1 bare: missing "15-02"/);
  assert.match(r.err, /10 headless sessions[\s\S]*\[1\/10\] 1 memory ✓ \(\d+s\)\n\[2\/10\] 1 bare ✗/);
  const json = JSON.parse((await command(root, '--agent-cmd', agent, '--json', '--variant', 'memory')).out);
  assert.deepEqual(json.variants, ['memory']);
  assert.equal(json.rows.length, 5);
  assert.deepEqual(json.totals.memory, { correct: 5, total: 5, tokens: 21650, cost: 1.25, toolCalls: 10, failed: 0 });
  assert.equal(json.rows[0].bare, undefined);
});

test('command: every run failing exits 1; a timeout is listed', async (t) => {
  const root = memoryRepo(t);
  write(root, '.telos/resume-test.md', QUESTIONS);
  const r = await command(root, '--agent-cmd', `node '${STUB}' sleep`, '--timeout', '0.2', '--variant', 'bare');
  assert.equal(r.code, 1);
  assert.match(r.out, /- 5 bare: failed \(timeout after 0\.2s\)\n$/);
});

test('command: missing or invalid questions file exits 1; bad flags are usage errors', async (t) => {
  const root = memoryRepo(t);
  const missing = await command(root);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /no \.telos\/resume-test\.md; start from \/.*templates\/resume-test\.md\n$/);
  write(root, '.telos/resume-test.md', '- Q: Only one?\n');
  assert.deepEqual(await command(root), { code: 1, out: '', err:
    '.telos/resume-test.md: line 1: question without an expect line\n.telos/resume-test.md: 0 questions; 5–10 needed\n' });
  for (const args of [['--variant', 'both'], ['--timeout', '0'], ['--agent-cmd', ' '], ['extra'], ['--bogus']]) {
    await assert.rejects(command(root, ...args), UsageError, args.join(' '));
  }
});
