import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isRepo, porcelainFiles, refExists, taskCommitFiles } from '../lib/git.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'telos-git-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  git(root, 'config', 'commit.gpgsign', 'false');
  return root;
}

function commit(root, message, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  git(root, 'add', '--', ...Object.keys(files));
  git(root, 'commit', '-q', '-m', message);
}

test('isRepo tells a real repo from a bare .git directory', () => {
  assert.ok(isRepo(repo()));
  const fake = mkdtempSync(join(tmpdir(), 'telos-git-'));
  mkdirSync(join(fake, '.git'));
  assert.ok(!isRepo(fake));
});

test('porcelainFiles lists modified, untracked (inside new dirs), renamed and spaced paths', () => {
  const root = repo();
  commit(root, 'chore: init', { 'a.ts': '1\n', 'keep.ts': 'k\n', '.gitignore': 'dist/\n' });
  writeFileSync(join(root, 'keep.ts'), 'changed\n');
  mkdirSync(join(root, 'src', 'deep'), { recursive: true });
  writeFileSync(join(root, 'src', 'deep', 'my file.ts'), 'x\n');
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist', 'out.js'), 'x\n');
  git(root, 'mv', 'a.ts', 'b.ts');
  assert.deepEqual(porcelainFiles(root).sort(), ['b.ts', 'keep.ts', 'src/deep/my file.ts']);
});

test('porcelainFiles works before the first commit', () => {
  const root = repo();
  writeFileSync(join(root, 'new.ts'), 'x\n');
  assert.deepEqual(porcelainFiles(root), ['new.ts']);
});

test('taskCommitFiles finds only commits of the given scope since a ref', () => {
  const root = repo();
  commit(root, 'feat(02-04): early', { 'early.ts': '1\n' });
  git(root, 'tag', 'telos/02-start');
  commit(root, 'feat(02-04): add accept\n\n- body line', { 'lib/accept.mjs': '1\n' });
  commit(root, 'feat(02-03): other task', { 'lib/lint.mjs': '1\n' });
  commit(root, 'docs(quick): mentions feat(02-04): in the subject', { 'README.md': '1\n' });
  commit(root, 'fix(02-04): follow-up', { 'test/accept.test.mjs': '1\n' });
  assert.deepEqual(taskCommitFiles(root, '02-04', 'telos/02-start').sort(), ['lib/accept.mjs', 'test/accept.test.mjs']);
  assert.deepEqual(taskCommitFiles(root, '02-04').sort(), ['early.ts', 'lib/accept.mjs', 'test/accept.test.mjs']);
});

test('taskCommitFiles is empty in a repo without commits', () => {
  assert.deepEqual(taskCommitFiles(repo(), '02-04'), []);
});

test('refExists checks tags', () => {
  const root = repo();
  commit(root, 'chore: init', { 'a.ts': '1\n' });
  assert.ok(!refExists(root, 'telos/02-start'));
  git(root, 'tag', 'telos/02-start');
  assert.ok(refExists(root, 'telos/02-start'));
});
