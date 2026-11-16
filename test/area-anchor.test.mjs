import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';
import { staleAreas } from '../lib/stale.mjs';
import { areasRepo, commitAll, git, write } from './areas-repo.mjs';

async function area(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(['area', ...args], { cwd: root, stdout: out, stderr: err });
  return { code, out: out.text, err: err.text };
}

const read = (root, name) => readFileSync(join(root, `.telos/areas/${name}.md`), 'utf8');
const today = () => new Date().toISOString().slice(0, 10);

test('anchor rewrites only the header commit and date; every other byte is kept', async (t) => {
  const { root, anchor } = areasRepo(t);
  // Odd bytes on purpose: CRLF lines, trailing spaces, no final newline.
  const before = `${read(root, 'api').replace('2026-01-01', '2025-12-31').trimEnd()}\r\nextra  \r\n- \`src/api/\`  `;
  writeFileSync(join(root, '.telos/areas/api.md'), before);
  write(root, 'src/api/routes.mjs', 'export const routes = {};\n');
  const head = commitAll(root, 'api change');
  const web = read(root, 'web');
  const r = await area(root, 'anchor', 'api');
  assert.deepEqual(r, { code: 0, out: `Anchored api at ${head.slice(0, 7)} · ${today()}\n`, err: '' });
  const after = read(root, 'api');
  assert.equal(after, before.replace(`commit ${anchor} · 2025-12-31 ·`, `commit ${head} · ${today()} ·`));
  assert.equal(Buffer.compare(Buffer.from(after.slice(after.indexOf(' · paths: '))), Buffer.from(before.slice(before.indexOf(' · paths: ')))), 0);
  assert.equal(read(root, 'web'), web);
  const s = Object.fromEntries(staleAreas(root).areas.map((a) => [a.name, a.state]));
  assert.deepEqual(s, { api: 'fresh', util: 'fresh', web: 'fresh' });
});

test('anchor --all anchors every area at HEAD', async (t) => {
  const { root } = areasRepo(t);
  write(root, 'lib/util.mjs', 'export const slug = String;\n');
  write(root, 'src/web/app.mjs', 'export const title = String;\n');
  const head = commitAll(root, 'changes');
  assert.equal(staleAreas(root).areas.filter((a) => a.state === 'stale').length, 2);
  const r = await area(root, 'anchor', '--all');
  assert.deepEqual(r, { code: 0, out: `Anchored api, util, web at ${head.slice(0, 7)} · ${today()}\n`, err: '' });
  for (const name of ['api', 'util', 'web']) assert.match(read(root, name), new RegExp(`^<!-- telos-area: commit ${head} · `));
  assert.ok(staleAreas(root).areas.every((a) => a.state === 'fresh'));
});

test('anchor refuses when a covered path is dirty and writes nothing', async (t) => {
  const { root } = areasRepo(t);
  write(root, 'src/web/app.mjs', 'export const title = String;\n');
  write(root, 'src/web/new.mjs', 'export {};\n');
  const before = ['api', 'util', 'web'].map((n) => read(root, n));
  const r = await area(root, 'anchor', 'api', 'web');
  assert.equal(r.code, 1);
  assert.equal(r.out, '');
  assert.equal(r.err, 'telos area: web: uncommitted src/web/app.mjs, src/web/new.mjs\n'
    + 'Nothing anchored. Commit or stash these files, then rerun telos area anchor.\n');
  assert.deepEqual(['api', 'util', 'web'].map((n) => read(root, n)), before);
  assert.equal((await area(root, 'anchor', '--all')).code, 1);
  assert.deepEqual((await area(root, 'anchor', 'api')).code, 0, 'a clean area still anchors alone');
  assert.match(git(root, 'status', '--porcelain'), /\.telos\/areas\/api\.md/);
});

test('anchor: usage errors exit 2; unknown areas and invalid headers exit 1', async (t) => {
  const { root } = areasRepo(t);
  for (const args of [[], ['api', '--all'], ['Bad'], ['--bogus']]) {
    const r = await area(root, 'anchor', ...args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.err}`);
  }
  const unknown = await area(root, 'anchor', 'api', 'nope');
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /no area 'nope'/);
  write(root, '.telos/areas/web.md', '# web\n');
  const invalid = await area(root, 'anchor', 'web');
  assert.equal(invalid.code, 1);
  assert.match(invalid.err, /\.telos\/areas\/web\.md: invalid header; run telos area lint/);
});
