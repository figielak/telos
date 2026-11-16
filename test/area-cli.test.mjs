import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { lintArea } from '../lib/areas.mjs';
import { main } from '../lib/cli.mjs';
import { init } from '../lib/init.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

/** A committed repo with `telos init`; `commit: false` leaves it without HEAD. */
function repo(t, { commit = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-area-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  git(root, 'config', 'commit.gpgsign', 'false');
  mkdirSync(join(root, 'src/a'), { recursive: true });
  writeFileSync(join(root, 'src/a/x.ts'), 'export {};\n');
  if (commit) {
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'init');
  }
  init(root);
  return root;
}

async function area(root, args, { cwd = root } = {}) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(['area', ...args], { cwd, stdout: out, stderr: err });
  return { code, out: out.text, err: err.text };
}

const read = (root, rel) => readFileSync(join(root, rel), 'utf8');

test('area new creates a valid file anchored at HEAD; a second new of the same name fails', async (t) => {
  const root = repo(t);
  const head = git(root, 'rev-parse', 'HEAD');
  const r = await area(root, ['new', 'auth', '--paths', 'src/a/, ./lib/x.mjs']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'Created .telos/areas/auth.md · paths: src/a/, lib/x.mjs\n');
  const text = read(root, '.telos/areas/auth.md');
  assert.match(text.split('\n')[0], new RegExp(`^<!-- telos-area: commit ${head} · \\d{4}-\\d{2}-\\d{2} · paths: src/a/, lib/x\\.mjs -->$`));
  assert.deepEqual(lintArea(text, { name: 'auth', limit: 800 }), []);
  const again = await area(root, ['new', 'auth', '--paths', 'src/a/']);
  assert.equal(again.code, 1);
  assert.match(again.err, /already exists/);
  assert.equal(read(root, '.telos/areas/auth.md'), text);
});

test('area new: bad names, missing or bad paths are usage errors (2); no HEAD is a failure (1)', async (t) => {
  const root = repo(t);
  for (const args of [['new'], ['new', 'Auth', '--paths', 'a/'], ['new', 'x'.repeat(31), '--paths', 'a/'], ['new', 'auth'],
    ['new', 'auth', '--paths', '../up'], ['new', 'auth', '--paths', 'a/,a'], ['new', 'auth', 'two', '--paths', 'a/'],
    ['new', 'auth', '--paths', 'a/', '--bogus']]) {
    const r = await area(root, args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.err}`);
    assert.match(r.err, /^telos area: /);
  }
  const bare = repo(t, { commit: false });
  const r = await area(bare, ['new', 'auth', '--paths', 'src/a/']);
  assert.equal(r.code, 1);
  assert.match(r.err, /HEAD/);
});

test('area list shows name · paths · tokens/limit, and a hint when empty', async (t) => {
  const root = repo(t);
  assert.deepEqual(await area(root, ['list']), { code: 0, out: 'No areas. Create one: telos area new <name> --paths a,b\n', err: '' });
  await area(root, ['new', 'web', '--paths', 'src/a/']);
  await area(root, ['new', 'core', '--paths', 'lib/, bin/telos']);
  const tokens = (name) => Math.ceil(read(root, `.telos/areas/${name}.md`).length / 4);
  const r = await area(root, ['list']);
  assert.equal(r.code, 0);
  assert.equal(r.out, `core · lib/, bin/telos · ${tokens('core')}/800\nweb · src/a/ · ${tokens('web')}/800\n`);
  assert.equal((await area(root, ['list', 'extra'])).code, 2);
});

test('area show prints the file; an unknown area is 1, a bad name is 2', async (t) => {
  const root = repo(t);
  await area(root, ['new', 'web', '--paths', 'src/a/']);
  const r = await area(root, ['show', 'web']);
  assert.equal(r.code, 0);
  assert.equal(r.out, read(root, '.telos/areas/web.md'));
  const missing = await area(root, ['show', 'nope']);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /no area 'nope'/);
  assert.equal((await area(root, ['show', '../etc'])).code, 2);
  assert.equal((await area(root, ['show'])).code, 2);
});

test('area for prints matching names with the / boundary, accepting cwd-relative and absolute paths', async (t) => {
  const root = repo(t);
  await area(root, ['new', 'a', '--paths', 'src/a/']);
  await area(root, ['new', 'ab', '--paths', 'src/ab/']);
  await area(root, ['new', 'x', '--paths', 'src/a/x.ts']);
  assert.deepEqual(await area(root, ['for', 'src/a/x.ts']), { code: 0, out: 'a\nx\n', err: '' });
  assert.equal((await area(root, ['for', 'src/ab/y.ts'])).out, 'ab\n');
  assert.equal((await area(root, ['for', 'src/abc.ts'])).out, 'none\n');
  assert.equal((await area(root, ['for', 'src/a/y.ts', 'src/ab/y.ts'])).out, 'a\nab\n');
  assert.equal((await area(root, ['for', join(root, 'src/ab/y.ts')])).out, 'ab\n');
  assert.equal((await area(root, ['for', 'x.ts'], { cwd: join(root, 'src/a') })).out, 'a\nx\n');
  assert.equal((await area(root, ['for'])).code, 2);
  assert.equal((await area(root, ['for', '/elsewhere/file.ts'])).code, 2);
});

test('area lint exits 0 when all areas are valid and 1 with one line per problem', async (t) => {
  const root = repo(t);
  assert.deepEqual(await area(root, ['lint']), { code: 0, out: 'Areas: 0 · all valid\n', err: '' });
  await area(root, ['new', 'good', '--paths', 'src/a/']);
  await area(root, ['new', 'bad', '--paths', 'src/b/']);
  assert.deepEqual(await area(root, ['lint']), { code: 0, out: 'Areas: 2 · all valid\n', err: '' });
  const file = join(root, '.telos/areas/bad.md');
  writeFileSync(file, read(root, '.telos/areas/bad.md').replace('## Rejected\n', '').replace(/$/, `${'x'.repeat(4000)}\n`));
  writeFileSync(join(root, '.telos/areas/Bad_Name.md'), 'no header\n');
  const r = await area(root, ['lint']);
  assert.equal(r.code, 1);
  const lines = r.out.trimEnd().split('\n');
  assert.ok(lines.includes('.telos/areas/bad.md: missing section "## Rejected"'));
  assert.ok(lines.some((l) => /^\.telos\/areas\/bad\.md: \d+ estimated tokens > limit 800/.test(l)));
  assert.ok(lines.some((l) => l.startsWith('.telos/areas/Bad_Name.md: invalid area name')));
  assert.ok(lines.every((l, i) => i === lines.length - 1 || l.startsWith('.telos/areas/')));
  assert.match(lines.at(-1), /^Areas: 3 · \d+ problems$/);
  assert.equal((await area(root, ['lint', 'x'])).code, 2);
});

test('area without a subcommand or with an unknown one is a usage error; outside telos it is 1', async (t) => {
  const root = repo(t);
  assert.equal((await area(root, [])).code, 2);
  assert.equal((await area(root, ['nope'])).code, 2);
  const plain = mkdtempSync(join(tmpdir(), 'telos-area-plain-'));
  t.after(() => rmSync(plain, { recursive: true, force: true }));
  mkdirSync(join(plain, '.git'));
  const r = await area(plain, ['list']);
  assert.equal(r.code, 1);
  assert.match(r.err, /not initialized/);
});
