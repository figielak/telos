import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { estimateTokens } from '../lib/map-budget.mjs';
import { scanRepo, renderScan } from '../lib/map-scan.mjs';
import { headMetadata, recentPathCounts } from '../lib/git.mjs';
import { main } from '../lib/cli.mjs';

const bin = fileURLToPath(new URL('../bin/telos', import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
function temp(t, fixture) {
  const root = mkdtempSync(join(tmpdir(), 'telos-scan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (fixture) cpSync(new URL(`./fixtures/${fixture}/`, import.meta.url), root, { recursive: true });
  return root;
}
function put(root, path, text = 'line\n') {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
}
function init(root) {
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'commit.gpgsign', 'false');
}
function commit(root, paths) {
  git(root, 'add', '--', ...paths);
  git(root, 'commit', '-qm', 'fixture');
}

test('token estimator counts UTF-16 code units and rounds boundaries', () => {
  assert.deepEqual(['', 'a', '1234', '12345', '😀😀a'].map(estimateTokens), [0, 1, 1, 2, 2]);
});

test('Astro inventory exposes evidence, full counts, sorted tree, sizes, churn and ranked suggestions', (t) => {
  const root = temp(t, 'astro-ts');
  put(root, 'src/pages/index.astro', '---\nconst title = "hi";\n---\n<h1>{title}</h1>\n');
  put(root, 'src/a.ts', 'a\n'.repeat(300));
  put(root, 'src/z.ts', 'z\n'.repeat(300));
  put(root, 'src/deep/more/hidden.ts');
  put(root, 'test/example.test.ts');
  init(root);
  commit(root, ['src', 'test', 'package.json']);
  put(root, 'src/z.ts', 'b\n'.repeat(300));
  commit(root, ['src/z.ts']);
  put(root, 'src/a.ts', 'c\n'.repeat(300));
  commit(root, ['src/a.ts']);
  put(root, 'untracked.ts');
  const scan = scanRepo(root);
  assert.equal(scan.head, git(root, 'rev-parse', 'HEAD'));
  assert.equal(headMetadata(root).head, scan.head);
  assert.ok(scan.files.some((f) => f.path === 'src/deep/more/hidden.ts'));
  assert.ok(!JSON.stringify(scan.tree).includes('hidden.ts'));
  assert.ok(JSON.stringify(scan.tree).includes('src/deep/more'));
  assert.ok(scan.entries.some((e) => e.path === 'src/pages/index.astro' && /candidate/i.test(e.reason)));
  assert.ok(scan.tests.some((f) => f.path === 'test/example.test.ts'));
  assert.deepEqual(scan.changed.slice(0, 2).map((f) => [f.path, f.count]), [['src/a.ts', 2], ['src/z.ts', 2]]);
  assert.deepEqual(scan.largest.slice(0, 2).map((f) => f.path), ['src/a.ts', 'src/z.ts']);
  assert.deepEqual(scan.suggestions.slice(0, 3).map((f) => f.path), ['src/pages/index.astro', 'src/a.ts', 'src/z.ts']);
  assert.equal(new Set(scan.suggestions.map((f) => f.path)).size, scan.suggestions.length);
  assert.ok(scan.suggestions.length <= 8);
  for (const f of scan.suggestions) assert.ok(f.start === 1 && f.end >= 1 && f.end <= 80);
  assert.ok(scan.dirty.includes('untracked.ts'));
  const output = renderScan(scan);
  for (const label of ['HEAD:', 'Files:', 'Tree', 'Manifests', 'Entries', 'Tests', 'Largest', 'Changed', 'Suggestions', 'Dirty', 'Warnings']) assert.ok(output.includes(label), label);
  assert.match(output, /astro|typescript/);
  assert.match(output, /scripts.build|astro build/);
  assert.match(output, /src\/.*files/);
  assert.equal(renderScan(scanRepo(root)), output);
});

test('package main, bin and conditional exports are candidate evidence without import', (t) => {
  const root = temp(t);
  put(root, 'package.json', JSON.stringify({ main: './lib/main.js', bin: { demo: './bin/run.js' }, exports: { '.': { import: './lib/main.js', require: './lib/require.js' } } }));
  for (const p of ['lib/main.js', 'bin/run.js', 'lib/require.js']) put(root, p, 'throw new Error("must not execute");\n');
  const scan = scanRepo(root);
  assert.deepEqual(scan.entries.map((f) => f.path), ['bin/run.js', 'lib/main.js', 'lib/require.js']);
  assert.ok(scan.entries.every((f) => /package.json.*candidate/i.test(f.reason)));
});

test('Python scripts and main/app modules, checks and config remain inert data', (t) => {
  const root = temp(t, 'python-uv');
  put(root, 'pyproject.toml', '[project]\nname = "demo"\n[project.scripts]\ndemo = "demo.cli:main"\n[tool.pytest.ini_options]\naddopts = "-q"\n');
  for (const p of ['src/demo/cli.py', 'src/demo/__main__.py', 'app.py', 'tests/test_app.py']) put(root, p, 'raise Exception("must not execute")\n');
  const scan = scanRepo(root);
  assert.ok(scan.entries.some((e) => e.path === 'src/demo/cli.py' && /project.scripts/.test(e.reason)));
  assert.ok(scan.entries.some((e) => e.path === 'src/demo/__main__.py'));
  assert.ok(scan.entries.some((e) => e.path === 'app.py'));
  const output = renderScan(scan);
  assert.match(output, /python/);
  assert.match(output, /uv run pytest/);
  assert.match(output, /project.scripts.demo/);
  assert.match(output, /tool.pytest.ini_options/);
  assert.ok(!scan.files.some((f) => f.path === 'uv.lock'));
});

test('excludes generated, vendor, cache, virtualenv, locks, binaries and symlinks at every depth', (t) => {
  const root = temp(t);
  for (const dir of ['.git', '.telos', '.planning', 'node_modules', 'vendor', 'dist', 'build', 'out', 'coverage', '.cache', '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox']) put(root, `${dir}/ignored.ts`);
  put(root, 'src/node_modules/no.ts');
  put(root, 'package-lock.json', '{}');
  put(root, 'image.bin', Buffer.from([1, 0, 2]));
  put(root, 'image.png', Buffer.from([137, 80, 78, 71]));
  put(root, 'src/a/b/c/deep.ts');
  symlinkSync(join(root, 'src'), join(root, 'linked-dir'));
  symlinkSync(join(root, 'src/a/b/c/deep.ts'), join(root, 'linked.ts'));
  const scan = scanRepo(root);
  assert.deepEqual(scan.files.map((f) => f.path), ['src/a/b/c/deep.ts']);
  assert.ok(!JSON.stringify(scan.tree).includes('deep.ts'));
});

test('missing HEAD, unborn repo, malformed manifests and unavailable history give usable evidence', (t) => {
  const root = temp(t);
  put(root, 'package.json', '{oops');
  put(root, 'main.py');
  for (const unborn of [false, true]) {
    if (unborn) init(root);
    const scan = scanRepo(root);
    assert.equal(scan.head, null);
    assert.ok(scan.files.length >= 2);
    assert.match(scan.warnings.join('\n'), /HEAD|history/i);
    assert.match(scan.warnings.join('\n'), /package.json/);
    assert.deepEqual(recentPathCounts(root), []);
  }
});

test('unsupported newline/backtick paths and unreadable entries are counted omissions', (t) => {
  const root = temp(t);
  put(root, 'bad\nname.ts');
  put(root, 'bad`name.ts');
  put(root, 'secret.ts');
  chmodSync(join(root, 'secret.ts'), 0);
  const scan = scanRepo(root);
  chmodSync(join(root, 'secret.ts'), 0o600);
  assert.ok(!scan.files.some((f) => /[\n`]/.test(f.path)));
  assert.match(scan.warnings.join('\n'), /unsupported.*2|2.*unsupported/i);
  if (process.getuid?.() !== 0) {
    assert.ok(!scan.files.some((f) => f.path === 'secret.ts'));
    assert.match(scan.warnings.join('\n'), /unreadable/i);
  }
});

test('symlink manifests are never followed, even by detection', (t) => {
  const root = temp(t);
  const outside = temp(t);
  put(outside, 'package.json', '{"scripts":{"test":"SECRET"}}');
  symlinkSync(join(outside, 'package.json'), join(root, 'package.json'));
  assert.ok(!renderScan(scanRepo(root)).includes('SECRET'));
});

test('large unicode inventories and oversized values fit whole rows with omission counts', (t) => {
  const root = temp(t);
  put(root, 'package.json', JSON.stringify({ scripts: { test: '界😀'.repeat(30000) } }));
  for (let i = 0; i < 350; i++) put(root, `src/${String(i).padStart(3, '0')}-界😀.ts`, 'x\n');
  const scan = scanRepo(root);
  for (const budget of [8000, 2000, 1000]) {
    const output = renderScan(scan, budget);
    assert.ok(output.length <= budget, `${output.length} > ${budget}`);
    assert.ok(output.endsWith('\n'));
    assert.match(output, /omitted/);
    assert.match(output, /Files: 351/);
    assert.match(output, /HEAD:/);
    assert.match(output, /Warnings:/);
    assert.ok(estimateTokens(output) <= Math.ceil(budget / 4));
    assert.equal(output, renderScan(scanRepo(root), budget));
  }
});

test('git history is capped at 100 commits, with paths counted once per commit', (t) => {
  const root = temp(t);
  init(root);
  put(root, 'old.ts');
  commit(root, ['old.ts']);
  for (let i = 0; i < 100; i++) {
    put(root, 'current.ts', `${i}\n`);
    commit(root, ['current.ts']);
  }
  assert.deepEqual(recentPathCounts(root), [{ path: 'current.ts', count: 100 }]);
});

test('CLI works without init, rejects args/options with 2 and reports fatal errors with 1', async (t) => {
  const root = temp(t);
  put(root, 'main.py');
  const ok = spawnSync(bin, ['map-scan'], { cwd: root, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Files: 1/);
  for (const arg of ['--unknown', 'extra']) assert.equal(spawnSync(bin, ['map-scan', arg], { cwd: root }).status, 2);
  const capture = () => ({ text: '', write(s) { this.text += s; } });
  const stdout = capture(), stderr = capture();
  assert.equal(await main(['map-scan'], { cwd: join(root, 'missing'), stdout, stderr }), 1);
  assert.equal(stdout.text, '');
  assert.match(stderr.text, /map-scan/);
  assert.throws(() => scanRepo(join(root, 'missing')));
});
