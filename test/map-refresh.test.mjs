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
function mapOf({ structure = '- `src/` — sources', entry = '- `src/start.ts`', flows = '- `src/flow.ts`', find = '- `src/find.ts`', areas = [['Auth', '- `src/auth/`'], ['Board', '- `src/board/`']] } = {}) {
  return inspectMap(`${header}\n# Map\n\n## Structure\n${structure}\n\n## Entry points\n${entry}\n\n## Flows\n${flows}\n\n## Areas\n<!-- preface is not a unit -->\n\n${areas.map(([name, body]) => `### ${name}\n${body}\n`).join('\n')}\n## Find\n${find}\n`, { limit: 6000 });
}
const change = (status, path, oldPath) => ({ status, path, ...(oldPath === undefined ? {} : { oldPath }) });
const plan = (map, changes, extra = {}) => planRefresh({ map, changes, baselineAvailable: true, error: null, ...extra });
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

test('modification selects every referencing unit in MAP order, never an unrelated Area', () => {
  const map = mapOf({ entry: '- `src/auth/login.ts:1-20`\n- `src/auth/login.ts:30-40`', flows: '- `src/auth/login.ts`', find: '- `src/auth/login.ts`' });
  const original = structuredClone(map);
  const result = plan(map, [change('M', 'src/auth/login.ts')]);
  assert.deepEqual(result.blocks, ['structure', 'entry-points', 'flows', 'area:Auth', 'find']);
  assert.equal(result.affected, 5);
  assert.equal(result.total, 6);
  assert.equal(result.mode, 'full');
  assert.deepEqual(map, original);
  assert.deepEqual(plan(map, [change('M', 'src/auth/login.ts')]), result);
});

test('file and directory matches use path boundaries and cannot confuse src/a with src/ab', () => {
  const map = mapOf({ structure: '- `docs/`', entry: '- `src/exact`', areas: [['A', '- `src/a/`'], ['AB', '- `src/ab/`']] });
  assert.deepEqual(plan(map, [change('M', 'src/ab/file.ts')]).blocks, ['area:AB']);
  assert.deepEqual(plan(map, [change('M', 'src/a/file.ts')]).blocks, ['area:A']);
  assert.deepEqual(plan(map, [change('M', 'src/exact')]).blocks, ['entry-points']);
  assert.deepEqual(plan(map, [change('M', 'src/exact/file.ts')]).blocks, []);
  const fileOnly = mapOf({ structure: '- `docs/`', entry: '- `src/a`', areas: [] });
  assert.deepEqual(plan(fileOnly, [change('M', 'src/ab')]).blocks, []);
});

test('exactly 3/10 remains incremental, 4/10 is full, repeated refs count once', () => {
  const areas = Array.from({ length: 6 }, (_, i) => [`A${i}`, `- \`src/a${i}/\``]);
  const map = mapOf({ structure: '- `docs/`', entry: '- `src/start.ts`\n- `src/start.ts:1-3`', areas });
  const three = plan(map, [change('M', 'src/start.ts'), change('M', 'src/flow.ts'), change('M', 'src/find.ts'), change('M', 'src/start.ts')]);
  assert.equal(three.total, 10);
  assert.equal(three.affected, 3);
  assert.equal(three.mode, 'incremental');
  assert.deepEqual(three.blocks, ['entry-points', 'flows', 'find']);
  const four = plan(map, [change('M', 'src/start.ts'), change('M', 'src/flow.ts'), change('M', 'src/find.ts'), change('M', 'src/a0/test.ts')]);
  assert.equal(four.affected, 4);
  assert.equal(four.mode, 'full');
  assert.ok(!four.blocks.includes('areas'));
  assert.ok(!four.blocks.includes('header'));
});

test('add/delete/rename/copy select Structure and nearest Areas for old and new spaced paths', () => {
  const map = mapOf({ structure: '- `docs/`', areas: [['Auth', '- `src/auth/old file.ts`'], ['Board', '- `src/board/base.ts`'], ['Other', '- `other/a.ts`']] });
  const cases = [
    [change('A', 'src/auth/new file.ts'), ['structure', 'area:Auth']],
    [change('D', 'src/auth/deleted.ts'), ['structure', 'area:Auth']],
    [change('R100', 'src/board/new file.ts', 'src/auth/old file.ts'), ['structure', 'area:Auth', 'area:Board']],
    [change('C75', 'src/board/copy file.ts', 'src/auth/old file.ts'), ['structure', 'area:Auth', 'area:Board']],
  ];
  for (const [item, expected] of cases) {
    const result = plan(map, [item]);
    assert.deepEqual(result.blocks, expected, item.status);
    assert.deepEqual(result.newAreaPaths, []);
  }
});

test('nearest directory ownership chooses deeper Areas and reports ambiguous ties', () => {
  const map = mapOf({ structure: '- `docs/`', areas: [['General', '- `src/`'], ['Auth', '- `src/auth/login.ts`'], ['Board', '- `src/board/game.ts`']] });
  const result = plan(map, [change('A', 'src/auth/new.ts')]);
  assert.deepEqual(result.blocks, ['structure', 'area:General', 'area:Auth']);
  const tied = mapOf({ areas: [['One', '- `src/auth/one.ts`'], ['Two', '- `src/auth/two.ts`']] });
  const refused = plan(tied, [change('A', 'src/auth/new.ts')]);
  assert.equal(refused.mode, 'refused');
  assert.match(refused.reason, /ambiguous.*Area|Area.*ambiguous/i);
});

test('unassigned additions and rename/copy destinations are sorted new-Area candidates', () => {
  const map = mapOf({ structure: '- `docs/`', areas: [['Auth', '- `src/auth/`']] });
  const result = plan(map, [change('A', 'z/new.ts'), change('D', 'deleted.ts'), change('R100', 'a/renamed file.ts', 'src/auth/old.ts'), change('C100', 'a/copied.ts', 'src/auth/original.ts'), change('A', 'z/new.ts')]);
  assert.deepEqual(result.newAreaPaths, ['a/copied.ts', 'a/renamed file.ts', 'z/new.ts']);
  assert.deepEqual(result.blocks, ['structure', 'area:Auth']);
});

test('explicit file ownership disambiguates Areas with files in the same directory', () => {
  const map = mapOf({ structure: '- `docs/`', areas: [['One', '- `src/one.ts`'], ['Two', '- `src/two.ts`']] });
  const deleted = plan(map, [change('D', 'src/one.ts')]);
  assert.notEqual(deleted.mode, 'refused');
  assert.deepEqual(deleted.blocks, ['structure', 'area:One']);
  const shared = mapOf({ structure: '- `docs/`', areas: [['One', '- `src/shared.ts`'], ['Two', '- `src/shared.ts`']] });
  assert.deepEqual(plan(shared, [change('D', 'src/shared.ts')]).blocks, ['structure', 'area:One', 'area:Two']);
});

test('empty/comment-only sections and Areas are excluded from the denominator', () => {
  const map = mapOf({ structure: '', flows: '<!-- guidance only -->', find: '', areas: [['Auth', '- `src/auth/`'], ['Empty', '<!-- placeholder -->']] });
  const result = plan(map, [change('M', 'src/start.ts')]);
  assert.equal(result.total, 2);
  assert.equal(result.affected, 1);
  const noFinalNewline = inspectMap(map.blocks.map((b) => b.text).join('').trimEnd(), { limit: 6000 });
  assert.equal(plan(noFinalNewline, [change('M', 'src/start.ts')]).total, 2);
  const addition = plan(map, [change('A', 'new/file.ts')]);
  assert.ok(addition.blocks.includes('structure'));
  assert.equal(addition.total, 2);
  assert.equal(addition.affected, 0);
  assert.equal(addition.mode, 'incremental');
});

test('missing/stub/invalid/unreferenced MAP and unavailable baseline use explicit full fallbacks', () => {
  const empty = mapOf({ structure: '', entry: '', flows: '', find: '', areas: [] });
  const unusable = [null, inspectMap(null, { limit: 1500 }), inspectMap(render('MAP.md', {}), { limit: 1500 }), inspectMap('bad map', { limit: 1500 }), empty];
  for (const map of unusable) {
    const result = plan(map, []);
    assert.equal(result.mode, 'full');
    assert.match(result.reason, /MAP|baseline|reference/i);
  }
  const result = plan(mapOf(), [], { baselineAvailable: false, error: 'unknown revision' });
  assert.equal(result.mode, 'full');
  assert.match(result.reason, /baseline.*commit|commit.*baseline/i);
});

test('empty, unreferenced and excluded-only diffs are noop with body and offsets unchanged', () => {
  const map = mapOf();
  const original = structuredClone(map);
  const exclusions = ['.git/config', '.telos/MAP.md', '.planning/x.md', 'node_modules/a.ts', 'vendor/a.py', 'dist/a.ts', 'build/a.ts', 'out/a.ts', 'coverage/a.ts', '.cache/a.ts', '.next/a.ts', '.nuxt/a.ts', '.output/a.ts', '.astro/a.ts', '.turbo/a.ts', '.parcel-cache/a.ts', '.svelte-kit/a.ts', '.venv/a.py', 'venv/a.py', 'env/a.py', '__pycache__/a.py', '.pytest_cache/a.py', '.mypy_cache/a.py', '.ruff_cache/a.py', '.tox/a.py', '.nox/a.py', 'src/vendor/a.ts', 'uv.lock', 'pnpm-lock.yaml', 'package-lock.json', 'a.png', 'a.bin'];
  for (const changes of [[], [change('M', 'unmapped.ts')], exclusions.map((p) => change('A', p))]) {
    const result = plan(map, changes);
    assert.equal(result.mode, 'noop');
    assert.equal(result.affected, 0);
    assert.deepEqual(result.blocks, []);
    assert.deepEqual(result.newAreaPaths, []);
    assert.match(result.reason, /provenance|no relevant/i);
    assert.deepEqual(map, original);
  }
});

test('renaming into/out of excluded directories retains only eligible endpoint impact', () => {
  const map = mapOf({ entry: '- `src/auth/file.ts`', areas: [['Auth', '- `src/auth/`']] });
  for (const item of [change('R100', 'dist/file.ts', 'src/auth/file.ts'), change('R100', 'src/auth/file.ts', 'dist/file.ts')]) {
    assert.deepEqual(plan(map, [item]).blocks, ['structure', 'entry-points', 'area:Auth']);
  }
});

test('git errors, unsupported paths, ambiguous refs and malformed records refuse rather than noop', () => {
  const map = mapOf();
  assert.equal(plan(map, [], { error: 'git diff failed' }).mode, 'refused');
  for (const path of ['src/bad\nfile.ts', 'src/bad`file.ts', 'src/a\u2028b.ts', '../outside.ts', 'src\\bad.ts', '/absolute.ts']) {
    const result = plan(map, [change('M', path)]);
    assert.equal(result.mode, 'refused', path);
    assert.match(result.reason, /unsupported|ambiguous|invalid/i);
  }
  for (const ref of ['src/*.ts', 'src/a?.ts', 'src/[ab].ts', 'src/a\u2028b.ts']) {
    const ambiguous = mapOf({ entry: `- \`${ref}\`` });
    assert.equal(ambiguous.state, 'built');
    const result = plan(ambiguous, [change('M', 'src/a.ts')]);
    assert.equal(result.mode, 'refused', ref);
    assert.match(result.reason, /reference/i);
  }
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
  assert.equal(plan(mapOf({ structure: '- `docs/`' }), diff.changes).mode, 'incremental');
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
