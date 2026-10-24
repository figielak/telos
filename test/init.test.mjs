import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { load as loadConfig, validate } from '../lib/config.mjs';

const fixture = (name) => fileURLToPath(new URL(`fixtures/${name}/`, import.meta.url));

function repo(name = 'empty') {
  const root = mkdtempSync(join(tmpdir(), 'telos-init-'));
  cpSync(fixture(name), root, { recursive: true });
  mkdirSync(join(root, '.git'));
  return root;
}

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

/** All paths under .telos/, directories with a trailing slash. */
function tree(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const rel = relative(join(root, '.telos'), path);
      if (statSync(path).isDirectory()) { out.push(`${rel}/`); walk(path); } else out.push(rel);
    }
  };
  walk(join(root, '.telos'));
  return out;
}

const read = (root, path) => readFileSync(join(root, path), 'utf8');

const MINIMAL = ['MAP.md', 'PROJECT.md', 'ROADMAP.md', 'STATUS.md', 'config.json'];
const STANDARD = ['HISTORY.md', 'LESSONS.md', ...MINIMAL].sort();

test('each profile creates exactly its file set, no empty directories', async () => {
  for (const [profile, files] of [['minimal', MINIMAL], ['standard', STANDARD], ['deep', STANDARD]]) {
    const root = repo();
    const r = await telos(root, 'init', '--profile', profile);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(tree(root), files, profile);
    assert.equal(loadConfig(root).profile, profile);
  }
});

test('rerun creates nothing and reports everything as kept', async () => {
  const root = repo();
  await telos(root, 'init', '--profile', 'standard');
  const before = Object.fromEntries(STANDARD.map((f) => [f, read(root, `.telos/${f}`)]));
  const r = await telos(root, 'init', '--profile', 'standard');
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /^Created:/m);
  assert.match(r.stdout, /^Kept: .*config\.json/m);
  for (const f of STANDARD) assert.equal(read(root, `.telos/${f}`), before[f], f);
});

test('CLAUDE.md keeps user text and gets exactly one current block', async () => {
  const root = repo();
  writeFileSync(join(root, 'CLAUDE.md'), '# My rules\n\nBe nice.\n\n<!-- telos:start -->\nold block\n<!-- telos:end -->\n\nAfter.\n');
  await telos(root, 'init', '--profile', 'minimal');
  await telos(root, 'init', '--profile', 'minimal');
  const text = read(root, 'CLAUDE.md');
  assert.ok(text.startsWith('# My rules\n\nBe nice.\n\n<!-- telos:start v1 -->\n'), text);
  assert.ok(text.endsWith('<!-- telos:end -->\n\nAfter.\n'), text);
  assert.equal(text.match(/telos:start/g).length, 1);
  assert.doesNotMatch(text, /old block/);
});

test('CLAUDE.md is created, or the block appended after user text', async () => {
  const fresh = repo();
  await telos(fresh, 'init', '--profile', 'minimal');
  assert.match(read(fresh, 'CLAUDE.md'), /^<!-- telos:start v1 -->\n/);

  const own = repo();
  writeFileSync(join(own, 'CLAUDE.md'), '# Mine');
  await telos(own, 'init', '--profile', 'minimal');
  assert.match(read(own, 'CLAUDE.md'), /^# Mine\n\n<!-- telos:start v1 -->\n/);
});

test('a start marker without an end marker is refused', async () => {
  const root = repo();
  writeFileSync(join(root, 'CLAUDE.md'), '<!-- telos:start v1 -->\nbroken\n');
  const r = await telos(root, 'init', '--profile', 'minimal');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /telos:end/);
  assert.equal(existsSync(join(root, '.telos')), false, 'nothing written');
});

test('--checks and --stack override detection; invalid input exits 2', async () => {
  const root = repo('astro-ts');
  const r = await telos(root, 'init', '--profile', 'minimal', '--stack', 'python', '--checks', '{"test":"pytest"}');
  assert.equal(r.code, 0, r.stderr);
  const cfg = loadConfig(root);
  assert.deepEqual(cfg.stack, ['python']);
  assert.deepEqual(cfg.checks, { test: 'pytest' });

  assert.equal((await telos(repo(), 'init', '--profile', 'minimal', '--checks', '{nope')).code, 2);
  assert.equal((await telos(repo(), 'init', '--profile', 'minimal', '--checks', '{"bogus":"x"}')).code, 2);
  assert.equal((await telos(repo(), 'init', '--profile', 'huge')).code, 2);
  assert.equal((await telos(repo(), 'init')).code, 2);
});

test('without overrides the detected stack and checks land in config', async () => {
  const root = repo('astro-ts');
  await telos(root, 'init', '--profile', 'standard');
  const cfg = loadConfig(root);
  assert.deepEqual(validate(cfg), []);
  assert.deepEqual(cfg.stack, ['astro', 'typescript']);
  assert.equal(cfg.checks.lint, 'pnpm run lint');
  assert.match(read(root, '.telos/PROJECT.md'), /^# astro-demo$/m);
});

test('a different profile on an initialized repo needs --force', async () => {
  const root = repo();
  await telos(root, 'init', '--profile', 'minimal');
  const r = await telos(root, 'init', '--profile', 'deep');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /minimal/);
  const forced = await telos(root, 'init', '--profile', 'standard', '--force');
  assert.equal(forced.code, 0, forced.stderr);
  assert.equal(loadConfig(root).profile, 'standard');
  assert.deepEqual(tree(root), STANDARD);
});

test('.gitignore gets the cache entry once', async () => {
  const root = repo();
  writeFileSync(join(root, '.gitignore'), 'node_modules/');
  await telos(root, 'init', '--profile', 'minimal');
  await telos(root, 'init', '--profile', 'minimal');
  assert.equal(read(root, '.gitignore'), 'node_modules/\n.telos/.cache/\n');
});

test('Next is /telos:map with code and /telos:plan without', async () => {
  const code = repo();
  mkdirSync(join(code, 'src'));
  writeFileSync(join(code, 'src', 'index.ts'), 'export {};\n');
  await telos(code, 'init', '--profile', 'minimal');
  assert.match(read(code, '.telos/STATUS.md'), /^Next: run \/telos:map to map the existing code$/m);

  const bare = repo('node-plain');
  writeFileSync(join(bare, 'README.md'), '# x\n');
  const r = await telos(bare, 'init', '--profile', 'minimal');
  assert.match(read(bare, '.telos/STATUS.md'), /^Next: plan the first phase with \/telos:plan$/m);
  assert.match(r.stdout, /^Next: plan the first phase with \/telos:plan$/m);
  assert.match(r.stdout, /docs\(telos\): initialize telos/);
});

test('rendered files contain no placeholders', async () => {
  const root = repo();
  await telos(root, 'init', '--profile', 'deep');
  for (const f of tree(root)) assert.doesNotMatch(read(root, `.telos/${f}`), /\{\{/, f);
  assert.doesNotMatch(read(root, 'CLAUDE.md'), /\{\{/);
});
