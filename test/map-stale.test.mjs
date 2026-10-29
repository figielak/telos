import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeStop, mapStaleness, remindOnce } from '../lib/map-stale.mjs';

const STOP = fileURLToPath(new URL('../hooks/stop.mjs', import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
function put(root, path, text) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** Deep repo whose MAP header names the commit that contains src/ and package.json. */
function repo(t, { profile = 'deep', checks = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-map-stale-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  for (const [k, v] of [['user.email', 't@example.com'], ['user.name', 'T'], ['commit.gpgsign', 'false']]) git(root, 'config', k, v);
  put(root, 'package.json', '{"name":"demo","main":"src/main.js","bin":{"demo":"bin/demo.js"}}\n');
  put(root, 'src/main.js', 'export const main = 1;\n');
  put(root, 'bin/demo.js', '#!/usr/bin/env node\n');
  put(root, '.telos/config.json', JSON.stringify({ profile, checks }));
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'chore: init');
  put(root, '.telos/MAP.md', `<!-- telos-map: commit ${git(root, 'rev-parse', 'HEAD')} · 2026-10-29 · files 3 -->\n# Map\n`);
  git(root, 'add', '.telos/MAP.md');
  git(root, 'commit', '-q', '-m', 'docs(telos): map');
  return root;
}

test('a new top-level source directory after the MAP commit gives one short advisory', (t) => {
  const root = repo(t);
  assert.equal(mapStaleness(root, {}), null);
  put(root, 'lib/util.js', 'export const u = 1;\n');
  const untracked = mapStaleness(root, {});
  assert.match(untracked, /^telos map: \.telos\/MAP\.md \(commit [0-9a-f]{7}\) may be stale — new top-level lib\/; run \/telos:map --refresh when convenient \(advisory\)\.$/);
  git(root, 'add', 'lib/util.js');
  git(root, 'commit', '-q', '-m', 'feat: lib');
  assert.equal(mapStaleness(root, {}), untracked);
  assert.ok(untracked.length <= 300);
});

test('a new declared entry point in package.json or pyproject scripts is reported', (t) => {
  const root = repo(t);
  put(root, 'package.json', '{"name":"demo","main":"src/main.js","bin":{"demo":"bin/demo.js","tool":"src/tool.js"},"exports":{".":"./src/main.js","./cli":"./src/cli.js"}}\n');
  assert.match(mapStaleness(root, {}), /new entry points package\.json bin\.tool, package\.json exports\.\., package\.json exports\.\.\/cli;/);
  put(root, 'pyproject.toml', '[project.scripts]\nserve = "app.server:main"\n');
  assert.match(mapStaleness(root, {}), /pyproject\.toml project\.scripts\.serve/);
});

test('ordinary edits, existing directories and excluded trees stay silent', (t) => {
  const root = repo(t);
  put(root, 'src/main.js', 'export const main = 2;\n');
  put(root, 'src/deep/new.js', 'x\n');
  for (const dir of ['node_modules/x', 'vendor/y', '.cache/z', '.telos/phases', 'dist/out', 'coverage/c', '__pycache__/p', '.hidden/h']) {
    put(root, `${dir}/f.js`, 'x\n');
  }
  assert.equal(mapStaleness(root, {}), null);
});

test('lower profiles, a missing or broken MAP baseline and stop_hook_active are silent', (t) => {
  const root = repo(t);
  put(root, 'lib/util.js', 'x\n');
  assert.ok(mapStaleness(root, {}));
  assert.equal(mapStaleness(root, { stop_hook_active: true }), null);
  for (const header of ['<!-- telos-map: not built -->\n', '# Map\n', `<!-- telos-map: commit ${'f'.repeat(40)} · 2026-10-29 · files 3 -->\n`]) {
    put(root, '.telos/MAP.md', header);
    assert.equal(mapStaleness(root, {}), null, header);
  }
  rmSync(join(root, '.telos/MAP.md'));
  assert.equal(mapStaleness(root, {}), null);
  for (const profile of ['minimal', 'standard']) {
    const other = repo(t, { profile });
    put(other, 'lib/util.js', 'x\n');
    assert.equal(mapStaleness(other, {}), null, profile);
  }
  assert.equal(mapStaleness(mkdtempSync(join(tmpdir(), 'telos-map-none-')), {}), null);
});

test('a check failure still blocks with exit 2 alone; the advisory never blocks', () => {
  assert.deepEqual(composeStop('types: FAIL', 'telos map: stale'), { exit: 2, stderr: 'types: FAIL\n', stdout: '' });
  assert.deepEqual(composeStop(null, 'telos map: stale'), { exit: 0, stderr: '', stdout: `${JSON.stringify({ systemMessage: 'telos map: stale' })}\n` });
  assert.deepEqual(composeStop(null, null), { exit: 0, stderr: '', stdout: '' });
});

test('the same advisory is shown once per session; a different one shows again', (t) => {
  const root = repo(t);
  assert.equal(remindOnce(root, 's1', 'A'), 'A');
  assert.equal(remindOnce(root, 's1', 'A'), null);
  assert.equal(remindOnce(root, 's1', 'B'), 'B');
  assert.equal(remindOnce(root, 's2', 'B'), 'B');
  assert.equal(remindOnce(root, 's1', null), null);
});

test('the Stop hook prints the deep reminder as a nonblocking message and is silent when active', (t) => {
  const root = repo(t);
  put(root, 'lib/util.js', 'x\n');
  const input = (active) => JSON.stringify({ cwd: root, session_id: 'hook', stop_hook_active: active });
  const r = spawnSync(process.execPath, [STOP], { input: input(false), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout).systemMessage, /may be stale — new top-level lib\//);
  const quiet = spawnSync(process.execPath, [STOP], { input: input(true), encoding: 'utf8' });
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stdout, '');
});
