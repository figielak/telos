import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';
import { addHistory, deleteZoneEntries, readHistory } from '../lib/history.mjs';
import { render } from '../lib/template.mjs';

const ARCHIVE = '# History archive\n<!-- keep archive guidance -->\n\n## Log\n'
  + '- 2025-01-01 decision ADR 001: original archive entry\n\n## Notes\nKeep archive notes.\n';
const { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = fs;

function repo(t, { profile = 'standard', limit = 30, archive } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-history-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, '.telos'));
  writeFileSync(join(root, '.telos', 'config.json'), JSON.stringify({
    profile, limits: { history_entries: limit },
  }));
  writeFileSync(join(root, '.telos', 'HISTORY.md'), render('HISTORY.md', {
    date: '2026-01-01', profile,
  }) + '\n## Notes\nKeep these notes.\n');
  if (archive !== undefined) writeFileSync(join(root, '.telos', 'HISTORY-archive.md'), archive);
  return root;
}

const file = (root, name = 'HISTORY.md') => join(root, '.telos', name);
const text = (root, name) => readFileSync(file(root, name), 'utf8');
const entry = (over = {}) => ({ kind: 'decision', ref: '01-02', text: 'Keep the reason', ...over });
const zone = (s) => s.slice(s.indexOf('## Delete-zone'), s.indexOf('## Log'));
const snapshot = (root) => Object.fromEntries(readdirSync(join(root, '.telos')).sort()
  .map((name) => [name, readFileSync(file(root, name), 'utf8')]));

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

test('valid kinds and refs produce newest-first UTC entries and readers never write', async (t) => {
  const root = repo(t);
  const kinds = ['decision', 'phase', 'revert', 'remove', 'quick', 'profile', 'init'];
  const refs = ['01', '01-02', 'ADR 007', 'quick', 'telos'];
  const dates = [new Date().toISOString().slice(0, 10)];
  for (const [i, kind] of kinds.entries()) {
    const r = await telos(root, 'history', 'add', kind, refs[i % refs.length], `Reason ${i}: żółć`);
    assert.equal(r.code, 0, r.stderr);
  }
  dates.push(new Date().toISOString().slice(0, 10));
  const before = snapshot(root);
  const history = readHistory(root);
  assert.deepEqual(history.log.slice(0, -1).map((e) => e.kind), kinds.toReversed());
  assert.deepEqual(history.log.slice(0, -1).map((e) => e.ref),
    kinds.map((_, i) => refs[i % refs.length]).toReversed());
  assert.ok(history.log.slice(0, -1).every((e) => dates.includes(e.date)));
  assert.equal(history.log[0].text, 'Reason 6: żółć');
  assert.deepEqual(deleteZoneEntries(root), []);
  assert.deepEqual(snapshot(root), before);
});

test('CLI rejects invalid kinds, refs, text and selectors without any writes', async (t) => {
  const root = repo(t);
  const before = snapshot(root);
  const invalid = [
    ['add', 'bad', '01', 'reason'], ['add', 'decision', '1', 'reason'],
    ['add', 'decision', 'ADR 1', 'reason'], ['add', 'decision', '01', ''],
    ['add', 'decision', '01', 'first\nsecond'], ['add', 'decision', '01', 'first\rsecond'],
    ['add', 'decision', '01', 'hidden\u2028line'], ['add', 'decision', '01', '<!-- hidden -->'],
    ['add', 'decision', '01', 'reason', '--path', 'src/old'],
    ['add', 'remove', '01', 'reason', '--path', 'src/a', '--approach', 'cache'],
    ['add', 'remove', '01', 'reason', '--path', 'src/a', '--path', 'src/b'],
    ['add', 'remove', '01', 'reason', '--approach', ''],
    ['add', 'remove', '01', 'reason', '--approach', 'first\nsecond'],
    ['add', 'remove', '01', 'reason', '--approach', 'ambiguous — target'],
    ['add', 'remove', '01', 'reason', '--unknown'],
    ['add', 'remove', '01'], ['add', 'remove', '01', 'reason', 'extra'], ['list'],
  ];
  for (const args of invalid) {
    const r = await telos(root, 'history', ...args);
    assert.equal(r.code, 2, JSON.stringify({ args, r }));
    assert.ok(r.stderr.trim());
    assert.deepEqual(snapshot(root), before);
  }
});

test('API validates input before mutation too', (t) => {
  const root = repo(t);
  const before = snapshot(root);
  for (const invalid of [undefined, {}, entry({ kind: 'bad' }), entry({ ref: '01\n' }),
    entry({ text: 'bad\0text' }), entry({ kind: 'remove', path: '', approach: 'cache' })]) {
    assert.throws(() => addHistory(root, invalid));
    assert.deepEqual(snapshot(root), before);
  }
});

test('rotation retains the newest Log rows, all Delete-zone bytes, archive and unrelated sections', (t) => {
  const root = repo(t, { limit: 2, archive: ARCHIVE });
  addHistory(root, entry({ kind: 'remove', path: 'src/old', text: 'Obsolete (still useful — context)' }));
  const before = text(root);
  addHistory(root, entry({ text: 'second' }));
  addHistory(root, entry({ text: 'third' }));
  assert.deepEqual(readHistory(root).log.map((e) => e.text), ['third', 'second']);
  assert.equal(zone(text(root)), zone(before));
  assert.ok(text(root).endsWith('\n## Notes\nKeep these notes.\n'));
  const archived = text(root, 'HISTORY-archive.md');
  assert.match(archived, /remove 01-02: Obsolete \(still useful — context\)/);
  assert.match(archived, /init telos: initialized \(standard profile\)/);
  assert.equal(archived.replace(/^- 2026[^\n]*\n/gm, ''), ARCHIVE);
  assert.ok(archived.indexOf('remove 01-02') < archived.indexOf('init telos'));
});

test('the archive is created on demand and is accepted on subsequent rotations', (t) => {
  const root = repo(t, { limit: 1 });
  addHistory(root, entry({ text: 'first' }));
  addHistory(root, entry({ text: 'second' }));
  const archived = text(root, 'HISTORY-archive.md');
  assert.match(archived, /^# History archive\n/);
  assert.match(archived, /## Log\n/);
  assert.ok(archived.indexOf('first') < archived.indexOf('initialized'));
  assert.deepEqual(readHistory(root).log.map((e) => e.text), ['second']);
});

test('remove records normalized paths and exact approaches with reason, ref and date', (t) => {
  const root = repo(t);
  addHistory(root, entry({ kind: 'remove', path: './src//old/', text: 'Unneeded — keep this reason' }));
  addHistory(root, entry({ kind: 'remove', approach: 'global cache', ref: 'quick' }));
  const entries = deleteZoneEntries(root);
  assert.deepEqual(entries.map(({ date, ...rest }) => rest), [
    { approach: 'global cache', reason: 'Keep the reason', ref: 'quick' },
    { path: 'src/old', reason: 'Unneeded — keep this reason', ref: '01-02' },
  ]);
  assert.ok(entries.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)));
});

test('revert selects only the exact normalized target, never a shared ref or path prefix', (t) => {
  const root = repo(t);
  for (const path of ['src/a', 'src/ab']) addHistory(root, entry({ kind: 'remove', path }));
  for (const approach of ['global cache', 'global cache v2']) {
    addHistory(root, entry({ kind: 'remove', approach }));
  }
  addHistory(root, entry({ kind: 'revert', path: './src//a/', text: 'User requested it' }));
  assert.deepEqual(deleteZoneEntries(root).map((e) => e.path ?? e.approach),
    ['global cache v2', 'global cache', 'src/ab']);
  addHistory(root, entry({ kind: 'revert', approach: 'global cache' }));
  assert.deepEqual(deleteZoneEntries(root).map((e) => e.path ?? e.approach), ['global cache v2', 'src/ab']);
  assert.equal(readHistory(root).log[1].text, 'User requested it');
  assert.equal(readHistory(root).log[1].kind, 'revert');
});

test('revert without a selector, or with an absent target, only logs the reason', (t) => {
  const root = repo(t);
  addHistory(root, entry({ kind: 'remove', path: 'src/a' }));
  const before = zone(text(root));
  addHistory(root, entry({ kind: 'revert', text: 'Reverted task only' }));
  addHistory(root, entry({ kind: 'revert', path: 'src/missing' }));
  assert.equal(zone(text(root)), before);
  assert.equal(readHistory(root).log[1].text, 'Reverted task only');
});

test('clearing the last target restores the empty marker and preserves Delete-zone comments', (t) => {
  const root = repo(t);
  const original = zone(text(root));
  addHistory(root, entry({ kind: 'remove', path: 'src/only' }));
  addHistory(root, entry({ kind: 'revert', path: './src/only/' }));
  assert.deepEqual(deleteZoneEntries(root), []);
  assert.equal(zone(text(root)), original);
});

test('unsafe and outside-repository path selectors are refused without writes', async (t) => {
  const root = repo(t);
  const outside = mkdtempSync(join(tmpdir(), 'telos-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, join(root, 'linked'));
  fs.symlinkSync(join(outside, 'missing'), join(root, 'dangling'));
  const before = snapshot(root);
  for (const path of ['../outside', 'src/../../outside', 'src/../a', '/etc/passwd', root,
    'C:\\outside', 'C:/outside', '\\\\server\\share', '.', './', 'src/`bad`', 'src/a\nb',
    'src\\a', 'linked/file', 'dangling/file']) {
    const r = await telos(root, 'history', 'add', 'remove', '01', 'reason', '--path', path);
    assert.equal(r.code, 2, JSON.stringify({ path, r }));
    assert.deepEqual(snapshot(root), before);
  }
});

test('minimal refuses without mutation; deep supports the same writer', async (t) => {
  const minimal = repo(t, { profile: 'minimal' });
  const before = snapshot(minimal);
  const r = await telos(minimal, 'history', 'add', 'decision', '01', 'reason');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Requires standard profile/);
  assert.deepEqual(snapshot(minimal), before);
  assert.throws(() => readHistory(minimal), /Requires standard profile/);
  const deep = repo(t, { profile: 'deep' });
  assert.equal((await telos(deep, 'history', 'add', 'decision', '01', 'reason')).code, 0);
});

test('missing, malformed and unreadable HISTORY or archive fail before mutation', async (t) => {
  const variants = [
    ['HISTORY.md', null], ['HISTORY.md', '# History\n## Log\n- none\n'],
    ['HISTORY.md', '# History\n## Log\n- none\n## Delete-zone\n- none\n'],
    ['HISTORY.md', '# History\n## Delete-zone\n- none\n## Log\n- bad row\n'],
    ['HISTORY.md', '# History\n## Delete-zone\n- none\n## Log\n- 2026-02-30 init telos: invalid\n'],
    ['HISTORY.md', '# History\n## Delete-zone\n- `../outside` — bad (01, 2026-01-01)\n## Log\n'],
    ['HISTORY.md', '# History\n## Delete-zone\n- none\n## Log\n## Log\n'],
    ['HISTORY.md', '# History\n## Delete-zone\n- none\n## Log\n<!-- unclosed\n'],
    ['HISTORY-archive.md', 'broken'],
    ['HISTORY-archive.md', '# History archive\n## Log\n- invalid\n'],
  ];
  for (const [name, content] of variants) {
    const root = repo(t);
    if (content === null) rmSync(file(root, name));
    else writeFileSync(file(root, name), content);
    const before = snapshot(root);
    const r = await telos(root, 'history', 'add', 'decision', '01', 'reason');
    assert.equal(r.code, 1, JSON.stringify({ name, content, r }));
    assert.match(r.stderr, /HISTORY/);
    assert.deepEqual(snapshot(root), before);
  }
  const root = repo(t, { archive: ARCHIVE });
  const before = snapshot(root);
  const original = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (path, ...args) => {
    if (path === file(root, 'HISTORY-archive.md')) throw new Error('injected unreadable archive');
    return original(path, ...args);
  });
  const r = await telos(root, 'history', 'add', 'decision', '01', 'reason');
  assert.equal(r.code, 1);
  t.mock.restoreAll();
  assert.deepEqual(snapshot(root), before);
});

test('storage symlinks and non-files are refused without changing their targets', async (t) => {
  for (const name of ['HISTORY.md', 'HISTORY-archive.md']) {
    const root = repo(t);
    const target = join(root, 'outside.md');
    writeFileSync(target, text(root));
    rmSync(file(root, name), { force: true });
    fs.symlinkSync(target, file(root, name));
    const before = snapshot(root);
    assert.equal((await telos(root, 'history', 'add', 'decision', '01', 'reason')).code, 1);
    assert.deepEqual(snapshot(root), before);
    assert.equal(readFileSync(target, 'utf8'), before[name]);
    rmSync(file(root, name));
    mkdirSync(file(root, name));
    assert.equal((await telos(root, 'history', 'add', 'decision', '01', 'reason')).code, 1);
  }
});

test('staged write failures and either rename failure keep every original entry recoverable', async (t) => {
  for (const method of ['writeFileSync', 'renameSync']) {
    for (const failAt of [1, 2]) {
      const root = repo(t, { limit: 1, archive: ARCHIVE });
      writeFileSync(file(root), text(root).replace('- none', '- `src/kept` — previous removal (01-01, 2025-01-01)'));
      const before = snapshot(root);
      const original = fs[method];
      let calls = 0;
      t.mock.method(fs, method, (...args) => {
        if (++calls === failAt) throw new Error(`injected ${method} failure ${failAt}`);
        return original(...args);
      });
      const r = await telos(root, 'history', 'add', 'remove', '01', 'remove reason', '--path', 'src/a');
      t.mock.restoreAll();
      assert.equal(r.code, 1, JSON.stringify({ method, failAt, r }));
      assert.match(r.stderr, /injected/);
      assert.equal(text(root), before['HISTORY.md']);
      const archived = text(root, 'HISTORY-archive.md');
      assert.match(archived, /original archive entry/);
      assert.equal(archived.replace(/^- 2026[^\n]*\n/gm, ''), ARCHIVE);
      assert.deepEqual(readdirSync(join(root, '.telos')).sort(), Object.keys(before));
      if (method === 'renameSync' && failAt === 2) {
        assert.match(archived, /initialized \(standard profile\)/);
        addHistory(root, entry({ text: 'retry' }));
        assert.equal(readHistory(root).log[0].text, 'retry');
        assert.match(text(root, 'HISTORY-archive.md'), /original archive entry/);
      } else assert.equal(archived, before['HISTORY-archive.md']);
    }
  }
});

test('CRLF, comments between rows and unrelated sections retain their original bytes', (t) => {
  const root = repo(t, { limit: 1 });
  const source = text(root).replace('- 2026-01-01 init', '<!-- keep this log note -->\n- 2026-01-01 init')
    .replace(/\n/g, '\r\n');
  writeFileSync(file(root), source);
  addHistory(root, entry());
  assert.equal(zone(text(root)), zone(source));
  assert.match(text(root), /<!-- keep this log note -->\r\n/);
  assert.ok(text(root).endsWith('\r\n## Notes\r\nKeep these notes.\r\n'));
  assert.doesNotMatch(text(root), /(?<!\r)\n/);
  assert.equal(readHistory(root).log.length, 1);
});

test('a symlinked .telos directory is refused before storage writes', async (t) => {
  const root = repo(t);
  const moved = join(root, 'other-storage');
  fs.renameSync(join(root, '.telos'), moved);
  fs.symlinkSync(moved, join(root, '.telos'));
  const before = snapshot(root);
  const r = await telos(root, 'history', 'add', 'decision', '01', 'reason');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /regular .telos directory/);
  assert.deepEqual(snapshot(root), before);
});

test('a single-file write failure leaves live history unchanged and removes staging files', async (t) => {
  const root = repo(t);
  const before = snapshot(root);
  t.mock.method(fs, 'writeFileSync', () => { throw new Error('injected single-file failure'); });
  const r = await telos(root, 'history', 'add', 'decision', '01', 'reason');
  t.mock.restoreAll();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /injected single-file failure/);
  assert.deepEqual(snapshot(root), before);
});

test('sync failures before replacement leave originals intact; an archive sync failure remains recoverable', async (t) => {
  for (const failAt of [1, 2, 3]) {
    const root = repo(t, { limit: 1, archive: ARCHIVE });
    const before = snapshot(root);
    const original = fs.fsyncSync;
    let calls = 0;
    t.mock.method(fs, 'fsyncSync', (...args) => {
      if (++calls === failAt) throw new Error('injected sync failure');
      return original(...args);
    });
    const r = await telos(root, 'history', 'add', 'decision', '01', 'reason');
    t.mock.restoreAll();
    assert.equal(r.code, 1);
    assert.match(r.stderr, /injected sync failure/);
    assert.equal(text(root), before['HISTORY.md']);
    assert.match(text(root, 'HISTORY-archive.md'), /original archive entry/);
    assert.deepEqual(readdirSync(join(root, '.telos')).sort(), Object.keys(before));
  }
});

test('history help and missing initialization follow the CLI contract', async (t) => {
  const root = repo(t);
  const help = await telos(root, 'history', '--help');
  assert.equal(help.code, 0);
  assert.match(help.stdout, /history add/);
  assert.match(help.stdout, /--path/);
  rmSync(join(root, '.telos'), { recursive: true });
  const r = await telos(root, 'history', 'add', 'decision', '01', 'reason');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /not initialized/);
});
