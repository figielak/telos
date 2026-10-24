import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { findRoot, telosDir } from '../lib/repo.mjs';

const bin = fileURLToPath(new URL('../bin/telos', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const run = (...args) => spawnSync(bin, args, { encoding: 'utf8' });
const tempDir = () => realpathSync(mkdtempSync(join(tmpdir(), 'telos-cli-')));

function capture() {
  const sink = { text: '', write(s) { sink.text += s; } };
  return sink;
}

test('--version prints the package version', () => {
  const r = run('--version');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), pkg.version);
});

test('--help lists registered commands', async () => {
  const stdout = capture();
  const commands = { demo: { help: 'Demo command', run: () => 0 } };
  const code = await main(['--help'], { commands, stdout, stderr: capture() });
  assert.equal(code, 0);
  assert.match(stdout.text, /Usage: telos/);
  assert.match(stdout.text, /demo\s+Demo command/);
  assert.equal(run('--help').status, 0);
});

test('unknown command prints one line on stderr and exits 2', () => {
  const r = run('nope');
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr.trim().split('\n').length, 1);
  assert.match(r.stderr, /nope/);
});

test('findRoot finds the repo root from a nested dir', () => {
  const root = tempDir();
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, 'a', 'b'), { recursive: true });
  assert.equal(findRoot(join(root, 'a', 'b')), root);
  assert.equal(telosDir(root), join(root, '.telos'));
});

test('findRoot returns null outside a repo', () => {
  assert.equal(findRoot(tempDir()), null);
});

test('a command needing .telos/ exits 1 when not initialized', async () => {
  const root = tempDir();
  mkdirSync(join(root, '.git'));
  const stderr = capture();
  let ran = false;
  const commands = { demo: { help: 'Demo', needsTelos: true, run: () => { ran = true; return 0; } } };
  const code = await main(['demo'], { commands, cwd: root, stdout: capture(), stderr });
  assert.equal(code, 1);
  assert.equal(ran, false);
  assert.equal(stderr.text.trim(), 'Telos not initialized. Run /telos:init.');
});
