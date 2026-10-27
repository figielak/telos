import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULTS, PROFILES, atLeast, load, requireMessage, validate, write } from '../lib/config.mjs';

const tempRoot = () => mkdtempSync(join(tmpdir(), 'telos-config-'));
const withConfig = (root, obj) => {
  mkdirSync(join(root, '.telos'), { recursive: true });
  writeFileSync(join(root, '.telos', 'config.json'), JSON.stringify(obj));
};

test('defaults validate with no errors', () => {
  assert.deepEqual(validate(DEFAULTS), []);
});

test('defaults are deeply immutable', () => {
  assert.throws(() => { DEFAULTS.checks.test = 'x'; }, TypeError);
  assert.throws(() => { DEFAULTS.docs.paths.push('x'); }, TypeError);
});

test('each invalid field yields one error naming the key', () => {
  const cases = [
    [{ profile: 'huge' }, 'profile'],
    [{ version: 2 }, 'version'],
    [{ checks: { test: 42 } }, 'checks.test'],
    [{ limits: { ...DEFAULTS.limits, status_lines: 0 } }, 'limits.status_lines'],
  ];
  for (const [patch, key] of cases) {
    const errors = validate({ ...DEFAULTS, ...patch });
    assert.equal(errors.length, 1, `${key}: ${errors.join('; ')}`);
    assert.ok(errors[0].startsWith(key), errors[0]);
  }
});

test('a partial file merges over defaults', () => {
  const root = tempRoot();
  withConfig(root, { version: 1, profile: 'deep', limits: { status_lines: 30 } });
  const cfg = load(root);
  assert.equal(cfg.profile, 'deep');
  assert.equal(cfg.limits.status_lines, 30);
  assert.equal(cfg.limits.map_tokens, DEFAULTS.limits.map_tokens);
  assert.deepEqual(cfg.git, DEFAULTS.git);
});

test('load reports all validation errors at once', () => {
  const root = tempRoot();
  withConfig(root, { version: 3, profile: 'huge' });
  assert.throws(() => load(root), /version.*profile/s);
});

test('atLeast orders minimal < standard < deep', () => {
  assert.deepEqual(PROFILES, ['minimal', 'standard', 'deep']);
  const std = { ...DEFAULTS, profile: 'standard' };
  assert.equal(atLeast(std, 'minimal'), true);
  assert.equal(atLeast(std, 'standard'), true);
  assert.equal(atLeast(std, 'deep'), false);
});

test('requireMessage matches the spec wording', () => {
  assert.equal(requireMessage('deep'), 'Requires deep profile. Switch with /telos:profile deep.');
});

test('write then load round-trips with stable formatting', () => {
  const root = tempRoot();
  const cfg = { ...DEFAULTS, profile: 'minimal', stack: ['python'], checks: { test: 'pytest', build: 'make' } };
  write(root, cfg);
  const text = readFileSync(join(root, '.telos', 'config.json'), 'utf8');
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.indexOf('"build"') < text.indexOf('"test"'), 'checks keep spec order');
  assert.deepEqual(load(root), cfg);
});

test('checks.format is an optional known check; unknown check keys are still rejected', () => {
  assert.deepEqual(validate({ ...DEFAULTS, checks: { format: 'prettier --write {files}', types: 'tsc' } }), []);
  const errors = validate({ ...DEFAULTS, checks: { formatter: 'x' } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^checks\.formatter: unknown check \(known: .*format/);
  assert.match(validate({ ...DEFAULTS, checks: { format: '' } })[0], /^checks\.format: must be a non-empty string/);
});
