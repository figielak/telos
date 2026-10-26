import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parse, setField } from '../lib/frontmatter.mjs';
import { render } from '../lib/template.mjs';

const task = render('task.md', { id: '01-02', title: 'Check board game' });

test('parses the task template frontmatter', () => {
  assert.deepEqual(parse(task), {
    id: '01-02', title: 'Check board game', type: 'code', status: 'draft',
    critical: false, effort: 'normal', depends: [], decisions: [], scope: [],
  });
});

test('parses arrays, quoted strings, numbers and empty values', () => {
  const text = '---\nscope: ["*", src/game/]\ndepends: [01-01, 01-02]\nn: 3\nzero: 01\nq: "a # b"\nempty:\n---\nbody\n';
  assert.deepEqual(parse(text), {
    scope: ['*', 'src/game/'], depends: ['01-01', '01-02'], n: 3, zero: '01', q: 'a # b', empty: null,
  });
});

test('unsupported YAML is an error with its line number', () => {
  assert.throws(() => parse('---\nid: 01\nnested:\n  a: 1\n---\n'), /line 4/);
  assert.throws(() => parse('---\nid: 01\ntext: |\n  more\n---\n'), /line 3/);
  assert.throws(() => parse('---\nmap: {a: 1}\n---\n'), /line 2/);
});

test('setField keeps the comment and every other line byte-identical', () => {
  const out = setField(task, 'status', 'in-progress');
  const before = task.split('\n');
  const after = out.split('\n');
  assert.equal(after.length, before.length);
  const changed = after.flatMap((line, i) => (line === before[i] ? [] : [i]));
  assert.equal(changed.length, 1);
  const line = after[changed[0]];
  assert.match(line, /^status: in-progress\s+# draft \| approved/);
  assert.equal(line.indexOf('#'), before[changed[0]].indexOf('#'), 'comment column kept');
  assert.equal(parse(out).status, 'in-progress');
});

test('setField writes arrays and refuses unknown keys', () => {
  const out = setField(task, 'scope', ['src/', '*']);
  assert.deepEqual(parse(out).scope, ['src/', '*']);
  assert.throws(() => setField(task, 'nope', 'x'), /nope/);
});

test('parses this repo task files', () => {
  const file = new URL('../.telos/phases/01-skeleton/01-05-status-command.md', import.meta.url);
  const fm = parse(readFileSync(file, 'utf8'));
  assert.equal(fm.id, '01-05');
  assert.deepEqual(fm.depends, ['01-03', '01-04']);
});
