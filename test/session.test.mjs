import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setLines } from '../lib/status.mjs';
import { render } from '../lib/template.mjs';
import { memoryRepo } from './memory-repo.mjs';

const HOOK = fileURLToPath(new URL('../hooks/session-start.mjs', import.meta.url));
const HOOKS_JSON = new URL('../hooks/hooks.json', import.meta.url);

const PLAN = '# 01-demo\n\n## Tasks\n- [x] **01-01 First task**\n- [ ] **01-02 Second task**\n';

function repo() {
  const root = memoryRepo(null);
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, '.telos', 'phases'));
  writeFileSync(join(root, '.telos', 'phases', '01-demo.md'), PLAN);
  writeFileSync(join(root, '.telos', 'PROJECT.md'), render('PROJECT.md', { name: 'demo' })
    .replace(/## Purpose\n/, '## Purpose\nA tiny demo app for tests.\nSecond line stays out.\n'));
  const status = join(root, '.telos', 'STATUS.md');
  writeFileSync(status, setLines(readFileSync(status, 'utf8'), { task: '01-02', next: '01-02 Second task' }));
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

test('the status starts with the Purpose line, then stack, phase/task, next, pointers', () => {
  const { code, out } = hook(repo());
  assert.equal(code, 0);
  const lines = out.trimEnd().split('\n');
  assert.equal(lines[0], 'Project: A tiny demo app for tests.');
  assert.match(lines[1], /^Stack: /);
  assert.doesNotMatch(out, /Second line/);
  assert.match(out, /^Next: 01-02 Second task\nBlockers: none\nCarry-over: 0$/m);
  assert.match(lines.at(-1), /^Files: \.telos\/STATUS\.md · /);
});

test('Awaiting user comes first when set', () => {
  const root = repo();
  editStatus(root, (s) => s.replace('Awaiting user: none', 'Awaiting user: 01:D-02'));
  assert.match(hook(root).out, /^Awaiting user: 01:D-02\nProject: /);
});

test('phase and task show live states from ROADMAP and the phase checklist', () => {
  const root = repo();
  assert.match(hook(root).out, /^Phase: 01-demo \[active\] · Task: 01-02 \[open\]$/m);
  const plan = join(root, '.telos', 'phases', '01-demo.md');
  writeFileSync(plan, PLAN.replace('- [ ] **01-02', '- [x] **01-02'));
  assert.match(hook(root).out, /^Phase: 01-demo \[active\] · Task: 01-02 \[done\]$/m);
  editStatus(root, (s) => s.replace('Task: 01-02', 'Task: 01-09'));
  assert.match(hook(root).out, /^Phase: 01-demo \[active\] · Task: 01-09$/m);
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

test('hooks.json runs the script on startup, resume, clear and compact', () => {
  const { hooks } = JSON.parse(readFileSync(HOOKS_JSON, 'utf8'));
  const [entry] = hooks.SessionStart;
  assert.equal(entry.matcher, 'startup|resume|clear|compact');
  assert.equal(entry.hooks[0].type, 'command');
  assert.match(entry.hooks[0].command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/session-start\.mjs/);
});

test('a compact SessionStart prints exactly the startup status', () => {
  const root = repo();
  const startup = hook(root).out;
  const compact = hook(root, JSON.stringify({ cwd: root, hook_event_name: 'SessionStart', source: 'compact', session_id: 's' })).out;
  assert.equal(compact, startup);
  assert.ok(startup.trimEnd().length <= 1200);
});

test('after a built MAP, SessionStart derives the first-plan hint without writing STATUS', () => {
  const root = repo();
  editStatus(root, (s) => s.replace(/^Phase: .*$/m, 'Phase: none').replace(/^Task: .*$/m, 'Task: none')
    .replace(/^Next: .*$/m, 'Next: run /telos:map to map the existing code')
    .replace(/^Blockers: .*$/m, 'Blockers: 01-01: broken').replace(/^Awaiting user: .*$/m, 'Awaiting user: decide'));
  const mapPath = join(root, '.telos', 'MAP.md');
  writeFileSync(mapPath, '<!-- telos-map: not built -->\n# Map\n\nNot built yet: run `/telos:map`.\n');
  assert.match(hook(root).out, /^Next: run \/telos:map to map the existing code$/m);
  writeFileSync(mapPath, '<!-- telos-map: commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa · 2026-10-29 · files 3 -->\n# Map\n\n## Structure\n- `lib/` — code\n\n## Areas\n- core — the core · `lib/a.mjs`\n\n## Find\n- lookup → `lib/a.mjs:1-2`\n');
  const before = readFileSync(join(root, '.telos', 'STATUS.md'), 'utf8');
  const { out } = hook(root);
  assert.match(out, /^Next: plan the first phase with \/telos:plan$/m);
  assert.match(out, /^Awaiting user: decide$/m);
  assert.match(out, /^Blockers: 01-01: broken$/m);
  assert.ok(out.trimEnd().length <= 1200);
  assert.equal(readFileSync(join(root, '.telos', 'STATUS.md'), 'utf8'), before);
});
