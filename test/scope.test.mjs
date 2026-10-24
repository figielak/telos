import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inScope } from '../lib/scope.mjs';

test('a prefix with a slash matches files below it only', () => {
  assert.ok(inScope('src/game/a.ts', ['src/game/']));
  assert.ok(inScope('src/game/x/y.ts', ['src/game/']));
  assert.ok(!inScope('src/gamer.ts', ['src/game/']));
});

test('an exact path matches itself and, as a directory, its contents', () => {
  assert.ok(inScope('README.md', ['README.md']));
  assert.ok(!inScope('README.mdx', ['README.md']));
  assert.ok(inScope('skills/plan/SKILL.md', ['skills/plan']));
  assert.ok(inScope('./README.md', ['README.md']));
});

test('"*" matches everything', () => {
  assert.ok(inScope('any/where/file.txt', ['*']));
});

test('* stays inside a directory, ** crosses directories', () => {
  assert.ok(inScope('test/a.test.mjs', ['test/*.test.mjs']));
  assert.ok(!inScope('test/x/a.test.mjs', ['test/*.test.mjs']));
  assert.ok(inScope('test/x/y/a.test.mjs', ['test/**/*.test.mjs']));
  assert.ok(inScope('src/a.b.ts', ['src/*.b.ts']));
  assert.ok(!inScope('src/aXb.ts', ['src/a.b.ts']));
});

test('an empty scope matches nothing', () => {
  assert.ok(!inScope('a.ts', []));
});
