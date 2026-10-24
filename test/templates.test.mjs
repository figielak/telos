import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

import { render } from '../lib/template.mjs';

const names = readdirSync(new URL('../templates/', import.meta.url)).filter((f) => f.endsWith('.md'));

const vars = {
  name: 'demo-app', profile: 'standard', date: '2026-10-24',
  id: '01-02', title: 'Check board game', nn: '01', number: '001',
  source: '02:D-03', next: 'run `/telos:map` to map the existing code', supersedes: 'none',
};

// SPEC §4 size limits, in lines.
const LINE_LIMITS = {
  'PROJECT.md': 60, 'ROADMAP.md': 80, 'STATUS.md': 40, 'CONTEXT.md': 60,
  'task.md': 80, 'adr.md': 30, 'claude-block.md': 15,
};

test('all expected templates exist', () => {
  const expected = ['PROJECT.md', 'MAP.md', 'ROADMAP.md', 'STATUS.md', 'HISTORY.md', 'LESSONS.md',
    'CONTEXT.md', 'task.md', 'adr.md', 'claude-block.md'];
  assert.deepEqual([...names].sort(), [...expected].sort());
});

test('every template renders without leftover placeholders', () => {
  for (const name of names) {
    const out = render(name, vars);
    assert.ok(!out.includes('{{'), `${name} has a leftover placeholder`);
  }
});

test('templates stay within SPEC line limits', () => {
  for (const [name, max] of Object.entries(LINE_LIMITS)) {
    const lines = render(name, vars).trimEnd().split('\n').length;
    assert.ok(lines <= max, `${name}: ${lines} lines > ${max}`);
  }
});

test('CLAUDE.md block is marked and within ~250 tokens', () => {
  const block = render('claude-block.md', vars);
  assert.ok(block.length <= 1000, `${block.length} chars`);
  assert.match(block, /^<!-- telos:start v\d+ -->\n/);
  assert.match(block, /<!-- telos:end -->\n$/);
});

test('a missing variable is an error naming it', () => {
  assert.throws(() => render('adr.md', { title: 'x' }), /missing variable 'number'/);
});
