import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadAreas } from '../lib/areas.mjs';
import { staleAreas, unmappedFiles } from '../lib/stale.mjs';
import { areasRepo, commitAll, setAnchor, write } from './areas-repo.mjs';

const states = (root) => Object.fromEntries(staleAreas(root).areas.map((a) => [a.name, a]));

test('a freshly anchored repo: every area fresh, nothing changed', (t) => {
  const { root, anchor } = areasRepo(t);
  const r = staleAreas(root);
  assert.equal(r.error, null);
  assert.deepEqual(r.areas.map((a) => [a.name, a.state, a.commit]), [['api', 'fresh', anchor], ['util', 'fresh', anchor], ['web', 'fresh', anchor]]);
  assert.deepEqual(unmappedFiles(loadAreas(root), r.changed), []);
});

test('stale by commit: a covered file changed after the anchor; unmapped lists the rest', (t) => {
  const { root } = areasRepo(t);
  write(root, 'src/api/routes.mjs', 'export const routes = {};\n');
  write(root, 'docs/guide.md', '# Guide v2\n');
  commitAll(root, 'change api and docs');
  const s = states(root);
  assert.equal(s.api.state, 'stale');
  assert.deepEqual(s.api.files, ['src/api/routes.mjs']);
  assert.deepEqual(s.api.dirty, []);
  assert.equal(s.web.state, 'fresh');
  assert.equal(s.util.state, 'fresh');
  const r = staleAreas(root);
  assert.deepEqual(unmappedFiles(loadAreas(root), r.changed), ['docs/guide.md']);
});

test('stale by dirty work tree: modified, untracked and deleted covered files count', (t) => {
  const { root } = areasRepo(t);
  write(root, 'lib/util.mjs', 'export const slug = () => "";\n');
  write(root, 'src/web/new.mjs', 'export {};\n');
  rmSync(join(root, 'src/api/routes.mjs'));
  const s = states(root);
  assert.deepEqual([s.api.state, s.api.files, s.api.dirty], ['stale', ['src/api/routes.mjs'], ['src/api/routes.mjs']]);
  assert.deepEqual([s.web.state, s.web.files], ['stale', ['src/web/new.mjs']]);
  assert.deepEqual([s.util.state, s.util.files], ['stale', ['lib/util.mjs']]);
});

test('a rename shows both sides; the / boundary keeps src/apix out of src/api/', (t) => {
  const { root } = areasRepo(t);
  mkdirSync(join(root, 'src/apix'));
  write(root, 'src/apix/x.mjs', 'export {};\n');
  renameSync(join(root, 'src/web/app.mjs'), join(root, 'docs/app.mjs'));
  commitAll(root, 'move');
  const s = states(root);
  assert.equal(s.api.state, 'fresh');
  assert.deepEqual(s.web.files, ['src/web/app.mjs']);
  assert.deepEqual(unmappedFiles(loadAreas(root), staleAreas(root).changed), ['docs/app.mjs', 'src/apix/x.mjs']);
});

test('unanchored: a missing anchor commit or an invalid header is reported, never fresh', (t) => {
  const { root } = areasRepo(t);
  setAnchor(root, 'f'.repeat(40), ['api']);
  write(root, '.telos/areas/web.md', '# web\n');
  const s = states(root);
  assert.deepEqual([s.api.state, s.api.reason], ['unanchored', 'commit fffffff not found']);
  assert.deepEqual([s.web.state, s.web.reason], ['unanchored', 'invalid header (run telos area lint)']);
  assert.equal(s.util.state, 'fresh');
});

test('areas with different anchors are diffed from their own commit', (t) => {
  const { root, anchor } = areasRepo(t);
  write(root, 'src/api/routes.mjs', 'export const routes = {};\n');
  const second = commitAll(root, 'api change');
  setAnchor(root, second, ['api']);
  write(root, 'lib/util.mjs', 'export const slug = String;\n');
  commitAll(root, 'util change');
  const s = states(root);
  assert.deepEqual([s.api.state, s.api.commit], ['fresh', second]);
  assert.deepEqual([s.util.state, s.util.commit, s.util.files], ['stale', anchor, ['lib/util.mjs']]);
});

test('no git work tree or no HEAD: an error, no areas judged', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'telos-stale-plain-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.telos', 'areas'), { recursive: true });
  writeFileSync(join(root, '.telos', 'areas', 'x.md'), '# x\n');
  const r = staleAreas(root);
  assert.match(r.error, /No git work tree/);
  assert.deepEqual(r.areas, []);
});
