import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
function put(root, path, text) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
}
function commit(root, subject, body) {
  git(root, 'commit', '--allow-empty', '-qm', subject, ...(body ? ['-m', body] : []));
  return git(root, 'rev-parse', 'HEAD');
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'telos-changelog-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  put(root, '.telos/config.json', JSON.stringify({ profile: 'deep', docs: { changelog: 'notes/CHANGES.md' } }));
  put(root, '.telos/STATUS.md', 'Phase: 05-deep\nTask: none\nNext: none\n');
  put(root, 'notes/CHANGES.md', '# Changelog\n\n## 1.2.3\nKept verbatim.\n');
  git(root, 'add', '--', '.telos/config.json', '.telos/STATUS.md', 'notes/CHANGES.md');
  commit(root, 'feat: baseline must not appear');
  git(root, 'tag', 'telos/05-start');
  return root;
}
async function cli(root, ...args) {
  let out = '', err = '';
  const code = await main(['changelog', ...args], { cwd: root,
    stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } } });
  return { code, out, err };
}

test('only phase conventional commits appear with category, scope, breaking and revert evidence, newest first', async (t) => {
  const root = fixture(t);
  const feature = commit(root, 'feat(api): add export');
  const breaking = commit(root, 'fix(storage)!: replace layout', 'BREAKING CHANGE: old storage cannot be read\nMigration requires an explicit export.');
  const footer = commit(root, 'refactor(api): simplify input', 'BREAKING-CHANGE: removed positional argument');
  const revert = commit(root, 'revert(05-02): undo export', `This reverts commit ${feature}.`);
  const ordinary = commit(root, 'Revert "refactor(api): simplify input"', `This reverts commit ${footer}.`);
  const result = await cli(root);
  assert.equal(result.code, 0, result.err);
  for (const text of ['feat(api): add export', 'fix(storage)!: replace layout', 'refactor(api): simplify input',
    'revert(05-02): undo export', 'BREAKING', 'old storage cannot be read', 'Migration requires an explicit export.',
    'removed positional argument', feature, breaking, footer, revert, ordinary]) assert.ok(result.out.includes(text), text);
  assert.match(result.out, /Revert.*This reverts commit|Reverts:/s);
  assert.ok(result.out.indexOf(ordinary) < result.out.indexOf(revert));
  assert.ok(result.out.indexOf(revert) < result.out.indexOf(breaking));
  assert.ok(!result.out.includes('baseline must not appear'));
  assert.equal((await cli(root, '05')).out, result.out);
});

test('planning-only bookkeeping and nonconventional commits are excluded; empty drafts are valid', async (t) => {
  const root = fixture(t);
  commit(root, 'docs(telos): approve tasks');
  commit(root, 'miscellaneous notes');
  let result = await cli(root);
  assert.equal(result.code, 0);
  assert.match(result.out, /Candidates: 0/);
  assert.ok(!result.out.includes('approve tasks'));
  assert.ok(!result.out.includes('miscellaneous notes'));
  assert.match(result.out, /Excluded: 1 planning-only.*1 nonconventional/);
  commit(root, 'docs(api): explain public inputs');
  result = await cli(root);
  assert.match(result.out, /docs\(api\): explain public inputs/);
});

test('deep gate, missing phase/tag, and malformed selectors return their exact exit categories', async (t) => {
  const root = fixture(t);
  for (const args of [['5'], ['005'], ['../05'], ['05', '06'], ['--unknown'], ['05;touch MARKER']]) {
    assert.equal((await cli(root, ...args)).code, 2, args.join(' '));
  }
  const missing = await cli(root, '06');
  assert.equal(missing.code, 1);
  assert.match(missing.err, /telos\/06-start/);
  assert.match(missing.err, /restore|approve/i);
  git(root, 'branch', 'telos/06-start');
  assert.equal((await cli(root, '06')).code, 1, 'a branch cannot substitute for the phase tag');
  put(root, '.telos/STATUS.md', 'Phase: none\n');
  assert.equal((await cli(root)).code, 1);
  for (const profile of ['minimal', 'standard']) {
    put(root, '.telos/config.json', JSON.stringify({ profile }));
    const result = await cli(root, '05');
    assert.equal(result.code, 1);
    assert.equal(result.err.trim(), 'Requires deep profile. Switch with /telos:profile deep.');
  }
});

test('shell-like and multiline messages remain quoted data and never invent a release version', async (t) => {
  const root = fixture(t);
  commit(root, 'feat(cli): $(touch MARKER) `touch OTHER`\ncontinued subject', 'BREAKING CHANGE: first line\ncontinued "quoted" detail\n\nOther notes.');
  const result = await cli(root);
  assert.equal(result.code, 0);
  assert.ok(result.out.includes('$(touch MARKER) `touch OTHER`'));
  assert.ok(result.out.includes('continued subject'));
  assert.ok(result.out.includes('continued \\"quoted\\" detail'));
  assert.ok(!existsSync(join(root, 'MARKER')));
  assert.ok(!existsSync(join(root, 'OTHER')));
  assert.match(result.out, /existing version or.*date/i);
  assert.match(result.out, /10 lines/);
  assert.ok(!/^##? (?:v?\d+\.\d+|Unreleased)/m.test(result.out));
});

test('oversized history and report overflow have explicit omission counts within 6000 characters', async (t) => {
  const root = fixture(t);
  // Generate a long linear history without hundreds of child processes.
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');
  let parent = git(root, 'rev-parse', 'HEAD');
  for (let i = 0; i < 205; i++) {
    parent = git(root, 'commit-tree', tree, '-p', parent, '-m', `feat(api): candidate ${i} ${'long '.repeat(30)}`);
  }
  git(root, 'update-ref', 'HEAD', parent);
  const result = await cli(root);
  assert.equal(result.code, 0, result.err);
  assert.ok(result.out.length <= 6000);
  assert.match(result.out, /5 older commits not inspected/);
  assert.match(result.out, /[1-9]\d* candidates omitted/);
  assert.match(result.out, /incomplete/i);
  assert.ok(!result.out.includes('candidate 0 '));
});

test('unchanged CHANGELOG, work tree, index, HEAD and Telos metadata survive success and refusal', async (t) => {
  const root = fixture(t);
  commit(root, 'perf(api): cache lookups');
  put(root, 'staged.txt', 'staged\n');
  git(root, 'add', '--', 'staged.txt');
  put(root, 'staged.txt', 'unstaged\n');
  put(root, 'untracked.txt', 'untracked\n');
  const paths = ['notes/CHANGES.md', '.git/index', '.telos/config.json', '.telos/STATUS.md', 'staged.txt', 'untracked.txt'];
  const before = paths.map((path) => readFileSync(join(root, path)));
  const head = git(root, 'rev-parse', 'HEAD');
  const status = git(root, 'status', '--porcelain=v1');
  assert.equal((await cli(root)).code, 0);
  assert.equal((await cli(root, '06')).code, 1);
  assert.deepEqual(paths.map((path) => readFileSync(join(root, path))), before);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.equal(git(root, 'status', '--porcelain=v1'), status);
});

test('git-configured programs and repository scripts are never executed', async (t) => {
  const root = fixture(t);
  const parent = git(root, 'rev-parse', 'HEAD');
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');
  const signed = execFileSync('git', ['-C', root, 'hash-object', '-t', 'commit', '-w', '--stdin'], {
    encoding: 'utf8', input: `tree ${tree}\nparent ${parent}\nauthor Test <test@example.com> 1700000000 +0000\ncommitter Test <test@example.com> 1700000000 +0000\ngpgsig -----BEGIN PGP SIGNATURE-----\n fake\n -----END PGP SIGNATURE-----\n\nfeat: keep signed history inert\n`,
  }).trim();
  git(root, 'update-ref', 'HEAD', signed);
  put(root, 'trap.sh', '#!/bin/sh\ntouch "$(dirname "$0")/EXECUTED"\n');
  chmodSync(join(root, 'trap.sh'), 0o755);
  git(root, 'config', 'core.fsmonitor', join(root, 'trap.sh'));
  git(root, 'config', 'core.pager', join(root, 'trap.sh'));
  git(root, 'config', 'log.showSignature', 'true');
  git(root, 'config', 'gpg.program', join(root, 'trap.sh'));
  assert.equal((await cli(root)).code, 0);
  assert.ok(!existsSync(join(root, 'EXECUTED')));
});

test('an empty phase is valid and an unrelated phase tag refuses without history fallback', async (t) => {
  const root = fixture(t);
  const empty = await cli(root);
  assert.equal(empty.code, 0);
  assert.match(empty.out, /Candidates: 0/);
  assert.match(empty.out, /0 candidates omitted.*0 older commits not inspected/);
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');
  const orphan = git(root, 'commit-tree', tree, '-m', 'feat: unrelated history');
  git(root, 'tag', 'telos/06-start', orphan);
  const refused = await cli(root, '06');
  assert.equal(refused.code, 1);
  assert.match(refused.err, /not an ancestor.*restore/);
  assert.equal(refused.out, '');
});

test('a single oversized candidate is omitted whole while preserving the report footer', async (t) => {
  const root = fixture(t);
  const subject = `feat(api): ${'x'.repeat(7000)}`;
  commit(root, subject);
  const result = await cli(root);
  assert.equal(result.code, 0);
  assert.ok(result.out.length <= 6000);
  assert.match(result.out, /1 candidates omitted/);
  assert.match(result.out, /Coverage: incomplete/);
  assert.match(result.out, /Inspect: git log/);
  assert.ok(!result.out.includes(subject));
});
