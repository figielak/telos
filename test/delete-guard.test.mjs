import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { addHistory, deleteZoneEntries } from '../lib/history.mjs';
import { render } from '../lib/template.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const HOOK = fileURLToPath(new URL('../hooks/edit-guard.mjs', import.meta.url));
const BIN = fileURLToPath(new URL('../bin/', import.meta.url));
const TASK = '.telos/phases/01-demo/01-02-second-task.md';
const { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } = fs;
const cache = (root) => join(root, '.telos/.cache');

function repo(t, { profile = 'standard', strict = false, active = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-delete-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(FIXTURE, root, { recursive: true });
  mkdirSync(join(root, '.git'));
  const config = join(root, '.telos/config.json');
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), profile, strict_scope: strict }));
  if (active) {
    const path = join(root, TASK);
    writeFileSync(path, readFileSync(path, 'utf8').replace('status: approved', 'status: in-progress'));
  }
  writeFileSync(join(root, '.telos/HISTORY.md'), render('HISTORY.md', { profile, date: '2026-01-01' }));
  return root;
}

const remove = (root, path, ref = '04-01') => addHistory(root, { kind: 'remove', ref, text: 'Replaced by the new implementation', path });
const approach = (root) => addHistory(root, { kind: 'remove', ref: '04-01', text: 'Avoid the old design', approach: 'Global mutable cache' });

function hook(root, path, { sessionId = 'session-1', tool = 'Edit', cwd = root } = {}) {
  const result = spawnSync(process.execPath, [HOOK], { encoding: 'utf8', timeout: 10000, input: JSON.stringify({
    cwd, tool_name: tool, session_id: sessionId,
    tool_input: { [tool === 'NotebookEdit' ? 'notebook_path' : 'file_path']: path },
  }) });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr,
    context: result.stdout ? JSON.parse(result.stdout).hookSpecificOutput.additionalContext : '' };
}

function warned(result) {
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.context, /delete-zone/i);
  return result.context;
}

function silent(result) {
  assert.deepEqual([result.code, result.stdout, result.stderr], [0, '', '']);
}

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  assert.equal(code, 0, err.text);
  return out.text;
}

test('exact paths and descendants warn with reason, ref and the exact deleted root to revert', (t) => {
  const root = repo(t);
  remove(root, 'src/a');
  approach(root);
  const before = readFileSync(join(root, '.telos/HISTORY.md'), 'utf8');
  for (const [path, tool] of [['src/a', 'Edit'], ['src/a/new.ts', 'Write'],
    ['src/a/other.ts', 'MultiEdit'], ['src/a/new.ipynb', 'NotebookEdit']]) {
    const context = warned(hook(root, path, { tool }));
    assert.match(context, /Replaced by the new implementation/);
    assert.match(context, /04-01/);
    assert.match(context, /If the user asked for this, proceed and remove the entry/);
    assert.match(context, /telos history add revert .*--path 'src\/a'/);
  }
  silent(hook(root, 'src/ab/new.ts'));
  silent(hook(root, 'src/Global mutable cache'));
  assert.equal(readFileSync(join(root, '.telos/HISTORY.md'), 'utf8'), before);
});

test('canonical lexical paths share one session marker; other paths and sessions warn independently', (t) => {
  const root = repo(t);
  remove(root, 'src/a');
  warned(hook(root, 'src/a/new.ts'));
  silent(hook(root, './src/a/./new.ts', { tool: 'Write' }));
  silent(hook(root, join(root, 'src/a/new.ts')));
  mkdirSync(join(root, 'src/sub'), { recursive: true });
  silent(hook(root, '../a/new.ts', { cwd: join(root, 'src/sub') }));
  warned(hook(root, 'src/a/other.ts'));
  warned(hook(root, 'src/a/new.ts', { sessionId: 'session-2' }));
  silent(hook(root, 'src/a/new.ts', { sessionId: 'session-2' }));
  assert.equal(readdirSync(cache(root)).length, 3);
});

test('symlink aliases match and deduplicate using the existing edit path normalizer', (t) => {
  const root = repo(t);
  mkdirSync(join(root, 'src/a'), { recursive: true });
  symlinkSync(join(root, 'src/a'), join(root, 'src/alias'));
  remove(root, 'src/a');
  warned(hook(root, 'src/alias/new.ts'));
  silent(hook(root, 'src/a/new.ts'));
  silent(hook(root, 'src/alias/../a/new.ts'));
  assert.equal(readdirSync(cache(root)).length, 1);
});

test('an entry recorded through a symlink also matches the physical target', (t) => {
  const root = repo(t);
  mkdirSync(join(root, 'src/a'), { recursive: true });
  symlinkSync(join(root, 'src/a'), join(root, 'src/alias'));
  remove(root, 'src/alias');
  assert.match(warned(hook(root, 'src/a/new.ts')), /--path 'src\/alias'/);
});

test('the suggested shell command safely reverts only its exact selector, preserving approaches in plan/quick', async (t) => {
  const root = repo(t);
  const path = "src/a '$(touch should-not-exist)'";
  remove(root, path, 'ADR 007');
  remove(root, 'src/ab', 'ADR 007');
  approach(root);
  await telos(root, 'history', 'add', 'revert', 'ADR 007', 'Log only');
  await telos(root, 'history', 'add', 'revert', 'ADR 007', 'Only the child', '--path', `${path}/child`);
  const context = warned(hook(root, `${path}/new.ts`));
  const command = /`(telos history add revert [^`]+)`/.exec(context)?.[1];
  assert.ok(command, context);
  const result = spawnSync('sh', ['-c', command], { cwd: root, encoding: 'utf8',
    env: { ...process.env, PATH: `${BIN}:${process.env.PATH}` } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(join(root, 'should-not-exist')), false);
  assert.deepEqual(deleteZoneEntries(root).filter((e) => e.path).map((e) => e.path), ['src/ab']);
  silent(hook(root, `${path}/new.ts`, { sessionId: 'after-revert' }));
  warned(hook(root, 'src/ab/new.ts'));
  for (const bundle of ['plan', 'quick']) {
    assert.match(await telos(root, 'ctx', bundle), /Global mutable cache/);
  }
  await telos(root, 'history', 'add', 'revert', '04-01', 'Restore the approach', '--approach', 'Global mutable cache');
  for (const bundle of ['plan', 'quick']) {
    assert.doesNotMatch(await telos(root, 'ctx', bundle), /Global mutable cache/);
  }
  assert.equal(deleteZoneEntries(root)[0].path, 'src/ab');
});

test('a normalized root revert clears descendant warnings and leaves sibling entries intact', async (t) => {
  const root = repo(t);
  remove(root, 'src/a');
  remove(root, 'src/ab');
  warned(hook(root, 'src/a/new.ts'));
  await telos(root, 'history', 'add', 'revert', '04-01', 'Restore a', '--path', './src//a/');
  silent(hook(root, 'src/a/new.ts', { sessionId: 'new-session' }));
  silent(hook(root, 'src/a/other.ts'));
  warned(hook(root, 'src/ab/new.ts'));
});

test('strict_scope does not block deletion warnings inside scope or in .telos/', (t) => {
  const root = repo(t, { strict: true });
  remove(root, 'src/a');
  remove(root, '.telos/removed');
  warned(hook(root, 'src/a/new.ts'));
  warned(hook(root, '.telos/removed/new.md'));
});

test('deletion warnings apply without an in-progress task in both standard and deep', (t) => {
  for (const profile of ['standard', 'deep']) {
    const root = repo(t, { profile, active: false, strict: true });
    remove(root, 'docs/old');
    warned(hook(root, 'docs/old/new.md'));
    const status = join(root, '.telos/STATUS.md');
    writeFileSync(status, readFileSync(status, 'utf8').replace('Task: 01-02', 'Task: none'));
    warned(hook(root, 'docs/old/other.md'));
  }
});

test('scope and deletion warnings compose; repeating an edit keeps the scope warning', (t) => {
  const root = repo(t);
  remove(root, 'docs/old');
  const first = warned(hook(root, 'docs/old/new.md'));
  assert.match(first, /outside the scope of 01-02/);
  assert.match(first, /Deviations:/);
  const next = hook(root, 'docs/old/new.md');
  assert.equal(next.code, 0);
  assert.match(next.context, /outside the scope of 01-02/);
  assert.doesNotMatch(next.context, /delete-zone/i);
});

test('config, scope and invalid-state denials take precedence and do not consume warning markers', (t) => {
  for (const [path, invalid, reason] of [
    ['src/tsconfig.json', null, /protected config/],
    ['docs/old/new.md', null, /strict_scope/],
    ['src/a', '.telos/config.json', /config\.json/],
    ['src/a', TASK, /task 01-02/],
  ]) {
    const root = repo(t, { strict: true });
    remove(root, path);
    const saved = invalid && readFileSync(join(root, invalid), 'utf8');
    if (invalid) writeFileSync(join(root, invalid), invalid === TASK ? '---\nid: 01-02\nstatus: [broken\n---\n' : 'broken');
    const result = hook(root, path);
    assert.equal(result.code, 2, `${path}: ${invalid ?? reason}`);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, reason);
    if (invalid) writeFileSync(join(root, invalid), saved);
    const config = join(root, '.telos/config.json');
    writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), protected_configs: [], strict_scope: false }));
    warned(hook(root, path));
  }
});

test('missing or invalid session identities warn every time without persistent markers', (t) => {
  const root = repo(t);
  remove(root, 'src/a');
  for (const sessionId of [null, '', 0, {}, []]) {
    warned(hook(root, 'src/a/new.ts', { sessionId }));
    warned(hook(root, 'src/a/new.ts', { sessionId }));
  }
  assert.equal(fs.existsSync(cache(root)), false);
});

test('hostile session identities are hashed into markers only inside .telos/.cache/', (t) => {
  const root = repo(t);
  remove(root, 'src/a');
  const before = readdirSync(join(root, '.telos')).sort();
  for (const sessionId of ['../../../../escaped', '/tmp/telos-escape', 'x/../y', 'x\\..\\y', '\0\n☃', 'x'.repeat(10000)]) {
    warned(hook(root, 'src/a/new.ts', { sessionId }));
    silent(hook(root, 'src/a/new.ts', { sessionId }));
  }
  const markers = readdirSync(cache(root));
  assert.equal(markers.length, 6);
  for (const marker of markers) assert.match(marker, /^delete-guard-[a-f0-9]{64}$/);
  assert.deepEqual(readdirSync(join(root, '.telos')).filter((p) => p !== '.cache').sort(), before);
});

test('a missing cache is created lazily; corrupt cache directories or markers still warn', (t) => {
  const root = repo(t);
  remove(root, 'src/a');
  silent(hook(root, 'src/other.ts'));
  assert.equal(fs.existsSync(cache(root)), false);
  warned(hook(root, 'src/a/new.ts'));
  const marker = join(cache(root), readdirSync(cache(root))[0]);
  writeFileSync(marker, 'corrupt');
  warned(hook(root, 'src/a/new.ts'));
  rmSync(cache(root), { recursive: true });
  writeFileSync(cache(root), 'not a directory');
  warned(hook(root, 'src/a/new.ts'));
  warned(hook(root, 'src/a/new.ts'));
});

test('cache and marker symlinks cannot suppress warnings or write outside the cache', (t) => {
  const root = repo(t);
  remove(root, 'src/a');
  const outside = join(root, 'outside');
  mkdirSync(outside);
  symlinkSync(outside, cache(root));
  warned(hook(root, 'src/a/new.ts'));
  assert.deepEqual(readdirSync(outside), []);
  rmSync(cache(root));
  warned(hook(root, 'src/a/new.ts'));
  const marker = join(cache(root), readdirSync(cache(root))[0]);
  const content = readFileSync(marker, 'utf8');
  const target = join(outside, 'marker');
  writeFileSync(target, content);
  rmSync(marker);
  symlinkSync(target, marker);
  warned(hook(root, 'src/a/new.ts'));
  assert.equal(readFileSync(target, 'utf8'), content);
});

test('deleteGuard returns an optional warning and unavailable storage never throws', async (t) => {
  const { deleteGuard } = await import('../lib/delete-guard.mjs');
  const root = repo(t);
  remove(root, 'src/a');
  assert.equal(deleteGuard(root, { path: 'src/ab', sessionId: 'api' }), undefined);
  assert.match(deleteGuard(root, { path: 'src/a/new.ts', sessionId: 'api' }), /delete-zone/i);
  assert.equal(deleteGuard(root, { path: './src/a/new.ts', sessionId: 'api' }), undefined);
  for (const sessionId of [undefined, null]) {
    assert.match(deleteGuard(root, { path: 'src/a/new.ts', sessionId }), /delete-zone/i);
  }
  t.mock.method(fs, 'writeFileSync', () => { throw Object.assign(new Error('unwritable cache'), { code: 'EACCES' }); });
  assert.match(deleteGuard(root, { path: 'src/a/other.ts', sessionId: 'api' }), /delete-zone/i);
  assert.match(deleteGuard(root, { path: 'src/a/other.ts', sessionId: 'api' }), /delete-zone/i);
  t.mock.restoreAll();
  writeFileSync(join(root, '.telos/HISTORY.md'), 'corrupt');
  assert.equal(deleteGuard(root, { path: 'src/a/other.ts', sessionId: 'api' }), undefined);
});

test('minimal, non-edit tools and missing history or .telos/ remain silent', (t) => {
  const root = repo(t);
  remove(root, 'src/a');
  silent(hook(root, 'src/a/new.ts', { tool: 'Read' }));
  const config = join(root, '.telos/config.json');
  const saved = readFileSync(config, 'utf8');
  writeFileSync(config, JSON.stringify({ ...JSON.parse(saved), profile: 'minimal' }));
  silent(hook(root, 'src/a/new.ts'));
  writeFileSync(config, saved);
  rmSync(join(root, '.telos/HISTORY.md'));
  silent(hook(root, 'src/a/new.ts'));
  rmSync(join(root, '.telos'), { recursive: true });
  silent(hook(root, 'src/a/new.ts'));
});
