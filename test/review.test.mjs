import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { reviewEvidence } from '../lib/review.mjs';

const fixture = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const taskPath = '.telos/phases/01-demo/01-01-first-task.md';
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const write = (root, path, text) => writeFileSync(join(root, path), text);
function commit(root, subject, paths) {
  git(root, 'add', '--', ...paths);
  git(root, 'commit', '-qm', subject);
  return git(root, 'rev-parse', 'HEAD').trim();
}
function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'telos-review-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fixture, root, { recursive: true });
  rmSync(join(root, '.telos/phases/09-bad'), { recursive: true });
  const task = readFileSync(join(root, taskPath), 'utf8');
  write(root, taskPath, task.replace('scope: [src/]', 'scope: [src/a.ts, src/new.ts, src/renamed.ts, src/data.bin, src/link]'));
  write(root, '.telos/MAP.md', '# Map\n- `src/a.ts` — selected module\n- `src/b.ts` — unrelated module\n');
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  git(root, 'config', 'commit.gpgsign', 'false');
  commit(root, 'docs(telos): plan', ['.telos', 'src']);
  git(root, 'tag', 'telos/01-start');
  write(root, 'src/a.ts', 'export const selected = 1;\n');
  const first = commit(root, 'feat(01-01): literal $(touch INJECTED); `false`', ['src/a.ts']);
  write(root, 'src/b.ts', 'export const unrelated = 1;\n');
  const other = commit(root, 'feat(01-02): other', ['src/b.ts']);
  write(root, 'src/a.ts', 'export const selected = 2;\n');
  const last = commit(root, 'fix(01-01): second', ['src/a.ts']);
  return { root, first, other, last };
}

test('task review selects exact commits, scope edits, acceptance and relevant MAP without mutation', (t) => {
  const { root, first, last, other } = repo(t);
  write(root, 'src/a.ts', 'export const selected = 3;\n');
  write(root, 'src/new.ts', 'export const added = 1;\n');
  write(root, 'src/b.ts', 'unrelated dirty\n');
  const before = git(root, 'status', '--porcelain=v1', '-z');
  const e = reviewEvidence(root, '01-01');
  assert.deepEqual(e.target, { kind: 'task', id: '01-01' });
  assert.deepEqual(e.commits, [last, first]);
  assert.ok(!e.commits.includes(other));
  assert.ok(e.changes.some((c) => c.path === 'src/new.ts' && c.kind === 'untracked'));
  assert.ok(!e.changes.some((c) => c.path === 'src/b.ts'));
  assert.match(e.diffBlocks.map((b) => b.text).join('\n'), /selected = 3/);
  assert.deepEqual(e.acceptance.map((a) => a.id), ['01-01']);
  assert.match(e.acceptance[0].text, /all listed tests pass/);
  assert.ok(e.map.some((l) => l.includes('selected module')));
  assert.ok(!e.map.some((l) => l.includes('unrelated module')));
  assert.equal(git(root, 'status', '--porcelain=v1', '-z'), before);
  assert.ok(!existsSync(join(root, 'INJECTED')));
});

test('phase review uses baseline through HEAD plus all current edits and all acceptance', (t) => {
  const { root, first, other, last } = repo(t);
  write(root, 'outside.txt', 'phase dirty\n');
  const e = reviewEvidence(root, '01');
  assert.deepEqual(e.target, { kind: 'phase', id: '01' });
  assert.deepEqual(e.commits, [last, other, first]);
  assert.ok(e.changes.some((c) => c.path === 'outside.txt'));
  assert.deepEqual(e.acceptance.map((a) => a.id), ['01-01', '01-02', '01-03']);
  assert.match(e.diffBlocks[0].continuation, new RegExp(e.baseline));
});

test('unknown targets and missing tag refuse with remedy, never substitute all history', (t) => {
  const { root } = repo(t);
  const before = git(root, 'status', '--porcelain=v1', '-z');
  assert.throws(() => reviewEvidence(root, '99-01'), /REFUSED:.*99-01.*plan/);
  assert.throws(() => reviewEvidence(root, '99'), /REFUSED:.*99.*plan/);
  git(root, 'tag', '-d', 'telos/01-start');
  assert.throws(() => reviewEvidence(root, '01-01'), /REFUSED:.*telos\/01-start.*git tag/);
  assert.equal(git(root, 'status', '--porcelain=v1', '-z'), before);
});

test('renames, deletions, binary and untracked paths retain explicit evidence kinds', (t) => {
  const { root } = repo(t);
  renameSync(join(root, 'src/a.ts'), join(root, 'src/renamed.ts'));
  git(root, 'add', '--', 'src/a.ts', 'src/renamed.ts');
  write(root, 'src/data.bin', Buffer.from([0, 1, 2, 3]));
  git(root, 'add', '--', 'src/data.bin');
  write(root, 'src/new.ts', 'untracked content\n');
  let e = reviewEvidence(root, '01-01');
  assert.ok(e.changes.some((c) => c.kind === 'renamed' && c.oldPath === 'src/a.ts' && c.path === 'src/renamed.ts'));
  assert.ok(e.changes.some((c) => c.kind === 'binary' && c.path === 'src/data.bin'));
  assert.ok(e.diffBlocks.some((b) => b.text.includes('untracked content')));
  assert.equal(e.complete, false);
  assert.match(e.notes.join('\n'), /binary/);
  rmSync(join(root, 'src/renamed.ts'));
  e = reviewEvidence(root, '01-01');
  assert.ok(e.changes.some((c) => c.kind === 'deleted' && c.path === 'src/renamed.ts'));
});

test('staged and unstaged changes both survive even when final worktree equals HEAD', (t) => {
  const { root } = repo(t);
  const original = readFileSync(join(root, 'src/a.ts'), 'utf8');
  write(root, 'src/a.ts', 'staged intermediate\n');
  git(root, 'add', '--', 'src/a.ts');
  write(root, 'src/a.ts', original);
  const e = reviewEvidence(root, '01-01');
  assert.ok(e.diffBlocks.some((b) => b.source === 'index' && b.text.includes('+staged intermediate')));
  assert.ok(e.diffBlocks.some((b) => b.source === 'worktree' && b.text.includes('-staged intermediate')));
});

test('paths with shell and pathspec metacharacters are literal; untracked symlinks are not followed', (t) => {
  const { root } = repo(t);
  const path = "src/$(touch INJECTED); 'quote' [x]\n.txt";
  write(root, taskPath, readFileSync(join(root, taskPath), 'utf8').replace(/scope: .*/, 'scope: [src/]'));
  write(root, path, 'literal one\n');
  commit(root, 'feat(01-01): odd path', [path]);
  write(root, path, 'literal two\n');
  symlinkSync('/etc/passwd', join(root, 'src/link'));
  const e = reviewEvidence(root, '01-01');
  assert.ok(e.changes.some((c) => c.path === path));
  assert.match(e.diffBlocks.map((b) => b.text).join('\n'), /literal two/);
  assert.ok(e.changes.some((c) => c.path === 'src/link' && c.kind === 'symlink'));
  assert.doesNotMatch(e.diffBlocks.map((b) => b.text).join('\n'), /root:x:/);
  assert.ok(!existsSync(join(root, 'INJECTED')));
});

test('evidence identity is stable and covers dirty, staged, untracked, binary and acceptance content', (t) => {
  const { root } = repo(t);
  const id = () => reviewEvidence(root, '01-01').evidenceId;
  let previous = id();
  assert.equal(previous, id());
  for (const [path, content] of [['src/a.ts', 'changed\n'], ['src/new.ts', 'one\n'], ['src/new.ts', 'two\n'],
    ['src/data.bin', Buffer.from([0, 1])], ['src/data.bin', Buffer.from([0, 2])],
    [taskPath, readFileSync(join(root, taskPath), 'utf8').replace('all listed tests pass', 'new criterion')]]) {
    write(root, path, content);
    const next = id();
    assert.notEqual(next, previous, path);
    assert.equal(next, id());
    previous = next;
  }
  write(root, 'src/b.ts', 'excluded dirty edit\n');
  assert.equal(id(), previous);
});

test('inspection leaves HEAD, index bytes and Telos metadata unchanged, including after refusal', (t) => {
  const { root } = repo(t);
  write(root, 'src/a.ts', 'dirty\n');
  const state = () => ['.git/HEAD', '.git/index', '.telos/STATUS.md', taskPath].map((p) => readFileSync(join(root, p)));
  const before = state();
  reviewEvidence(root, '01-01');
  assert.throws(() => reviewEvidence(root, '88-01'), /REFUSED/);
  assert.deepEqual(state(), before);
});

test('snapshot includes omitted tails and binary bytes, and emitted shell continuations preserve literal paths', (t) => {
  const { root } = repo(t);
  write(root, 'src/a.ts', 'long\n'.repeat(4000));
  const before = reviewEvidence(root, '01-01').evidenceId;
  write(root, 'src/a.ts', `${'long\n'.repeat(4000)}new tail\n`);
  assert.notEqual(reviewEvidence(root, '01-01').evidenceId, before);
  const path = "src/$(touch INJECTED); 'quote' [x]\n.txt";
  write(root, path, 'first\n');
  commit(root, 'feat(01-01): unusual path', [path]);
  const e = reviewEvidence(root, '01-01');
  const b = e.diffBlocks.find((b) => b.changes.some((c) => c.path === path));
  const text = execFileSync('sh', ['-c', b.continuation], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(text, b.text);
  assert.ok(!existsSync(join(root, 'INJECTED')));
  write(root, 'src/data.bin', Buffer.from([0, 1]));
  git(root, 'add', '--', 'src/data.bin');
  const binaryBefore = reviewEvidence(root, '01-01').evidenceId;
  write(root, 'src/data.bin', Buffer.from([0, 2]));
  git(root, 'add', '--', 'src/data.bin');
  assert.notEqual(reviewEvidence(root, '01-01').evidenceId, binaryBefore);
});

test('a phase tag on unrelated history refuses instead of selecting the whole orphan branch', (t) => {
  const { root } = repo(t);
  git(root, 'checkout', '-q', '--orphan', 'orphan');
  commit(root, 'feat(01-01): orphan root', [taskPath]);
  assert.throws(() => reviewEvidence(root, '01-01'), /REFUSED:.*history.*phase tag/);
});
