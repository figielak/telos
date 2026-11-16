import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
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

const FILES = ['HISTORY.md', 'MAP.md', 'PROJECT.md', 'ROADMAP.md', 'STATUS.md', 'config.json'];

test('init creates exactly the memory files and a version 2 config, no empty directories', async () => {
  const root = repo();
  const r = await telos(root, 'init');
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(tree(root), FILES);
  assert.equal(loadConfig(root).version, 2);
  assert.doesNotMatch(read(root, '.telos/config.json'), /profile/);
});

test('rerun creates nothing and reports everything as kept', async () => {
  const root = repo();
  await telos(root, 'init');
  const before = Object.fromEntries(FILES.map((f) => [f, read(root, `.telos/${f}`)]));
  const r = await telos(root, 'init');
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /^Created:/m);
  assert.match(r.stdout, /^Kept: .*config\.json/m);
  for (const f of FILES) assert.equal(read(root, `.telos/${f}`), before[f], f);
});

// 14-03: the rules block lives in AGENTS.md, which every agent reads; CLAUDE.md imports it.
const BLOCK = /^<!-- telos:start v5 -->\n[\s\S]*?<!-- telos:end -->\n/m;

test('a fresh repo gets the block in AGENTS.md and a CLAUDE.md that imports it', async () => {
  const root = repo();
  const r = await telos(root, 'init');
  assert.equal(r.code, 0, r.stderr);
  assert.match(read(root, 'AGENTS.md'), /^<!-- telos:start v5 -->\n## Telos\n/);
  assert.equal(read(root, 'CLAUDE.md'), '@AGENTS.md\n');
  assert.match(r.stdout, /^Created: config\.json, .*AGENTS\.md, CLAUDE\.md/m);
});

test('an existing AGENTS.md keeps its text and gets exactly one current block; reruns change nothing', async () => {
  const root = repo();
  writeFileSync(join(root, 'AGENTS.md'), '# Agents\n\nUse tabs.\n\n<!-- telos:start v4 -->\nold block\n<!-- telos:end -->\n\nAfter.\n');
  writeFileSync(join(root, 'CLAUDE.md'), '# Claude\n\n@AGENTS.md\n');
  await telos(root, 'init');
  const agents = read(root, 'AGENTS.md');
  assert.ok(agents.startsWith('# Agents\n\nUse tabs.\n\n<!-- telos:start v5 -->\n'), agents);
  assert.ok(agents.endsWith('<!-- telos:end -->\n\nAfter.\n'), agents);
  assert.doesNotMatch(agents, /old block/);
  assert.equal(read(root, 'CLAUDE.md'), '# Claude\n\n@AGENTS.md\n', 'an existing import is kept as is');

  const r = await telos(root, 'init');
  assert.doesNotMatch(r.stdout, /^(Created|Updated):/m);
  assert.match(r.stdout, /^Kept: .*AGENTS\.md, CLAUDE\.md/m);
  assert.equal(read(root, 'AGENTS.md'), agents);

  const plain = repo();
  writeFileSync(join(plain, 'AGENTS.md'), '# Mine');
  await telos(plain, 'init');
  assert.match(read(plain, 'AGENTS.md'), /^# Mine\n\n<!-- telos:start v5 -->\n/);
});

test('an old CLAUDE.md block migrates: removed, replaced by the import, user text kept', async () => {
  const root = repo();
  writeFileSync(join(root, 'CLAUDE.md'), '# My rules\n\nBe nice.\n\n<!-- telos:start v4 -->\n## Telos\nold\n<!-- telos:end -->\n\nAfter.\n');
  await telos(root, 'init');
  assert.equal(read(root, 'CLAUDE.md'), '# My rules\n\nBe nice.\n\n@AGENTS.md\n\nAfter.\n');
  assert.match(read(root, 'AGENTS.md'), BLOCK);
  assert.equal(read(root, 'AGENTS.md').match(/telos:start/g).length, 1);

  const imported = repo();
  writeFileSync(join(imported, 'CLAUDE.md'), '@AGENTS.md\n\n<!-- telos:start -->\nold\n<!-- telos:end -->\n');
  await telos(imported, 'init');
  assert.equal(read(imported, 'CLAUDE.md'), '@AGENTS.md\n', 'the block goes; the import is not doubled');

  const middle = repo();
  writeFileSync(join(middle, 'CLAUDE.md'), 'A\n\n<!-- telos:start -->\nold\n<!-- telos:end -->\n\nB\n@AGENTS.md\n');
  await telos(middle, 'init');
  assert.equal(read(middle, 'CLAUDE.md'), 'A\n\nB\n@AGENTS.md\n');

  const own = repo();
  writeFileSync(join(own, 'CLAUDE.md'), '# Mine');
  await telos(own, 'init');
  assert.equal(read(own, 'CLAUDE.md'), '# Mine\n\n@AGENTS.md\n');
});

test('a CLAUDE.md that links to AGENTS.md is left alone', async () => {
  const root = repo();
  writeFileSync(join(root, 'AGENTS.md'), '# Shared\n');
  symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
  const r = await telos(root, 'init');
  assert.equal(r.code, 0, r.stderr);
  assert.match(read(root, 'AGENTS.md'), /^# Shared\n\n<!-- telos:start v5 -->/);
  assert.doesNotMatch(read(root, 'AGENTS.md'), /@AGENTS\.md/);
  assert.ok(lstatSync(join(root, 'CLAUDE.md')).isSymbolicLink());
});

test('a start marker without an end marker in either file is refused, writing nothing', async () => {
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const root = repo();
    writeFileSync(join(root, file), '<!-- telos:start v4 -->\nbroken\n');
    const r = await telos(root, 'init');
    assert.equal(r.code, 1, file);
    assert.match(r.stderr, new RegExp(`${file.replace('.', '\\.')} has .*telos:end`), file);
    assert.equal(existsSync(join(root, '.telos')), false, `${file}: nothing written`);
    assert.equal(existsSync(join(root, file === 'AGENTS.md' ? 'CLAUDE.md' : 'AGENTS.md')), false, `${file}: no other file`);
  }
});

test('--checks and --stack override detection; invalid input exits 2', async () => {
  const root = repo('astro-ts');
  const r = await telos(root, 'init', '--stack', 'python', '--checks', '{"test":"pytest"}');
  assert.equal(r.code, 0, r.stderr);
  const cfg = loadConfig(root);
  assert.deepEqual(cfg.stack, ['python']);
  assert.deepEqual(cfg.checks, { test: 'pytest' });

  assert.equal((await telos(repo(), 'init', '--checks', '{nope')).code, 2);
  assert.equal((await telos(repo(), 'init', '--checks', '{"bogus":"x"}')).code, 2);
  assert.equal((await telos(repo(), 'init', '--profile', 'standard')).code, 2, 'profiles are gone');
});

test('without overrides the detected stack and checks land in config', async () => {
  const root = repo('astro-ts');
  await telos(root, 'init');
  const cfg = loadConfig(root);
  assert.deepEqual(validate(cfg), []);
  assert.deepEqual(cfg.stack, ['astro', 'typescript']);
  assert.equal(cfg.checks.lint, 'pnpm run lint');
  assert.match(read(root, '.telos/PROJECT.md'), /^# astro-demo$/m);
});

test('--force rewrites a version 1 config as version 2, keeping its values; --checks overrides them', async () => {
  const root = repo();
  mkdirSync(join(root, '.telos'));
  writeFileSync(join(root, '.telos', 'config.json'), JSON.stringify({ version: 1, profile: 'deep', stack: ['go'],
    checks: { test: 'go test ./...', format: 'gofmt -w {files}' }, strict_scope: true, git: { auto_commit: false, phase_tags: true } }));
  const kept = await telos(root, 'init');
  assert.match(kept.stdout, /^Kept: config\.json/m);
  assert.match(read(root, '.telos/config.json'), /"profile":\s*"deep"/, 'without --force the file stays as it is');
  const forced = await telos(root, 'init', '--force');
  assert.equal(forced.code, 0, forced.stderr);
  assert.match(forced.stdout, /^Updated: config\.json/m);
  const cfg = JSON.parse(read(root, '.telos/config.json'));
  assert.deepEqual(Object.keys(cfg), ['version', 'stack', 'checks', 'limits', 'git', 'files_language']);
  assert.deepEqual([cfg.version, cfg.stack, cfg.checks, cfg.git.auto_commit], [2, ['go'], { test: 'go test ./...' }, false]);
  await telos(root, 'init', '--force', '--checks', '{"test":"make test"}');
  assert.deepEqual(loadConfig(root).checks, { test: 'make test' });
  assert.deepEqual(tree(root), FILES);
});

test('.gitignore gets the cache entry once', async () => {
  const root = repo();
  writeFileSync(join(root, '.gitignore'), 'node_modules/');
  await telos(root, 'init');
  await telos(root, 'init');
  assert.equal(read(root, '.gitignore'), 'node_modules/\n.telos/.cache/\n');
});

test('Next is /telos:map with code and /telos:plan without', async () => {
  const code = repo();
  mkdirSync(join(code, 'src'));
  writeFileSync(join(code, 'src', 'index.ts'), 'export {};\n');
  await telos(code, 'init');
  assert.match(read(code, '.telos/STATUS.md'), /^Next: run \/telos:map to map the existing code$/m);

  const bare = repo('node-plain');
  writeFileSync(join(bare, 'README.md'), '# x\n');
  const r = await telos(bare, 'init');
  assert.match(read(bare, '.telos/STATUS.md'), /^Next: plan the first phase with \/telos:plan$/m);
  assert.match(r.stdout, /^Next: plan the first phase with \/telos:plan$/m);
  assert.match(r.stdout, /docs\(telos\): initialize telos/);
});

test('rendered files contain no placeholders', async () => {
  const root = repo();
  await telos(root, 'init');
  for (const f of tree(root)) assert.doesNotMatch(read(root, `.telos/${f}`), /\{\{/, f);
  for (const f of ['AGENTS.md', 'CLAUDE.md']) assert.doesNotMatch(read(root, f), /\{\{/, f);
});
