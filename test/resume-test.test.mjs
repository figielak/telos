import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseQuestions } from '../lib/resume-test.mjs';

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
