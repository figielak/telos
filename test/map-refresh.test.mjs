import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { diffNameStatus } from '../lib/git.mjs';
import { inspectMap, mapHeader } from '../lib/map.mjs';
import { planRefresh } from '../lib/map-refresh.mjs';
import { scanRepo } from '../lib/map-scan.mjs';
import { render } from '../lib/template.mjs';

const hash = 'a'.repeat(40);
const header = mapHeader({ commit: hash, date: '2026-10-26', files: 9999 });
const AREAS = { auth: ['src/auth/'], board: ['src/board/'] };
const rowsOf = (spec) => Object.entries(spec).map(([name, paths]) => `- ${name} — ${name} · ${paths.map((p) => `\`${p}\``).join(', ')}`).join('\n');
function mapOf({ structure = '- `src/` — sources', rows = rowsOf(AREAS), find = '- `src/find.ts`' } = {}) {
  return inspectMap(`${header}\n# Map\n\n## Structure\n${structure}\n\n## Areas\n<!-- preface -->\n${rows}\n\n## Find\n${find}\n`, { limit: 6000 });
}
const areasOf = (spec = AREAS) => Object.entries(spec).map(([name, paths]) => ({ name, header: paths && { commit: hash, date: '2026-10-26', paths } }));
const change = (status, path, oldPath) => ({ status, path, ...(oldPath === undefined ? {} : { oldPath }) });
const plan = (map, changes, extra = {}) => planRefresh({ map, areas: areasOf(extra.spec), changes, baselineAvailable: true, error: null, ...extra });
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
function temp(t) {
  const root = mkdtempSync(join(tmpdir(), 'telos-refresh-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function put(root, path, text = 'line\n') {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
}
function repo(t) {
  const root = temp(t);
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  return root;
}
function commit(root, paths) {
  git(root, 'add', '--', ...paths);
  git(root, 'commit', '-qm', 'fixture');
  return git(root, 'rev-parse', 'HEAD');
}
function fakeGit(t, output) {
  const calls = [];
  t.mock.method(childProcess, 'execFileSync', (command, args) => {
    calls.push({ command, args });
    if (output instanceof Error) throw output;
    return output;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return calls;
}

test('a modification selects the referencing index blocks and the owning area only', () => {
  const map = mapOf({ structure: '- `docs/`', find: '- `src/auth/login.ts`' });
  const original = structuredClone(map);
  const result = plan(map, [change('M', 'src/auth/login.ts')]);
  assert.deepEqual(result.blocks, ['find']);
  assert.deepEqual(result.areas, ['auth']);
  assert.equal(result.affected, 2);
  assert.equal(result.total, 5);
  assert.equal(result.mode, 'incremental');
  assert.deepEqual(map, original);
  assert.deepEqual(plan(map, [change('M', 'src/auth/login.ts')]), result);
});

test('area ownership uses the / boundary and cannot confuse src/a with src/ab', () => {
  const spec = { a: ['src/a/'], ab: ['src/ab/'], x: ['src/exact'] };
  const map = mapOf({ structure: '- `docs/`', rows: rowsOf(spec), find: '- `src/exact`' });
  const areas = (path) => plan(map, [change('M', path)], { spec }).areas;
  assert.deepEqual(areas('src/ab/file.ts'), ['ab']);
  assert.deepEqual(areas('src/a/file.ts'), ['a']);
  assert.deepEqual(areas('src/exact'), ['x']);
  assert.deepEqual(plan(map, [change('M', 'src/exact')], { spec }).blocks, ['find']);
  assert.deepEqual(plan(map, [change('M', 'src/exact/file.ts')], { spec }).blocks, []);
  assert.equal(plan(map, [change('M', 'src/abc.ts')], { spec }).mode, 'noop');
});

test('many affected areas stay incremental: area files are never rebuilt wholesale', () => {
  const spec = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`a${i}`, [`src/a${i}/`]]));
  const map = mapOf({ structure: '- `docs/`', rows: rowsOf(spec) });
  const result = plan(map, Array.from({ length: 5 }, (_, i) => change('M', `src/a${i}/x.ts`)), { spec });
  assert.equal(result.mode, 'incremental');
  assert.equal(result.affected, 5);
  assert.equal(result.total, 9);
  assert.deepEqual(result.areas, ['a0', 'a1', 'a2', 'a3', 'a4']);
});

test('add/delete/rename/copy select Structure, the Areas index and the owning areas', () => {
  const spec = { auth: ['src/auth/'], board: ['src/board/base.ts'] };
  const map = mapOf({ structure: '- `docs/`', rows: rowsOf(spec) });
  const cases = [
    [change('A', 'src/auth/new file.ts'), ['auth'], []],
    [change('D', 'src/board/base.ts'), ['board'], []],
    [change('R100', 'src/auth/new file.ts', 'src/board/base.ts'), ['auth', 'board'], []],
    [change('C75', 'src/board/copy file.ts', 'src/auth/old file.ts'), ['auth'], ['src/board/copy file.ts']],
  ];
  for (const [item, areas, candidates] of cases) {
    const result = plan(map, [item], { spec });
    assert.deepEqual(result.blocks, ['structure', 'areas'], item.status);
    assert.deepEqual(result.areas, areas, item.status);
    assert.deepEqual(result.newAreaPaths, candidates, item.status);
  }
});

test('unassigned additions and rename/copy destinations are sorted new-area candidates', () => {
  const spec = { auth: ['src/auth/'] };
  const map = mapOf({ structure: '- `docs/`', rows: rowsOf(spec) });
  const result = plan(map, [change('A', 'z/new.ts'), change('D', 'deleted.ts'), change('R100', 'a/renamed file.ts', 'src/auth/old.ts'), change('C100', 'a/copied.ts', 'src/auth/original.ts'), change('A', 'z/new.ts')], { spec });
  assert.deepEqual(result.newAreaPaths, ['a/copied.ts', 'a/renamed file.ts', 'z/new.ts']);
  assert.deepEqual(result.blocks, ['structure', 'areas']);
  assert.deepEqual(result.areas, ['auth']);
});

test('overlapping areas are all selected', () => {
  const spec = { one: ['src/shared.ts'], two: ['src/'] };
  const map = mapOf({ structure: '- `docs/`', rows: rowsOf(spec) });
  assert.deepEqual(plan(map, [change('M', 'src/shared.ts')], { spec }).areas, ['one', 'two']);
});

test('empty or comment-only index sections are excluded from the denominator but stay write targets', () => {
  const map = mapOf({ structure: '', find: '<!-- guidance only -->' });
  const noop = plan(map, [change('M', 'src/start.ts')]);
  assert.equal(noop.mode, 'noop');
  assert.equal(noop.total, 3);
  const addition = plan(map, [change('A', 'new/file.ts')]);
  assert.deepEqual(addition.blocks, ['structure', 'areas']);
  assert.equal(addition.total, 3);
  assert.equal(addition.affected, 1);
  assert.equal(addition.mode, 'incremental');
  const noFinalNewline = inspectMap(map.blocks.map((b) => b.text).join('').trimEnd(), { limit: 6000 });
  assert.equal(plan(noFinalNewline, [change('M', 'src/start.ts')]).total, 3);
});

test('missing/stub/invalid MAP, a MAP with no areas or refs and an unavailable baseline fall back to full', () => {
  const empty = mapOf({ structure: '', rows: '', find: '' });
  const unusable = [null, inspectMap(null, { limit: 600 }), inspectMap(render('MAP.md', {}), { limit: 600 }), inspectMap('bad map', { limit: 600 })];
  for (const map of unusable) {
    const result = plan(map, []);
    assert.equal(result.mode, 'full');
    assert.match(result.reason, /MAP baseline/);
  }
  const bare = planRefresh({ map: empty, areas: [], changes: [], baselineAvailable: true, error: null });
  assert.equal(bare.mode, 'full');
  assert.match(bare.reason, /no area files and no usable references/);
  assert.equal(plan(empty, []).mode, 'noop');
  const result = plan(mapOf(), [], { baselineAvailable: false, error: 'unknown revision' });
  assert.equal(result.mode, 'full');
  assert.match(result.reason, /baseline.*commit|commit.*baseline/i);
});

test('empty, unowned and excluded-only diffs are noop with the MAP unchanged', () => {
  const map = mapOf();
  const original = structuredClone(map);
  const exclusions = ['.git/config', '.telos/MAP.md', '.telos/areas/auth.md', '.planning/x.md', 'node_modules/a.ts', 'vendor/a.py', 'dist/a.ts', 'build/a.ts', 'out/a.ts', 'coverage/a.ts', '.cache/a.ts', '.next/a.ts', '.nuxt/a.ts', '.output/a.ts', '.astro/a.ts', '.turbo/a.ts', '.parcel-cache/a.ts', '.svelte-kit/a.ts', '.venv/a.py', 'venv/a.py', 'env/a.py', '__pycache__/a.py', '.pytest_cache/a.py', '.mypy_cache/a.py', '.ruff_cache/a.py', '.tox/a.py', '.nox/a.py', 'src/vendor/a.ts', 'uv.lock', 'pnpm-lock.yaml', 'package-lock.json', 'a.png', 'a.bin'];
  for (const changes of [[], [change('M', 'unmapped.ts')], exclusions.map((p) => change('A', p))]) {
    const result = plan(map, changes);
    assert.equal(result.mode, 'noop');
    assert.equal(result.affected, 0);
    assert.deepEqual(result.blocks, []);
    assert.deepEqual(result.areas, []);
    assert.deepEqual(result.newAreaPaths, []);
    assert.match(result.reason, /provenance|no relevant/i);
    assert.deepEqual(map, original);
  }
});

test('renaming into/out of excluded directories retains only eligible endpoint impact', () => {
  const map = mapOf({ find: '- `src/auth/file.ts`' });
  for (const item of [change('R100', 'dist/file.ts', 'src/auth/file.ts'), change('R100', 'src/auth/file.ts', 'dist/file.ts')]) {
    const result = plan(map, [item]);
    assert.deepEqual(result.blocks, ['structure', 'areas', 'find']);
    assert.deepEqual(result.areas, ['auth']);
  }
});

test('git errors, unsupported paths, ambiguous refs, broken area headers and malformed records refuse', () => {
  const map = mapOf();
  assert.equal(plan(map, [], { error: 'git diff failed' }).mode, 'refused');
  for (const path of ['src/bad\nfile.ts', 'src/bad`file.ts', 'src/a\u2028b.ts', '../outside.ts', 'src\\bad.ts', '/absolute.ts']) {
    const result = plan(map, [change('M', path)]);
    assert.equal(result.mode, 'refused', path);
    assert.match(result.reason, /unsupported|ambiguous|invalid/i);
  }
  for (const ref of ['src/*.ts', 'src/a?.ts', 'src/[ab].ts', 'src/a\u2028b.ts']) {
    const ambiguous = mapOf({ find: `- \`${ref}\`` });
    assert.equal(ambiguous.state, 'built');
    const result = plan(ambiguous, [change('M', 'src/a.ts')]);
    assert.equal(result.mode, 'refused', ref);
    assert.match(result.reason, /reference/i);
  }
  const broken = plan(map, [change('M', 'src/auth/a.ts')], { spec: { auth: null, board: ['src/board/'] } });
  assert.equal(broken.mode, 'refused');
  assert.match(broken.reason, /\.telos\/areas\/auth\.md has an invalid header/);
  for (const changes of [null, [change('R100', 'src/new.ts')], [change('Q', 'a.ts')], [{ status: 'M' }]]) {
    assert.equal(plan(map, changes).mode, 'refused');
  }
});

test('diffNameStatus reads real committed adds, deletes, renames and modifications without git writes', (t) => {
  const root = repo(t);
  for (const p of ['src/old file.ts', 'src/delete me.ts', 'src/change.ts']) put(root, p, `${p}\n`.repeat(20));
  const baseline = commit(root, ['src']);
  git(root, 'mv', 'src/old file.ts', 'src/renamed file.ts');
  rmSync(join(root, 'src/delete me.ts'));
  put(root, 'src/change.ts', 'new content\n');
  put(root, 'src/added file.ts');
  commit(root, ['src']);
  const before = git(root, 'rev-parse', 'HEAD');
  const index = readFileSync(join(root, '.git/index'));
  const result = diffNameStatus(root, baseline);
  assert.equal(result.error, null);
  assert.deepEqual(result.changes, [change('A', 'src/added file.ts'), change('M', 'src/change.ts'), change('D', 'src/delete me.ts'), change('R100', 'src/renamed file.ts', 'src/old file.ts')]);
  assert.equal(git(root, 'rev-parse', 'HEAD'), before);
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.deepEqual(readFileSync(join(root, '.git/index')), index);
  assert.deepEqual(diffNameStatus(root, before), { changes: [], error: null });
  assert.deepEqual(scanRepo(root).files.map((f) => f.path), ['src/added file.ts', 'src/change.ts', 'src/renamed file.ts']);
});

test('a valid baseline on unrelated branch history still uses baseline..HEAD', (t) => {
  const root = repo(t);
  put(root, 'src/start.ts', 'base\n');
  const baseline = commit(root, ['src/start.ts']);
  git(root, 'checkout', '--orphan', 'independent');
  put(root, 'src/start.ts', 'different\n');
  const current = commit(root, ['src/start.ts']);
  assert.notEqual(current, baseline);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
  const diff = diffNameStatus(root, baseline);
  assert.equal(diff.error, null);
  assert.deepEqual(diff.changes, [change('M', 'src/start.ts')]);
  assert.equal(plan(mapOf({ structure: '- `docs/`', find: '- `src/start.ts`' }), diff.changes).mode, 'incremental');
});

test('invalid hashes, missing baseline commits and git execution failures return explicit errors', (t) => {
  const root = repo(t);
  put(root, 'a.ts');
  commit(root, ['a.ts']);
  for (const baseline of ['', '--help', 'HEAD', 'a'.repeat(39), 'g'.repeat(40), hash]) {
    const result = diffNameStatus(root, baseline);
    assert.deepEqual(result.changes, []);
    assert.match(result.error, /hash|baseline|git diff/i);
  }
  const result = diffNameStatus(join(root, 'missing'), hash);
  assert.ok(result.error);
});

test('NUL parsing preserves copy/rename fields, exact read-only argv and unsupported names for refusal', (t) => {
  const output = 'C100\0old space.ts\0new space.ts\0R075\0old\tname.ts\0new\nname.ts\0M\0normal.ts\0';
  const calls = fakeGit(t, output);
  const result = diffNameStatus('/repo with spaces', hash);
  assert.equal(result.error, null);
  assert.deepEqual(result.changes, [change('C100', 'new space.ts', 'old space.ts'), change('R075', 'new\nname.ts', 'old\tname.ts'), change('M', 'normal.ts')]);
  assert.deepEqual(calls, [{ command: 'git', args: ['-C', '/repo with spaces', 'diff', '--name-status', '-z', '-M', `${hash}..HEAD`, '--'] }]);
  assert.equal(plan(mapOf(), result.changes).mode, 'refused');
});

test('truncated, invalid and failed git output cannot masquerade as an empty diff', (t) => {
  const calls = fakeGit(t, '');
  for (const output of ['M\0file.ts', 'R100\0old.ts\0', 'C100\0old.ts\0new.ts', 'Q\0file.ts\0', 'M\0\0', 'R999\0old.ts\0new.ts\0', 'garbage', new Error('spawn failed')]) {
    childProcess.execFileSync.mock.mockImplementation(() => { if (output instanceof Error) throw output; return output; });
    const result = diffNameStatus('/repo', hash);
    assert.ok(result.error, JSON.stringify(output));
    assert.deepEqual(result.changes, []);
    assert.equal(plan(mapOf(), result.changes, { error: result.error }).mode, 'refused');
  }
  assert.equal(calls.length, 0);
});
