import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { brokenReferences, parseReference, pathReferences } from '../lib/refs.mjs';
import { staleAreas } from '../lib/stale.mjs';
import { areasRepo } from './areas-repo.mjs';

const broken = (root) => Object.fromEntries(staleAreas(root).areas.map((a) => [a.name, a.broken]));

test('parseReference: paths, directories and ranges; invalid spans are null', () => {
  assert.deepEqual(parseReference('lib/a.mjs:3-9'), { path: 'lib/a.mjs', directory: false, start: 3, end: 9 });
  assert.deepEqual(parseReference('src/'), { path: 'src/', directory: true });
  assert.deepEqual(parseReference('./lib/a.mjs:4'), { path: 'lib/a.mjs', directory: false, start: 4, end: 4 });
  for (const raw of ['../up', '/abs', 'a.mjs:0', 'a.mjs:5-2', 'dir/:3', ' a', 'a\\b']) assert.equal(parseReference(raw), null, raw);
});

test('pathReferences: only path-like spans outside comments and fences count', () => {
  const text = '<!-- `hidden/x.mjs` -->\nSee `lib/a.mjs:2`, `cli.mjs:4`, `telos area for`, `limits.map_tokens`, `hooks/*.mjs`,'
    + ' `.telos/areas/<name>.md`, `localhost:3000`, `16:9` and `README.md`.\n```\n`fenced/y.mjs`\n```\n';
  assert.deepEqual(pathReferences(text).map((r) => r.raw), ['lib/a.mjs:2', 'cli.mjs:4']);
});

test('the fixture areas reference only valid files and ranges', (t) => {
  const { root } = areasRepo(t);
  assert.deepEqual(broken(root), { api: [], util: [], web: [] });
});

test('a deleted file and a line past the end are broken refs; a valid range is not', (t) => {
  const { root } = areasRepo(t);
  rmSync(join(root, 'src/api/routes.mjs'));
  writeFileSync(join(root, 'src/api/server.mjs'), 'export function serve() {}\n');
  const b = broken(root);
  assert.deepEqual(b.api, [
    { raw: 'src/api/server.mjs:3-5', problem: 'past end of file (1 line)' },
    { raw: 'src/api/routes.mjs', problem: 'missing' },
  ]);
  assert.deepEqual(b.web, []);
  assert.deepEqual(b.util, []);
});

test('a range ending exactly on the last line is valid; a directory ref must be a directory', (t) => {
  const { root } = areasRepo(t);
  assert.equal(readFileSync(join(root, 'src/api/server.mjs'), 'utf8').split('\n').length - 1, 5);
  assert.deepEqual(brokenReferences(root, '`src/api/server.mjs:5` `src/api/server.mjs:1-5` `src/api/` `src/`'), []);
  assert.deepEqual(brokenReferences(root, '`src/api/server.mjs:6` `lib/util.mjs/` `docs/:1` `src/api:2`'), [
    { raw: 'src/api/server.mjs:6', problem: 'past end of file (5 lines)' },
    { raw: 'lib/util.mjs/', problem: 'not a directory' },
    { raw: 'src/api:2', problem: 'not a file' },
  ]);
});

test('spans whose first segment is not in the repo are prose, not broken refs', (t) => {
  const { root } = areasRepo(t);
  const text = 'Returns `application/json` from `origin/master` via `@scope/pkg`; see `src/web/gone.mjs` and `gone.mjs:2`.';
  assert.deepEqual(brokenReferences(root, text), [
    { raw: 'src/web/gone.mjs', problem: 'missing' },
    { raw: 'gone.mjs:2', problem: 'missing' },
  ]);
});

test('an unreadable referenced file is a broken ref, not a crash', { skip: process.getuid?.() === 0 }, (t) => {
  const { root } = areasRepo(t);
  chmodSync(join(root, 'src/api/server.mjs'), 0o000);
  try {
    assert.deepEqual(brokenReferences(root, 'See `src/api/server.mjs:2`.'), [{ raw: 'src/api/server.mjs:2', problem: 'unreadable' }]);
  } finally {
    chmodSync(join(root, 'src/api/server.mjs'), 0o644);
  }
});
