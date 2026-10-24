import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

const pkg = readJson('package.json');
const plugin = readJson('.claude-plugin/plugin.json');
const marketplace = readJson('.claude-plugin/marketplace.json');

test('plugin.json is named telos and matches the package version', () => {
  assert.equal(plugin.name, 'telos');
  assert.equal(plugin.version, pkg.version);
});

test('marketplace.json lists telos from the repo root', () => {
  const entry = marketplace.plugins.find((p) => p.name === 'telos');
  assert.ok(entry, 'telos entry missing');
  assert.equal(entry.source, './');
});

test('package.json declares no dependencies', () => {
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    assert.equal(pkg[key], undefined, `${key} must not be set`);
  }
});
