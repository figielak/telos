import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

import { render } from '../lib/template.mjs';

const names = readdirSync(new URL('../templates/', import.meta.url)).filter((f) => f.endsWith('.md'));

const vars = {
  name: 'demo-app', date: '2026-10-24',
  id: '01-02', title: 'Check board game', nn: '01', number: '001',
  source: '02:D-03', goal: 'Ship it', done: 'it ships', next: 'run `/telos:map` to map the existing code', supersedes: 'none',
  commit: 'a'.repeat(40), paths: 'src/auth/, lib/x.mjs',
};

// Size limits, in lines.
const LINE_LIMITS = {
  'PROJECT.md': 60, 'ROADMAP.md': 80, 'STATUS.md': 40, 'phase.md': 80, 'agents-block.md': 18,
};

test('all expected templates exist', () => {
  const expected = ['PROJECT.md', 'MAP.md', 'ROADMAP.md', 'STATUS.md', 'HISTORY.md', 'phase.md', 'agents-block.md', 'area.md', 'resume-test.md'];
  assert.deepEqual([...names].sort(), [...expected].sort());
});

test('every template renders without leftover placeholders', () => {
  for (const name of names) {
    const out = render(name, vars);
    assert.ok(!out.includes('{{'), `${name} has a leftover placeholder`);
  }
});

test('templates stay within their line limits', () => {
  for (const [name, max] of Object.entries(LINE_LIMITS)) {
    const lines = render(name, vars).trimEnd().split('\n').length;
    assert.ok(lines <= max, `${name}: ${lines} lines > ${max}`);
  }
});

// 14-03: +status-first and step lines over the v4 CLAUDE.md block (≤ 1000 chars).
test('AGENTS.md block is marked and within ~325 tokens', () => {
  const block = render('agents-block.md', vars);
  assert.ok(block.length <= 1300, `${block.length} chars`);
  assert.match(block, /^<!-- telos:start v\d+ -->\n/);
  assert.match(block, /<!-- telos:end -->\n$/);
});

test('a missing variable is an error naming it', () => {
  assert.throws(() => render('phase.md', {}), /missing variable/);
});

test('the AGENTS.md block points at area files before editing', () => {
  assert.match(render('agents-block.md', vars), /`telos area for <path>`[\s\S]*\.telos\/areas\/<name>\.md/);
});

test('the AGENTS.md block works without hooks or skills (14:D2-D4)', () => {
  const block = render('agents-block.md', vars);
  assert.match(block, /Run `telos status` first/);
  assert.match(block, /`telos ctx <step>`/);
  for (const step of ['plan', 'close', 'catchup', 'map']) assert.match(block, new RegExp(`\`${step}[\` ]`), step);
  assert.match(block, /Delete-zone/);
  for (const rule of ['git add -A', '--no-verify', 'reset --hard', 'push']) assert.ok(block.includes(rule), rule);
});
