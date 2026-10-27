import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

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

test('hooks.json wires the git guard on Bash and the edit guard on Edit/Write to existing scripts', () => {
  const hooks = readJson('hooks/hooks.json').hooks;
  const pre = hooks.PreToolUse;
  const command = (matcher) => pre.find((h) => h.matcher === matcher)?.hooks.map((x) => x.command) ?? [];
  assert.deepEqual(command('Bash'), ['node "${CLAUDE_PLUGIN_ROOT}/hooks/git-guard.mjs"']);
  const edit = pre.find((h) => h.matcher.split('|').includes('Edit'));
  assert.ok(edit, 'edit guard matcher missing');
  for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) assert.ok(edit.matcher.split('|').includes(tool), tool);
  assert.deepEqual(edit.hooks.map((x) => x.command), ['node "${CLAUDE_PLUGIN_ROOT}/hooks/edit-guard.mjs"']);
  for (const group of Object.values(hooks).flat()) {
    for (const { command: cmd } of group.hooks) {
      const script = /\$\{CLAUDE_PLUGIN_ROOT\}\/(hooks\/[\w-]+\.mjs)/.exec(cmd)?.[1];
      assert.ok(script, cmd);
      assert.ok(existsSync(new URL(script, root)), script);
    }
  }
});
