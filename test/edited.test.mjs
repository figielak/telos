import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runChecks } from '../lib/check.mjs';
import { claimBatch, completeBatch, recordEdit, stopChecks } from '../lib/edited.mjs';
import { init } from '../lib/init.mjs';

const EDITED = fileURLToPath(new URL('../hooks/edited.mjs', import.meta.url));
const STOP = fileURLToPath(new URL('../hooks/stop.mjs', import.meta.url));
const SESSION = 'session-a';

function repo(t, { profile = 'standard', checks = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-edited-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.git'));
  init(root, { profile, stack: [], checks });
  mkdirSync(join(root, 'src'));
  for (const f of ['a.mjs', 'b.mjs']) writeFileSync(join(root, 'src', f), 'x\n');
  return root;
}

const event = (root, file, extra = {}) => ({ session_id: SESSION, cwd: root, tool_name: 'Edit',
  tool_input: { file_path: file }, tool_response: { success: true }, ...extra });
const lines = (root, file) => (existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8').split('\n').filter(Boolean) : []);
const stop = (root, extra = {}, opts = {}) => stopChecks(root, { session_id: SESSION, cwd: root, stop_hook_active: false, ...extra }, opts);

test('repeated edits deduplicate; other tools, outside paths, .telos/ and failed edits are ignored', (t) => {
  const root = repo(t);
  assert.equal(recordEdit(root, event(root, 'src/a.mjs')), true);
  recordEdit(root, event(root, join(root, 'src/a.mjs')));
  recordEdit(root, event(root, './src/b.mjs', { tool_name: 'Write' }));
  assert.equal(recordEdit(root, event(root, 'src/c.mjs', { tool_name: 'Read' })), false);
  assert.equal(recordEdit(root, { ...event(root, ''), tool_name: 'Bash', tool_input: { command: 'ls' } }), false);
  assert.equal(recordEdit(root, event(root, '/etc/hosts')), false);
  assert.equal(recordEdit(root, event(root, '.telos/STATUS.md')), false);
  assert.equal(recordEdit(root, event(root, 'src/d.mjs', { tool_response: { success: false } })), false);
  assert.deepEqual(claimBatch(root, SESSION).paths, ['src/a.mjs', 'src/b.mjs']);
});

test('minimal profile and missing .telos/ record nothing', (t) => {
  const minimal = repo(t, { profile: 'minimal' });
  assert.equal(recordEdit(minimal, event(minimal, 'src/a.mjs')), false);
  assert.equal(existsSync(join(minimal, '.telos/.cache')), false);
  const bare = mkdtempSync(join(tmpdir(), 'telos-edited-bare-'));
  t.after(() => rmSync(bare, { recursive: true, force: true }));
  assert.equal(recordEdit(bare, event(bare, 'x.mjs')), false);
});

test('batches are session-owned', (t) => {
  const root = repo(t);
  recordEdit(root, event(root, 'src/a.mjs'));
  recordEdit(root, event(root, 'src/b.mjs', { session_id: 'session-b' }));
  assert.deepEqual(claimBatch(root, SESSION).paths, ['src/a.mjs']);
  assert.deepEqual(claimBatch(root, 'session-b').paths, ['src/b.mjs']);
});

test('Stop runs format then types once for the claimed batch, silently on success', async (t) => {
  const root = repo(t, { checks: { format: 'printf "fmt %s\\n" {files} >> run.log', types: 'echo types >> run.log', test: 'echo test >> run.log' } });
  recordEdit(root, event(root, 'src/a.mjs'));
  recordEdit(root, event(root, 'src/b.mjs'));
  recordEdit(root, event(root, 'src/a.mjs'));
  assert.equal(await stop(root), null);
  assert.deepEqual(lines(root, 'run.log'), ['fmt ./src/a.mjs', 'fmt ./src/b.mjs', 'types']);
  assert.equal(claimBatch(root, SESSION), null);
  assert.equal(await stop(root), null);
  assert.equal(lines(root, 'run.log').length, 3, 'an empty batch runs nothing');
});

test('no format/types configured or no edited files means no subprocess and no output', async (t) => {
  const none = repo(t, { checks: { test: 'echo test >> run.log' } });
  recordEdit(none, event(none, 'src/a.mjs'));
  assert.equal(await stop(none), null);
  assert.deepEqual(lines(none, 'run.log'), []);
  const empty = repo(t, { checks: { types: 'echo types >> run.log' } });
  assert.equal(await stop(empty), null);
  assert.deepEqual(lines(empty, 'run.log'), []);
  recordEdit(empty, event(empty, 'src/gone.mjs'));
  assert.equal(await stop(empty), null, 'deleted files are dropped');
  assert.deepEqual(lines(empty, 'run.log'), []);
});

test('stop_hook_active suppresses the rerun and keeps the pending batch', async (t) => {
  const root = repo(t, { checks: { types: 'echo types >> run.log' } });
  recordEdit(root, event(root, 'src/a.mjs'));
  assert.equal(await stop(root, { stop_hook_active: true }), null);
  assert.deepEqual(lines(root, 'run.log'), []);
  assert.deepEqual(claimBatch(root, SESSION).paths, ['src/a.mjs']);
});

test('a failing or timed-out check reports bounded diagnostics and keeps the batch recoverable', async (t) => {
  const root = repo(t, { checks: { types: 'for i in $(seq 1 200); do echo "error line $i"; done; exit 3' } });
  recordEdit(root, event(root, 'src/a.mjs'));
  const report = await stop(root);
  assert.match(report, /^telos stop: types FAIL \(exit 3\) for 1 edited file/m);
  assert.match(report, /error line 1$/m);
  assert.ok(report.split('\n').length <= 25, String(report.split('\n').length));
  assert.ok(report.length <= 2500);
  // The failed batch comes back with the next claim, merged with new edits.
  recordEdit(root, event(root, 'src/b.mjs'));
  assert.deepEqual(claimBatch(root, SESSION).paths, ['src/a.mjs', 'src/b.mjs']);

  const slow = repo(t, { checks: { types: 'sleep 5' } });
  recordEdit(slow, event(slow, 'src/a.mjs'));
  assert.match(await stop(slow, {}, { timeoutMs: 200 }), /types FAIL \(timeout/);
  assert.notEqual(claimBatch(slow, SESSION), null);
});

test('an edit recorded while a batch runs survives for the next batch', async (t) => {
  const root = repo(t);
  writeFileSync(join(root, 'late.json'), JSON.stringify(event(root, 'src/b.mjs')));
  const cfg = join(root, '.telos/config.json');
  const types = `"${process.execPath}" "${EDITED}" < late.json && echo types >> run.log`;
  writeFileSync(cfg, JSON.stringify({ ...JSON.parse(readFileSync(cfg, 'utf8')), checks: { types } }, null, 2));
  recordEdit(root, event(root, 'src/a.mjs'));
  assert.equal(await stop(root), null);
  assert.deepEqual(lines(root, 'run.log'), ['types']);
  const next = claimBatch(root, SESSION);
  assert.deepEqual(next.paths, ['src/b.mjs']);
  completeBatch(root, next);
  assert.equal(claimBatch(root, SESSION), null);
});

test('spaces and shell metacharacters stay literal filenames', async (t) => {
  const root = repo(t, { checks: { format: 'printf "<%s>\\n" {files} >> run.log' } });
  const names = ['src/with space.mjs', 'src/$(touch pwned).mjs', "src/it's;rm.mjs"];
  for (const n of names) { writeFileSync(join(root, n), 'x\n'); recordEdit(root, event(root, n)); }
  assert.equal(await stop(root), null);
  assert.deepEqual(lines(root, 'run.log').sort(), names.map((n) => `<./${n}>`).sort());
  assert.equal(existsSync(join(root, 'pwned')), false);
});

test('telos check --level full never runs the formatter', async (t) => {
  const root = repo(t, { checks: { format: 'echo fmt >> run.log', test: 'true' } });
  const result = await runChecks(root, { level: 'full' });
  assert.ok(result.checks.every((c) => c.name !== 'format'));
  assert.deepEqual(lines(root, 'run.log'), []);
});

test('the hooks: PostToolUse is silent; Stop blocks with the report once and is silent on stop_hook_active', (t) => {
  const root = repo(t, { checks: { types: 'echo broken; exit 1' } });
  const post = spawnSync(process.execPath, [EDITED], { input: JSON.stringify(event(root, 'src/a.mjs')), encoding: 'utf8' });
  assert.deepEqual([post.status, post.stdout, post.stderr], [0, '', '']);
  const stopInput = (active) => JSON.stringify({ session_id: SESSION, cwd: root, stop_hook_active: active });
  const blocked = spawnSync(process.execPath, [STOP], { input: stopInput(false), encoding: 'utf8' });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /types FAIL/);
  const again = spawnSync(process.execPath, [STOP], { input: stopInput(true), encoding: 'utf8' });
  assert.deepEqual([again.status, again.stdout, again.stderr], [0, '', '']);
  const junk = spawnSync(process.execPath, [STOP], { input: '{bad', encoding: 'utf8' });
  assert.equal(junk.status, 0);
  assert.ok(readdirSync(join(root, '.telos/.cache')).length > 0);
});
