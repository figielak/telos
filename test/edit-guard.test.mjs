import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { editTarget } from '../lib/edit-guard.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const HOOK = fileURLToPath(new URL('../hooks/edit-guard.mjs', import.meta.url));

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'telos-edit-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(FIXTURE, root, { recursive: true });
  mkdirSync(join(root, '.git'));
  return root;
}

const input = (root, file, tool = 'Edit', cwd = root) => ({ tool_name: tool, cwd, tool_input: { file_path: file } });

function hook(stdin) {
  const r = spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('editTarget normalizes absolute, ../ and cwd-relative paths to one repo path', (t) => {
  const root = repo(t);
  for (const event of [input(root, 'src/a.ts'), input(root, join(root, 'src/a.ts')),
    input(root, '../src/a.ts', 'Write', join(root, 'docs')), input(root, 'src/x/../a.ts')]) {
    assert.equal(editTarget(root, event).path, 'src/a.ts', JSON.stringify(event));
  }
  assert.equal(editTarget(root, { tool_name: 'NotebookEdit', cwd: root, tool_input: { notebook_path: 'n.ipynb' } }).path, 'n.ipynb');
});

test('editTarget adds the symlink-resolved path as a second candidate', (t) => {
  const root = repo(t);
  mkdirSync(join(root, 'real'));
  symlinkSync(join(root, 'real'), join(root, 'alias'));
  assert.deepEqual(editTarget(root, input(root, 'alias/x.md')).candidates, ['alias/x.md', 'real/x.md']);
  const outside = mkdtempSync(join(tmpdir(), 'telos-edit-out-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(root, 'away'));
  assert.equal(editTarget(root, input(root, 'away/x.md')).escapes, true);
});

test('other tools, paths outside the repo and a missing .telos/ give no target', (t) => {
  const root = repo(t);
  assert.equal(editTarget(root, input(root, 'src/a.ts', 'Read')), null);
  assert.equal(editTarget(root, { tool_name: 'Bash', cwd: root, tool_input: { command: 'ls' } }), null);
  assert.equal(editTarget(root, input(root, '/etc/hosts')), null);
  rmSync(join(root, '.telos'), { recursive: true });
  assert.equal(editTarget(root, input(root, 'src/a.ts')), null);
});

test('the hook never blocks and stays silent on ordinary edits, protected configs included', (t) => {
  const root = repo(t);
  for (const file of ['tsconfig.json', 'src/a.ts', 'docs/outside-scope.md']) {
    const r = hook(JSON.stringify(input(root, file, 'Write')));
    assert.deepEqual([r.code, r.stdout, r.stderr], [0, '', ''], file);
  }
});

test('malformed hook input is reported without a crash', () => {
  const r = hook('{not json');
  assert.equal(r.code, 0);
  assert.match(r.stderr, /^telos edit guard: unreadable hook input/);
  assert.doesNotMatch(r.stderr, /at .*\.mjs/);
});
