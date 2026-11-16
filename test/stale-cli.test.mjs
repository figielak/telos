import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';
import { init } from '../lib/init.mjs';
import { STALE_CAP } from '../lib/stale.mjs';
import { areasRepo, commitAll, write } from './areas-repo.mjs';

async function stale(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(['stale', ...args], { cwd: root, stdout: out, stderr: err });
  return { code, out: out.text, err: err.text };
}

test('all fresh: a summary line only; exit 0 with and without --check', async (t) => {
  const { root } = areasRepo(t);
  assert.deepEqual(await stale(root), { code: 0, out: 'fresh: 3 areas\n', err: '' });
  assert.deepEqual(await stale(root, '--check'), { code: 0, out: 'fresh: 3 areas\n', err: '' });
});

test('a changed covered file and a deleted reference: report rows, exit 0; --check exits 1', async (t) => {
  const { root, anchor } = areasRepo(t);
  write(root, 'src/api/server.mjs', 'export const serve = () => 404;\n');
  rmSync(join(root, 'lib/util.mjs'));
  for (const f of ['a', 'b', 'c', 'd']) write(root, `src/web/${f}.mjs`, 'export {};\n');
  write(root, 'docs/guide.md', '# Guide v2\n');
  write(root, 'notes.txt', 'x\n');
  commitAll(root, 'work outside telos');
  write(root, 'src/web/a.mjs', 'export const a = 1;\n');
  const sha = anchor.slice(0, 7);
  const expected = [
    `api: stale · 1 file since ${sha} (src/api/server.mjs)`,
    'api: broken ref src/api/server.mjs:3-5 · past end of file (1 line)',
    `util: stale · 1 file since ${sha} (lib/util.mjs)`,
    'util: broken ref lib/util.mjs:1 · missing',
    `web: stale · 4 files since ${sha} (src/web/a.mjs, src/web/b.mjs, src/web/c.mjs, +1 more) · 1 uncommitted`,
    'web: broken ref lib/util.mjs · missing',
    'fresh: 0 areas',
    'unmapped: 2 files (./ 1, docs/ 1)',
    'Next: check each listed area against its files, fix the note, then telos area anchor <name>',
    '',
  ].join('\n');
  assert.deepEqual(await stale(root), { code: 0, out: expected, err: '' });
  assert.deepEqual(await stale(root, '--check'), { code: 1, out: expected, err: '' });
});

test('broken references alone still get the Next hint', async (t) => {
  const { root } = areasRepo(t);
  write(root, '.telos/areas/web.md', `${readFileSync(join(root, '.telos/areas/web.md'), 'utf8')}\n- see \`src/web/gone.mjs\`, served as \`application/json\`\n`);
  const r = await stale(root, '--check');
  assert.equal(r.code, 1);
  assert.equal(r.out, 'web: broken ref src/web/gone.mjs · missing\nfresh: 2 areas\n'
    + 'Next: check each listed area against its files, fix the note, then telos area anchor <name>\n');
});

test('--area narrows the report and drops the unmapped line; an unknown area fails', async (t) => {
  const { root } = areasRepo(t);
  write(root, 'src/api/routes.mjs', 'export const routes = {};\n');
  write(root, 'docs/guide.md', 'changed\n');
  const r = await stale(root, '--area', 'web', '--area', 'util', '--check');
  assert.deepEqual(r, { code: 0, out: 'fresh: 2 areas\n', err: '' });
  const api = await stale(root, '--area', 'api');
  assert.equal(api.code, 0);
  assert.match(api.out, /^api: stale · 1 file since \w{7} \(src\/api\/routes\.mjs\) · 1 uncommitted\nfresh: 0 areas\nNext: /);
  assert.doesNotMatch(api.out, /unmapped/);
  const missing = await stale(root, '--area', 'nope');
  assert.equal(missing.code, 1);
  assert.match(missing.err, /no area 'nope'/);
});

test('an unanchored area is reported and fails --check', async (t) => {
  const { root } = areasRepo(t);
  const path = join(root, '.telos/areas/web.md');
  write(root, '.telos/areas/web.md', readFileSync(path, 'utf8').replace(/commit \S+/, `commit ${'a'.repeat(40)}`));
  const r = await stale(root, '--check');
  assert.equal(r.code, 1);
  assert.equal(r.out, 'web: unanchored · commit aaaaaaa not found\nfresh: 2 areas\n'
    + 'Next: check each listed area against its files, fix the note, then telos area anchor <name>\n');
});

test('output stays within the cap and counts the omitted lines', async (t) => {
  const { root } = areasRepo(t);
  const refs = Array.from({ length: 400 }, (_, i) => `- \`src/api/missing-${i}.mjs\``).join('\n');
  const path = join(root, '.telos/areas/api.md');
  write(root, '.telos/areas/api.md', readFileSync(path, 'utf8').replace('## Invariants\n', `## Invariants\n${refs}\n`));
  const r = await stale(root);
  assert.equal(r.code, 0);
  assert.ok(r.out.length <= STALE_CAP, `${r.out.length}`);
  const shown = r.out.split('\n').filter((l) => l.startsWith('api: broken ref')).length;
  const omitted = Number(/… (\d+) more lines omitted; narrow with telos stale --area <name>/.exec(r.out)?.[1]);
  assert.equal(shown + omitted, 400);
  assert.match(r.out, /fresh: 2 areas\nNext: [^\n]+\n$/);
});

test('usage errors exit 2; no areas exits 0; no git exits 1', async (t) => {
  const { root } = areasRepo(t);
  for (const args of [['--bogus'], ['extra'], ['--area', 'Bad Name'], ['--area']]) {
    const r = await stale(root, ...args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.err}`);
    assert.match(r.err, /^telos stale: /);
  }
  const plain = mkdtempSync(join(tmpdir(), 'telos-stale-cli-'));
  t.after(() => rmSync(plain, { recursive: true, force: true }));
  mkdirSync(join(plain, '.git'));
  init(plain);
  assert.deepEqual(await stale(plain, '--check'), { code: 0, out: 'No areas. Create one: telos area new <name> --paths a,b\n', err: '' });
  mkdirSync(join(plain, '.telos/areas'), { recursive: true });
  write(plain, '.telos/areas/x.md', '# x\n');
  const r = await stale(plain);
  assert.equal(r.code, 1);
  assert.match(r.err, /^telos stale: No git work tree/);
});
