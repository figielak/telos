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
import { memoryRepo } from './memory-repo.mjs';

const HOOK = fileURLToPath(new URL('../hooks/edit-guard.mjs', import.meta.url));
const BIN = fileURLToPath(new URL('../bin/', import.meta.url));
const { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } = fs;
const cache = (root) => join(root, '.telos/.cache');

function repo(t) {
  const root = memoryRepo(t);
  writeFileSync(join(root, '.telos/HISTORY.md'), render('HISTORY.md', { date: '2026-01-01' }));
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

test('the suggested shell command safely reverts only its exact selector, preserving approaches in plan', async (t) => {
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
  assert.match(await telos(root, 'ctx', 'plan'), /Global mutable cache/);
  await telos(root, 'history', 'add', 'revert', '04-01', 'Restore the approach', '--approach', 'Global mutable cache');
  assert.doesNotMatch(await telos(root, 'ctx', 'plan'), /Global mutable cache/);
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

test('deletion warnings cover .telos/ paths and protected configs, without any active task', (t) => {
  const root = repo(t);
  for (const path of ['src/a', '.telos/removed', 'tsconfig.json']) remove(root, path);
  warned(hook(root, 'src/a/new.ts'));
  warned(hook(root, '.telos/removed/new.md'));
  warned(hook(root, 'tsconfig.json'));
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

test('non-edit tools, an unreadable config and missing history or .telos/ remain silent', (t) => {
  const root = repo(t);
  remove(root, 'src/a');
  silent(hook(root, 'src/a/new.ts', { tool: 'Read' }));
  const config = join(root, '.telos/config.json');
  const saved = readFileSync(config, 'utf8');
  writeFileSync(config, '{ broken');
  silent(hook(root, 'src/a/new.ts'));
  writeFileSync(config, saved);
  rmSync(join(root, '.telos/HISTORY.md'));
  silent(hook(root, 'src/a/new.ts'));
  rmSync(join(root, '.telos'), { recursive: true });
  silent(hook(root, 'src/a/new.ts'));
});
