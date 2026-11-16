import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULTS, load, upgrade, validate, write } from '../lib/config.mjs';

const tempRoot = () => mkdtempSync(join(tmpdir(), 'telos-config-'));
const withConfig = (root, obj) => {
  mkdirSync(join(root, '.telos'), { recursive: true });
  writeFileSync(join(root, '.telos', 'config.json'), JSON.stringify(obj));
};

test('defaults are version 2 with exactly the memory-core keys and validate', () => {
  assert.deepEqual(validate(DEFAULTS), []);
  assert.deepEqual(Object.keys(DEFAULTS), ['version', 'stack', 'checks', 'limits', 'git', 'files_language']);
  assert.equal(DEFAULTS.version, 2);
});

test('defaults are deeply immutable', () => {
  assert.throws(() => { DEFAULTS.limits.status_lines = 1; }, TypeError);
  assert.throws(() => { DEFAULTS.stack.push('x'); }, TypeError);
});

test('each invalid field yields one error naming the key', () => {
  const cases = [
    [{ version: 1 }, 'version'],
    [{ profile: 'deep' }, 'profile'],
    [{ checks: { test: 42 } }, 'checks.test'],
    [{ checks: { format: 'prettier' } }, 'checks.format'],
    [{ limits: { ...DEFAULTS.limits, status_lines: 0 } }, 'limits.status_lines'],
    [{ git: { ...DEFAULTS.git, auto_commit: 'yes' } }, 'git.auto_commit'],
  ];
  for (const [patch, key] of cases) {
    const errors = validate({ ...DEFAULTS, ...patch });
    assert.equal(errors.length, 1, `${key}: ${errors.join('; ')}`);
    assert.ok(errors[0].startsWith(key), errors[0]);
  }
});

test('a version 1 file loads: removed keys and Stop-only checks are dropped', () => {
  const root = tempRoot();
  withConfig(root, {
    version: 1, profile: 'deep', files_language: 'pl', stack: ['javascript'],
    checks: { test: 'npm test', format: 'prettier --write {files}', test_related: 'vitest related {files}' },
    docs: { readme: 'README.md' }, protected_configs: ['tsconfig.json'], strict_scope: true,
    limits: { status_lines: 30 },
  });
  const cfg = load(root);
  assert.deepEqual(cfg, { ...DEFAULTS, files_language: 'pl', stack: ['javascript'], checks: { test: 'npm test' },
    limits: { ...DEFAULTS.limits, status_lines: 30 } });
  assert.deepEqual(upgrade({ version: 2, profile: 'x' }), { version: 2, profile: 'x' }, 'only version 1 is upgraded');
});

test('load reports all validation errors at once', () => {
  const root = tempRoot();
  withConfig(root, { version: 3, extra: true });
  assert.throws(() => load(root), /extra.*version/s);
});

test('write then load round-trips with stable formatting', () => {
  const root = tempRoot();
  const cfg = { ...DEFAULTS, stack: ['python'], checks: { test: 'pytest', build: 'make' } };
  write(root, cfg);
  const text = readFileSync(join(root, '.telos', 'config.json'), 'utf8');
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.indexOf('"build"') < text.indexOf('"test"'), 'checks keep spec order');
  assert.ok(text.indexOf('"version"') < text.indexOf('"stack"'));
  assert.deepEqual(load(root), cfg);
});

test('unknown check keys are rejected with the known list', () => {
  const errors = validate({ ...DEFAULTS, checks: { formatter: 'x' } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^checks\.formatter: unknown check \(known: build, types, lint, test, e2e\)/);
  assert.match(validate({ ...DEFAULTS, checks: { test: '' } })[0], /^checks\.test: must be a non-empty string/);
});
