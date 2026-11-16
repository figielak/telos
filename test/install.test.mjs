import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 14-04: the CLI works without the plugin. `npm install -g <repo>` and `npm link` both put
// `<prefix>/bin/telos -> ../lib/node_modules/telos/bin/telos` on PATH, with the package directory
// itself a symlink to the repo; bin/telos must still find lib/, shared/ and templates/.

const REPO = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

/** A global prefix laid out like npm's, linking back to this repo. */
function prefix(t) {
  const dir = mkdtempSync(join(tmpdir(), 'telos-prefix-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'lib', 'node_modules'), { recursive: true });
  mkdirSync(join(dir, 'bin'));
  symlinkSync(REPO, join(dir, 'lib', 'node_modules', 'telos'), 'dir');
  symlinkSync('../lib/node_modules/telos/bin/telos', join(dir, 'bin', 'telos'));
  return dir;
}

/** Run `telos` by name through PATH, from `cwd`. */
function telos(bin, cwd, ...args) {
  const env = { ...process.env, PATH: [bin, process.env.PATH].join(delimiter) };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync('telos', args, { cwd, env, encoding: 'utf8' });
  assert.equal(r.error, undefined);
  return r;
}

test('bin/telos is an executable node script', () => {
  accessSync(join(REPO, 'bin', 'telos'), constants.X_OK);
  assert.match(readFileSync(join(REPO, 'bin', 'telos'), 'utf8'), /^#!\/usr\/bin\/env node\n/);
});

test('a symlinked bin path runs from any directory and finds lib, shared and templates', (t) => {
  const bin = join(prefix(t), 'bin');
  const elsewhere = mkdtempSync(join(tmpdir(), 'telos-elsewhere-'));
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));

  const v = telos(bin, elsewhere, '--version');
  assert.equal(v.status, 0, v.stderr);
  assert.equal(v.stdout, `${version}\n`);

  const shared = telos(bin, elsewhere, 'ctx', 'shared', 'status');
  assert.equal(shared.status, 0, shared.stderr);
  assert.match(shared.stdout, /^Use only the context above/);

  spawnSync('git', ['init', '-q', elsewhere]);
  const init = telos(bin, elsewhere, 'init');
  assert.equal(init.status, 0, init.stderr);
  assert.match(readFileSync(join(elsewhere, 'AGENTS.md'), 'utf8'), /^<!-- telos:start v\d+ -->/);
  assert.ok(existsSync(join(elsewhere, '.telos', 'STATUS.md')));
  const status = telos(bin, elsewhere, 'status');
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /^Next: /m);
});
