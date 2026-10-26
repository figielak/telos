import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { check, splitCommands } from '../lib/git-guard.mjs';

const HOOK = fileURLToPath(new URL('../hooks/git-guard.mjs', import.meta.url));
const pushed = { headPushed: () => true };
const local = { headPushed: () => false };

const CASES = [
  ['git push', 'push'],
  ['git push -n origin x', 'push'],
  ['git -C sub push', 'push'],
  ['FOO=1 git push', 'push'],
  ['npm test && git push', 'push'],
  ['a; git push', 'push'],
  ['x | git push', 'push'],
  ['bash -c "git push"', 'push'],
  ["sh -c 'git add .'", 'add-all'],
  ['git commit --no-verify -m x', 'no-verify'],
  ['git commit -nm x', 'no-verify'],
  ['git merge --no-verify', 'no-verify'],
  ['git add -A', 'add-all'],
  ['git add --all', 'add-all'],
  ['git add .', 'add-all'],
  ['git add ./', 'add-all'],
  ['git add :/', 'add-all'],
  ['git add src/a.ts .telos/STATUS.md', null],
  ['git add -u', null],
  ['git reset --hard', 'reset-hard'],
  ['git reset --hard HEAD~1', 'reset-hard'],
  ['git reset HEAD a.ts', null],
  ['git reset --soft HEAD~1', null],
  ['echo "git push"', null],
  ['git commit -m "do not git push"', null],
  ['git commit -m "skip -n and --no-verify talk"', null],
  ['git commit -mn', null],
  ['git log --grep=push', null],
  ['gitk', null],
  ['ls', null],
  ['', null],
  ['git commit -m "unbalanced', null],
  ['echo \'open && git push', null],
];

test('edge cases: blocked rules and allowed commands', () => {
  for (const [cmd, rule] of CASES) {
    const got = check(cmd, pushed);
    assert.equal(got?.rule ?? null, rule, cmd);
    if (got) assert.ok(got.why, cmd);
  }
});

test('commit --amend is blocked only when HEAD is pushed, and asks git only then', () => {
  assert.equal(check('git commit --amend', pushed)?.rule, 'amend-pushed');
  assert.equal(check('git commit --amend --no-edit', local), null);
  let calls = 0;
  check('git status && git add a.ts', { headPushed: () => { calls++; return true; } });
  assert.equal(calls, 0);
});

test('splitCommands splits on separators and keeps quoted text whole', () => {
  assert.deepEqual(splitCommands('a "b c" && d\'e f\'|g;h\ni || j\\ k'), [
    ['a', 'b c'], ['de f'], ['g'], ['h'], ['i'], ['j k'],
  ]);
  assert.deepEqual(splitCommands(''), []);
  assert.deepEqual(splitCommands('"open'), [['open']]);
});

function hook(input, cwd) {
  const r = spawnSync(process.execPath, [HOOK], { cwd, input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function telosRepo() {
  const root = mkdtempSync(join(tmpdir(), 'telos-guard-'));
  mkdirSync(join(root, '.telos'));
  spawnSync('git', ['-C', root, 'init', '-q']);
  return root;
}

const bash = (command, cwd) => JSON.stringify({ cwd, tool_name: 'Bash', tool_input: { command } });

test('hook: allowed → exit 0 silent; blocked → exit 2 with the telos reason', () => {
  const root = telosRepo();
  assert.deepEqual(hook(bash('git status', root), root), { code: 0, out: '', err: '' });
  const blocked = hook(bash('git push origin main', root), root);
  assert.equal(blocked.code, 2);
  assert.match(blocked.err, /^telos git guard: push — .+\n$/);
});

test('hook: amend in a repo without remotes is allowed', () => {
  const root = telosRepo();
  assert.equal(hook(bash('git commit --amend --no-edit', root), root).code, 0);
});

test('hook: no .telos/ or malformed stdin → exit 0', () => {
  const plain = mkdtempSync(join(tmpdir(), 'telos-guard-plain-'));
  spawnSync('git', ['-C', plain, 'init', '-q']);
  assert.equal(hook(bash('git push', plain), plain).code, 0);
  assert.deepEqual(hook('not json', telosRepo()), { code: 0, out: '', err: '' });
  assert.equal(hook('{}', telosRepo()).code, 0);
});

test('hooks.json runs the guard before every Bash call', () => {
  const { hooks } = JSON.parse(readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
  const entry = hooks.PreToolUse.find((h) => h.matcher === 'Bash');
  assert.ok(entry);
  assert.match(entry.hooks[0].command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/git-guard\.mjs/);
});
