import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render } from '../lib/template.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const HOOK = fileURLToPath(new URL('../hooks/session-start.mjs', import.meta.url));
const HOOKS_JSON = new URL('../hooks/hooks.json', import.meta.url);

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'telos-session-'));
  cpSync(FIXTURE, root, { recursive: true });
  writeFileSync(join(root, '.telos', 'PROJECT.md'), render('PROJECT.md', { name: 'demo' })
    .replace(/## Purpose\n/, '## Purpose\nA tiny demo app for tests.\nSecond line stays out.\n'));
  spawnSync('git', ['-C', root, 'init', '-q']);
  return root;
}

const editStatus = (root, fn) => {
  const path = join(root, '.telos', 'STATUS.md');
  writeFileSync(path, fn(readFileSync(path, 'utf8')));
};

function hook(cwd, input = JSON.stringify({ cwd, hook_event_name: 'SessionStart', source: 'startup' })) {
  const r = spawnSync(process.execPath, [HOOK], { cwd, input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('the status starts with the Purpose line, then stack, profile, phase/task, next, pointers', () => {
  const { code, out } = hook(repo());
  assert.equal(code, 0);
  const lines = out.trimEnd().split('\n');
  assert.equal(lines[0], 'Project: A tiny demo app for tests.');
  assert.match(lines[1], /^Stack: /);
  assert.equal(lines[2], 'Profile: minimal');
  assert.doesNotMatch(out, /Second line/);
  assert.match(out, /^Next: run \/telos:do\nBlockers: none\nCarry-over: 0$/m);
  assert.match(lines.at(-1), /^Files: \.telos\/STATUS\.md · /);
});

test('Awaiting user comes first when set', () => {
  const root = repo();
  editStatus(root, (s) => s.replace('Awaiting user: none', 'Awaiting user: 01:D-02'));
  assert.match(hook(root).out, /^Awaiting user: 01:D-02\nProject: /);
});

test('phase and task show live states from ROADMAP and the task file', () => {
  const root = repo();
  const task = join(root, '.telos', 'phases', '01-demo', '01-02-second-task.md');
  writeFileSync(task, readFileSync(task, 'utf8').replace('status: approved', 'status: in-progress'));
  assert.match(hook(root).out, /^Phase: 01-demo \[active\] · Task: 01-02 \[in-progress\]$/m);
});

test('a long STATUS is cut to 1200 chars with a marker', () => {
  const root = repo();
  editStatus(root, (s) => s.replace('Blockers: none', `Blockers: ${'very long reason '.repeat(150)}`));
  const { out } = hook(root);
  assert.ok(out.length <= 1201, `${out.length}`);
  assert.match(out, /…\[truncated by telos ctx\]\n?$/);
});

test('no .telos/, broken config or bad stdin → no output, exit 0', () => {
  const plain = mkdtempSync(join(tmpdir(), 'telos-session-plain-'));
  assert.deepEqual(hook(plain), { code: 0, out: '', err: '' });
  const root = repo();
  writeFileSync(join(root, '.telos', 'config.json'), '{ nope');
  assert.deepEqual(hook(root), { code: 0, out: '', err: '' });
  assert.equal(hook(repo(), 'not json').code, 0);
});

test('stdin cwd wins over the process cwd', () => {
  const root = repo();
  const plain = mkdtempSync(join(tmpdir(), 'telos-session-plain-'));
  const r = spawnSync(process.execPath, [HOOK], { cwd: plain, input: JSON.stringify({ cwd: join(root, 'src') }), encoding: 'utf8' });
  assert.match(r.stdout, /^Project: A tiny demo app/);
});

test('hooks.json runs the script on startup, resume and clear', () => {
  const { hooks } = JSON.parse(readFileSync(HOOKS_JSON, 'utf8'));
  const [entry] = hooks.SessionStart;
  assert.equal(entry.matcher, 'startup|resume|clear');
  assert.equal(entry.hooks[0].type, 'command');
  assert.match(entry.hooks[0].command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/session-start\.mjs/);
});

test('a compact SessionStart on minimal prints exactly the startup status', () => {
  const root = repo();
  const startup = hook(root).out;
  const compact = hook(root, JSON.stringify({ cwd: root, hook_event_name: 'SessionStart', source: 'compact', session_id: 's' })).out;
  assert.equal(compact, startup);
  assert.ok(startup.trimEnd().length <= 1200);
});

test('hooks.json also runs the script after compaction', () => {
  const { hooks } = JSON.parse(readFileSync(HOOKS_JSON, 'utf8'));
  const compact = hooks.SessionStart.find((e) => e.matcher === 'compact');
  assert.ok(compact, 'compact matcher missing');
  assert.match(compact.hooks[0].command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/session-start\.mjs/);
});
