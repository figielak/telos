import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';
import { scanDocs, renderDocsScan, DOCS_SCAN_LIMITS } from '../lib/docs-scan.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
function put(root, path, text) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
}
function fixture(t, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  put(root, '.telos/config.json', JSON.stringify({ profile: 'deep' }));
  put(root, '.telos/STATUS.md', 'Phase: 05-deep\nTask: none\nNext: none\n');
  put(root, 'README.md', '# Example\n');
  for (const [path, text] of Object.entries(files)) put(root, path, text);
  git(root, 'add', '--', '.telos/config.json', '.telos/STATUS.md', 'README.md', ...Object.keys(files));
  git(root, 'commit', '-qm', 'baseline');
  git(root, 'tag', 'telos/05-start');
  return root;
}
async function cli(root, ...args) {
  let out = '', err = '';
  const code = await main(['docs-scan', ...args], { cwd: root,
    stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } } });
  return { code, out, err };
}

test('changed paths and simple JS/TS/Python public symbols identify only configured doc candidates', (t) => {
  const root = fixture(t, {
    'src/api.ts': 'export function fetchItem() {}\n',
    'src/app.py': 'def old_api():\n    pass\n',
    'docs/guide.md': '# Guide\n`src/api.ts` uses fetchItem.\nfetchItemExtra is unrelated.\n\nold_api is public.\n',
    'docs/unrelated.md': 'No matching reference here.\n',
    'elsewhere.md': 'fetchItem\n',
  });
  put(root, 'src/api.ts', 'export async function fetchItem() {}\nexport { fetchItem as loadItem };\nexport type Item = string;\n');
  put(root, 'src/app.py', 'def new_api():\n    pass\ndef _private():\n    pass\nclass Store:\n    pass\n');
  put(root, 'README.md', '# Example\nloadItem and Item\nnew_api and Store\n_private\n');
  const before = git(root, 'status', '--porcelain=v1');
  const index = readFileSync(join(root, '.git/index'));
  const head = git(root, 'rev-parse', 'HEAD');
  const scan = scanDocs(root);
  assert.equal(scan.baseline, 'telos/05-start');
  assert.deepEqual(scan.changed, ['README.md', 'src/api.ts', 'src/app.py']);
  for (const symbol of ['fetchItem', 'loadItem', 'Item', 'old_api', 'new_api', 'Store']) {
    assert.ok(scan.symbols.some((s) => s.name === symbol), symbol);
  }
  assert.ok(!scan.symbols.some((s) => s.name === '_private'));
  assert.deepEqual(scan.matches.map(({ path, start, end }) => ({ path, start, end })), [
    { path: 'README.md', start: 2, end: 3 },
    { path: 'docs/guide.md', start: 2, end: 2 },
    { path: 'docs/guide.md', start: 5, end: 5 },
  ]);
  assert.equal(scan.matches.filter((m) => m.path === 'docs/guide.md' && m.start === 2).length, 1);
  assert.ok(scan.matches.find((m) => m.path === 'docs/guide.md').reasons.length >= 2);
  assert.match(renderDocsScan(scan), /heuristic|candidate/i);
  assert.match(renderDocsScan(scan), /semantic/i);
  assert.equal(git(root, 'status', '--porcelain=v1'), before);
  assert.deepEqual(readFileSync(join(root, '.git/index')), index);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
});

test('committed rename and uncommitted deletion retain old paths and removed exports', (t) => {
  const root = fixture(t, {
    'src/old.js': 'export const removedAPI = 1;\n',
    'src/deleted.py': 'def deleted_api():\n    pass\n',
    'docs/old.md': 'src/old.js\nremovedAPI\nsrc/deleted.py\ndeleted_api\n',
  });
  renameSync(join(root, 'src/old.js'), join(root, 'src/new.js'));
  git(root, 'add', '--', 'src/old.js', 'src/new.js');
  git(root, 'commit', '-qm', 'rename');
  put(root, 'src/new.js', 'export const replacementAPI = 2;\n');
  rmSync(join(root, 'src/deleted.py'));
  const scan = scanDocs(root);
  assert.ok(scan.changed.includes('src/old.js'));
  assert.ok(scan.changed.includes('src/new.js'));
  assert.ok(scan.symbols.some((s) => s.name === 'removedAPI'));
  assert.ok(scan.symbols.some((s) => s.name === 'deleted_api'));
  assert.deepEqual(scan.matches.map((m) => [m.path, m.start, m.end]), [['docs/old.md', 1, 4]]);
  const scoped = scanDocs(root, { scopes: ['src/new.js'] });
  assert.ok(scoped.changed.includes('src/old.js'));
  assert.ok(scoped.symbols.some((s) => s.name === 'removedAPI'));
});

test('literal scopes include staged, unstaged and untracked source and respect path boundaries', (t) => {
  const root = fixture(t, { 'src/a.js': 'export const baselineAPI = 0;\n', 'src/ab/file.js': 'export const nope = 0;\n' });
  put(root, 'src/a.js', 'export const stagedAPI = 1;\n');
  git(root, 'add', '--', 'src/a.js');
  put(root, 'src/a.js', 'export const unstagedAPI = 2;\n');
  put(root, 'src/a/new.js', 'export const untrackedAPI = 3;\n');
  put(root, 'src/ab/file.js', 'export const nope = 1;\n');
  put(root, 'README.md', 'stagedAPI\nunstagedAPI\nuntrackedAPI\nnope\n');
  const scan = scanDocs(root, { scopes: ['src/a.js', 'src/a/'] });
  assert.deepEqual(scan.changed, ['src/a.js', 'src/a/new.js']);
  for (const symbol of ['stagedAPI', 'unstagedAPI', 'untrackedAPI']) assert.ok(scan.symbols.some((s) => s.name === symbol));
  assert.ok(!scan.symbols.some((s) => s.name === 'nope'));
  assert.deepEqual(scan.matches.map((m) => [m.start, m.end]), [[1, 3]]);
  assert.deepEqual(scanDocs(root, { scopes: ['missing'] }).matches, []);
});

test('CLI defaults to STATUS, supports repeated scope, rejects usage and missing baselines', async (t) => {
  const root = fixture(t);
  assert.equal((await cli(root)).code, 0);
  assert.equal((await cli(root, '05', '--scope', 'src', '--scope', 'lib')).code, 0);
  for (const args of [['5'], ['05', '06'], ['--scope'], ['--unknown'], ['--scope', '../outside'],
    ['--scope', '/tmp'], ['--scope', 'src/../lib'], ['--scope', 'src\\a'], ['--scope', 'src:*']]) {
    assert.equal((await cli(root, ...args)).code, 2, args.join(' '));
  }
  const missing = await cli(root, '06');
  assert.equal(missing.code, 1);
  assert.match(missing.err, /telos\/06-start/);
  assert.match(missing.err, /restore|approve/i);
  put(root, '.telos/STATUS.md', 'Phase: none\n');
  assert.equal((await cli(root)).code, 1);
  for (const profile of ['minimal', 'standard']) {
    put(root, '.telos/config.json', JSON.stringify({ profile }));
    const result = await cli(root, '05');
    assert.equal(result.code, 1);
    assert.equal(result.err.trim(), 'Requires deep profile. Switch with /telos:profile deep.');
  }
});

test('configured traversal, external paths, source/doc symlinks and vendor/generated trees are visibly skipped', (t) => {
  const root = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), 'telos-docs-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  put(outside, 'secret.md', 'outsideSecretAPI\n');
  put(root, '.telos/config.json', JSON.stringify({ profile: 'deep', docs: {
    readme: '../secret.md', paths: [outside, 'docs', 'doc-link', 'vendor', 'dist'] } }));
  symlinkSync(outside, join(root, 'doc-link'));
  symlinkSync(join(outside, 'secret.md'), join(root, 'source.js'));
  mkdirSync(join(root, 'docs'));
  symlinkSync(join(outside, 'secret.md'), join(root, 'docs/leak.md'));
  put(root, 'vendor/source.js', 'export const vendorAPI = 1;\n');
  put(root, 'dist/built.js', 'export const builtAPI = 1;\n');
  const scan = scanDocs(root);
  assert.deepEqual(scan.matches, []);
  assert.ok(!scan.symbols.some((s) => /Secret|vendor|built/.test(s.name)));
  const omissions = JSON.stringify(scan.omissions);
  for (const word of ['../secret.md', outside, 'doc-link', 'source.js', 'docs/leak.md', 'vendor', 'dist']) assert.ok(omissions.includes(word), word);
  assert.match(omissions, /symlink/i);
  assert.throws(() => scanDocs(root, { scopes: ['doc-link'] }), /scope|symlink/i);
});

test('binary, oversized and unsupported sources/docs produce explicit omissions', (t) => {
  const root = fixture(t);
  put(root, 'src/binary.js', Buffer.from([0, 1, 2]));
  put(root, 'src/large.js', 'x'.repeat(DOCS_SCAN_LIMITS.fileBytes + 1));
  put(root, 'src/unsupported.rs', 'pub fn unsupportedAPI() {}\n');
  put(root, 'docs/binary.md', Buffer.from([0, 1, 2]));
  put(root, 'docs/large.md', 'x'.repeat(DOCS_SCAN_LIMITS.fileBytes + 1));
  const scan = scanDocs(root);
  const omissions = JSON.stringify(scan.omissions);
  for (const word of ['binary', 'large', 'unsupported']) assert.match(omissions, new RegExp(word));
  assert.deepEqual(scan.symbols, []);
  assert.match(renderDocsScan(scan), /incomplete|omission/i);
  assert.ok(renderDocsScan(scan).length <= 6000);
});

test('candidate and report limits retain visible incompleteness, including renderer overflow', (t) => {
  const root = fixture(t);
  put(root, 'src/api.js', Array.from({ length: DOCS_SCAN_LIMITS.symbols + 5 }, (_, i) => `export const symbol${i} = 1;`).join('\n'));
  put(root, 'docs/many.md', Array.from({ length: DOCS_SCAN_LIMITS.matches + 5 }, (_, i) => `symbol0 ${'x'.repeat(50)}\n`).join('\n'));
  const scan = scanDocs(root);
  assert.ok(scan.symbols.length <= DOCS_SCAN_LIMITS.symbols);
  assert.ok(scan.matches.length <= DOCS_SCAN_LIMITS.matches);
  assert.match(JSON.stringify(scan.omissions), /symbol.*limit/i);
  assert.match(JSON.stringify(scan.omissions), /match.*limit/i);
  const expanded = { ...scan, changed: Array.from({ length: 500 }, (_, i) => `src/${i}-${'long'.repeat(50)}.js`) };
  const output = renderDocsScan(expanded);
  assert.ok(output.length <= 6000);
  assert.match(output, /report.*omitted|omitted.*report/i);
  assert.match(output, /semantic/i);
});

test('file and traversal budgets are visible and deterministic', (t) => {
  const root = fixture(t);
  for (let i = 0; i <= DOCS_SCAN_LIMITS.documents; i++) put(root, `docs/${String(i).padStart(4, '0')}.md`, 'nothing\n');
  const scan = scanDocs(root);
  assert.match(JSON.stringify(scan.omissions), /document.*limit/i);
  assert.equal(renderDocsScan(scanDocs(root)), renderDocsScan(scan));
  assert.equal(readFileSync(join(root, 'README.md'), 'utf8'), '# Example\n');
});

test('literal metacharacter paths and shell-looking names are matched without expansion or execution', (t) => {
  const root = fixture(t);
  const path = 'src/[id] $(touch MARKER).ts';
  put(root, path, 'export const literalAPI = 1;\n');
  put(root, 'README.md', `Use ./${path}\n`);
  const scan = scanDocs(root, { scopes: [path] });
  assert.deepEqual(scan.changed, [path]);
  assert.deepEqual(scan.matches.map((m) => [m.path, m.start]), [['README.md', 1]]);
  assert.match(scan.matches[0].reasons.join(' '), /path:/);
  assert.ok(!git(root, 'status', '--porcelain=v1').includes('?? MARKER'));
});

test('before evidence reports binary and oversized source omissions after deletion', (t) => {
  const root = fixture(t, {
    'src/old-binary.js': Buffer.from([0, 1, 2]),
    'src/old-large.js': 'x'.repeat(DOCS_SCAN_LIMITS.fileBytes + 1),
  });
  rmSync(join(root, 'src/old-binary.js'));
  rmSync(join(root, 'src/old-large.js'));
  const scan = scanDocs(root);
  assert.ok(scan.omissions.some((o) => o.path === 'src/old-binary.js' && /binary/.test(o.reason)));
  assert.ok(scan.omissions.some((o) => o.path === 'src/old-large.js' && /byte limit/.test(o.reason)));
});

test('total input and changed-path limits are explicit', (t) => {
  const root = fixture(t);
  put(root, 'src/api.js', 'export const boundedAPI = 1;\n');
  for (let i = 0; i < 70; i++) put(root, `docs/${String(i).padStart(3, '0')}.md`, 'x'.repeat(DOCS_SCAN_LIMITS.fileBytes));
  let scan = scanDocs(root);
  assert.ok(scan.omissions.some((o) => /total byte limit/.test(o.reason)));
  rmSync(join(root, 'docs'), { recursive: true });
  for (let i = 0; i < DOCS_SCAN_LIMITS.changes + 5; i++) put(root, `data/${i}.json`, '{}\n');
  scan = scanDocs(root);
  assert.ok(scan.changed.length <= DOCS_SCAN_LIMITS.changes);
  assert.ok(scan.omissions.some((o) => /changed path limit/.test(o.reason)));
  assert.ok(scan.omissions.some((o) => /additional omissions/.test(o.reason)));
});

test('deep document traversal and internal source symlinks are skipped explicitly', (t) => {
  const root = fixture(t);
  put(root, `docs/${'nested/'.repeat(DOCS_SCAN_LIMITS.depth + 1)}guide.md`, 'internalAPI\n');
  put(root, 'src/real.js', 'export const internalAPI = 1;\n');
  symlinkSync('real.js', join(root, 'src/link.js'));
  const scan = scanDocs(root);
  assert.ok(scan.omissions.some((o) => /traversal.*limit/.test(o.reason)));
  assert.ok(scan.omissions.some((o) => o.path === 'src/link.js' && /symlink/.test(o.reason)));
  assert.ok(!scan.symbols.some((s) => s.path === 'src/link.js'));
});

test('directory enumeration is bounded with a visible whole-directory omission', (t) => {
  const root = fixture(t);
  for (let i = 0; i <= DOCS_SCAN_LIMITS.entries; i++) put(root, `docs/${i}.md`, 'nothing\n');
  const scan = scanDocs(root);
  assert.ok(scan.omissions.some((o) => o.path === 'docs' && /traversal entry limit/.test(o.reason)));
});

test('git-configured monitors, diff drivers, textconv and clean filters never execute', (t) => {
  const root = fixture(t, { 'src/api.js': 'export const oldAPI = 1;\n' });
  put(root, 'trap.sh', '#!/bin/sh\ntouch "$(dirname "$0")/EXECUTED"\ncat\n');
  chmodSync(join(root, 'trap.sh'), 0o755);
  for (const key of ['core.fsmonitor', 'diff.external', 'diff.trap.textconv', 'filter.trap.clean']) git(root, 'config', key, join(root, 'trap.sh'));
  put(root, '.gitattributes', '*.js diff=trap filter=trap\n');
  put(root, 'src/api.js', 'export const newAPI = 2;\n');
  const scan = scanDocs(root);
  assert.ok(scan.symbols.some((s) => s.name === 'newAPI'));
  assert.ok(!existsSync(join(root, 'EXECUTED')));
  git(root, 'config', 'filter.trap.process', join(root, 'trap.sh'));
  assert.ok(scanDocs(root).symbols.some((s) => s.name === 'newAPI'));
  assert.ok(!existsSync(join(root, 'EXECUTED')));
});

test('submodule work trees are omitted without invoking their configured programs', (t) => {
  const root = fixture(t);
  const nested = fixture(t, { 'src/api.js': 'export const nestedAPI = 1;\n' });
  const hash = git(nested, 'rev-parse', 'HEAD');
  mkdirSync(join(root, 'modules'));
  renameSync(nested, join(root, 'modules/dep'));
  put(root, 'modules/dep/trap.sh', `#!/bin/sh\ntouch '${join(root, 'EXECUTED')}'\ncat\n`);
  chmodSync(join(root, 'modules/dep/trap.sh'), 0o755);
  git(root, 'update-index', '--add', '--cacheinfo', `160000,${hash},modules/dep`);
  git(join(root, 'modules/dep'), 'config', 'core.fsmonitor', join(root, 'modules/dep/trap.sh'));
  put(root, 'modules/dep/src/api.js', 'export const nestedAPI = 2;\n');
  const scan = scanDocs(root);
  assert.ok(scan.omissions.some((o) => o.path === 'modules/dep' && /submodule/.test(o.reason)));
  assert.ok(!existsSync(join(root, 'EXECUTED')));
  assert.ok(!scan.symbols.some((s) => s.name === 'nestedAPI'));
});
