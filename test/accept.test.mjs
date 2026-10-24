import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { accept, acceptanceItems, deviations } from '../lib/accept.mjs';
import { main } from '../lib/cli.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
const TASK_DIR = join('.telos', 'phases', '02-core');

function taskText({ scope = '[src/]', acceptance = ['- [ ] `true` → exit 0'], result = 'Deviations: none' } = {}) {
  return `---\nid: 02-04\ntitle: T\ntype: code\nstatus: in-progress\ncritical: false\neffort: normal\n`
    + `depends: []\ndecisions: []\nscope: ${scope}\n---\n## Goal\nG.\n\n## Files\n- src/a.ts (modify)\n\n`
    + `## Acceptance\n${acceptance.join('\n')}\n\n## Result\n${result}\n`;
}

function write(root, path, text) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** A git repo with `.telos/`, task 02-04 and an initial commit; then `files` are written uncommitted. */
function repoWith(task = {}, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-accept-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, '.telos/STATUS.md', '# Status\n');
  write(root, '.gitignore', 'dist/\n');
  write(root, 'src/a.ts', 'a\n');
  write(root, join(TASK_DIR, '02-04-t.md'), taskText(task));
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'chore: init');
  for (const [path, text] of Object.entries(files)) write(root, path, text);
  return root;
}

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

const verdicts = (r) => r.items.map((i) => i.verdict);

test('acceptanceItems reads checkbox lines and the `cmd` → exit N form', () => {
  const items = acceptanceItems('<!-- "- [ ] `x` → exit 0" -->\n- [ ] all listed tests pass\n- [x] `npm test` → exit 0\n- [ ] `a b` →  exit 3 (slow)\ntext');
  assert.deepEqual(items, [
    { text: 'all listed tests pass' },
    { text: '`npm test` → exit 0', cmd: 'npm test', exit: 0 },
    { text: '`a b` →  exit 3 (slow)', cmd: 'a b', exit: 3 },
  ]);
});

test('deviations reads paths from the last Deviations line', () => {
  assert.deepEqual(deviations('- did x\nDeviations: none'), []);
  assert.deepEqual(deviations('Deviations: src/x.ts — why; lib/a.mjs, lib/b.mjs — other'), ['src/x.ts', 'lib/a.mjs', 'lib/b.mjs']);
  assert.deepEqual(deviations('- Deviations: docs/ - reason'), ['docs/']);
  assert.deepEqual(deviations(''), []);
});

test('a passing command passes, a failing one fails with its output tail', async () => {
  const root = repoWith({ acceptance: ['- [ ] `true` → exit 0', '- [ ] `echo boom; echo err >&2; false` → exit 0'] });
  const r = accept(root, '02-04');
  assert.deepEqual(verdicts(r), ['PASS', 'FAIL']);
  assert.equal(r.items[1].note, 'got 1');
  assert.deepEqual(r.items[1].tail, ['boom', 'err']);
  assert.equal(r.ok, false);
  const cli = await telos(root, 'accept', '02-04');
  assert.equal(cli.code, 1);
  assert.match(cli.stdout, /^PASS   `true` → exit 0$/m);
  assert.match(cli.stdout, /^FAIL   `echo boom.*\(got 1\)\n {7}boom\n {7}err$/m);
  assert.match(cli.stdout, /^accept 02-04: FAIL$/m);
});

test('a non-zero expectation is supported', () => {
  assert.deepEqual(verdicts(accept(repoWith({ acceptance: ['- [ ] `exit 3` → exit 3'] }), '02-04')), ['PASS']);
});

test('a command over the timeout fails', () => {
  const r = accept(repoWith({ acceptance: ['- [ ] `sleep 5` → exit 0'] }), '02-04', { timeoutMs: 200 });
  assert.deepEqual(verdicts(r), ['FAIL']);
  assert.equal(r.items[0].note, 'timeout 0.2s');
});

test('items without a command or with another expectation are MANUAL; ticked items still run', () => {
  const r = accept(repoWith({ acceptance: ['- [ ] works', '- [ ] `echo ok` → prints ok', '- [x] `false` → exit 0'] }), '02-04');
  assert.deepEqual(verdicts(r), ['MANUAL', 'MANUAL', 'FAIL']);
});

test('an untracked file outside scope fails the scope check, an ignored one does not', async () => {
  const root = repoWith({}, { 'lib/new.ts': 'x\n', 'dist/out.js': 'x\n', 'src/b.ts': 'in scope\n' });
  const r = accept(root, '02-04');
  assert.deepEqual(r.outside, ['lib/new.ts']);
  assert.equal(r.ok, false);
  const cli = await telos(root, 'accept', '02-04');
  assert.match(cli.stdout, /^SCOPE  FAIL lib\/new\.ts \(not in scope, not in Deviations\)$/m);
});

test('an outside file listed in Deviations is accepted', async () => {
  const root = repoWith({ result: '- done\nDeviations: lib/new.ts — needed a helper' }, { 'lib/new.ts': 'x\n' });
  const r = accept(root, '02-04');
  assert.deepEqual(r.outside, []);
  assert.equal(r.ok, true);
  const cli = await telos(root, 'accept', '02-04');
  assert.equal(cli.code, 0, cli.stdout);
  assert.match(cli.stdout, /^SCOPE  ok \(1 file\)$/m);
  assert.match(cli.stdout, /^accept 02-04: PASS$/m);
});

test('.telos/ is always allowed and scope "*" allows everything', () => {
  assert.deepEqual(accept(repoWith({}, { '.telos/STATUS.md': 'changed\n' }), '02-04').outside, []);
  assert.deepEqual(accept(repoWith({ scope: '["*"]' }, { 'lib/x.ts': 'x\n' }), '02-04').outside, []);
});

test('commits of the task since the phase tag count, other tasks do not', () => {
  const root = repoWith();
  write(root, 'early/x.ts', 'x\n');
  git(root, 'add', 'early/x.ts');
  git(root, 'commit', '-q', '-m', 'feat(02-04): before the tag');
  git(root, 'tag', 'telos/02-start');
  for (const [path, msg] of [['lib/mine.ts', 'feat(02-04): mine'], ['lib/other.ts', 'feat(02-03): other']]) {
    write(root, path, 'x\n');
    git(root, 'add', path);
    git(root, 'commit', '-q', '-m', msg);
  }
  assert.deepEqual(accept(root, '02-04').outside, ['lib/mine.ts']);
  git(root, 'tag', '-d', 'telos/02-start');
  assert.deepEqual(accept(root, '02-04').outside.sort(), ['early/x.ts', 'lib/mine.ts']);
});

test('a renamed file is checked under its new name', () => {
  const root = repoWith();
  mkdirSync(join(root, 'lib'));
  git(root, 'mv', 'src/a.ts', 'lib/a.ts');
  assert.deepEqual(accept(root, '02-04').outside, ['lib/a.ts']);
});

test('an unknown task or a non-repo exits 1', async () => {
  const unknown = await telos(repoWith(), 'accept', '02-99');
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /no task 02-99/);

  const fake = mkdtempSync(join(tmpdir(), 'telos-accept-'));
  mkdirSync(join(fake, '.git'));
  write(fake, join(TASK_DIR, '02-04-t.md'), taskText());
  const r = await telos(fake, 'accept', '02-04');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /not a git repo/);
  assert.equal((await telos(fake, 'accept')).code, 2);
});

test('a task without acceptance items still checks scope', async () => {
  const root = repoWith({ acceptance: [] }, { 'lib/x.ts': 'x\n' });
  const cli = await telos(root, 'accept', '02-04');
  assert.equal(cli.code, 1);
  assert.match(cli.stdout, /^no acceptance items$/m);
  assert.match(cli.stdout, /^SCOPE  FAIL lib\/x\.ts/m);
});
