import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { editGuard } from '../lib/edit-guard.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const HOOK = fileURLToPath(new URL('../hooks/edit-guard.mjs', import.meta.url));
const T2 = '.telos/phases/01-demo/01-02-second-task.md';
const PROTECTED = ['tsconfig.json', 'eslint.config.*', 'pyproject.toml#tool.ruff', 'config/app.json'];

const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
const write = (root, rel, text) => writeFileSync(join(root, rel), text);
const edit = (root, rel, from, to) => write(root, rel, read(root, rel).replace(from, to));

/** Standard repo; STATUS task 01-02 is in-progress with scope [src/] and Files src/a.ts. */
function repo(t, { profile = 'standard', strict = false, status = 'in-progress' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-edit-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(FIXTURE, root, { recursive: true });
  mkdirSync(join(root, '.git'));
  const cfg = join(root, '.telos/config.json');
  writeFileSync(cfg, JSON.stringify({ ...JSON.parse(readFileSync(cfg, 'utf8')), profile,
    protected_configs: PROTECTED, strict_scope: strict }, null, 2));
  edit(root, T2, 'status: approved', `status: ${status}`);
  return root;
}

const input = (root, file, tool = 'Edit') => ({ tool_name: tool, cwd: root, tool_input: { file_path: file } });
const guard = (root, file, tool) => editGuard(root, input(root, file, tool));
const declare = (root, path) => edit(root, T2, '- src/a.ts (modify)', `- src/a.ts (modify)\n- ${path} (modify)`);

function hook(stdin) {
  const r = spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('in-scope edits are allowed; .telos/ is scope-exempt', (t) => {
  const root = repo(t);
  assert.equal(guard(root, 'src/a.ts').decision, 'allow');
  assert.equal(guard(root, join(root, 'src/new.ts'), 'Write').decision, 'allow');
  assert.equal(guard(root, '.telos/STATUS.md').decision, 'allow');
});

test('protected exact, glob and fragment files are denied unless the in-progress task Files declares them', (t) => {
  const root = repo(t);
  edit(root, T2, 'scope: [src/]', 'scope: ["*"]');
  for (const file of ['tsconfig.json', 'eslint.config.mjs', 'pyproject.toml', 'config/app.json', 'packages/x/tsconfig.json']) {
    const r = guard(root, file);
    assert.equal(r.decision, 'deny', file);
    assert.match(r.reason, /protected config/, file);
    assert.match(r.reason, /Files of 01-02/, file);
  }
  declare(root, 'tsconfig.json');
  assert.equal(guard(root, 'tsconfig.json').decision, 'allow');
  assert.equal(guard(root, 'packages/x/tsconfig.json').decision, 'deny');
  declare(root, 'pyproject.toml');
  assert.equal(guard(root, './pyproject.toml').decision, 'allow');
});

test('a protected file inside the scope but absent from Files is denied', (t) => {
  const root = repo(t);
  assert.equal(guard(root, 'src/tsconfig.json').decision, 'deny');
});

test('outside scope warns with deviation guidance; strict_scope denies', (t) => {
  const warn = guard(repo(t), 'docs/readme.md');
  assert.equal(warn.decision, 'warn');
  assert.match(warn.reason, /outside the scope of 01-02 \(src\/\)/);
  assert.match(warn.reason, /Deviations: docs\/readme\.md — <why>/);
  const deny = guard(repo(t, { strict: true }), 'docs/readme.md');
  assert.equal(deny.decision, 'deny');
  assert.match(deny.reason, /strict_scope/);
  assert.equal(guard(repo(t, { strict: true }), '.telos/LESSONS.md').decision, 'allow');
});

test('without an in-progress task scope is not checked but protection still applies', (t) => {
  const root = repo(t, { status: 'approved' });
  assert.equal(guard(root, 'docs/readme.md').decision, 'allow');
  const r = guard(root, 'tsconfig.json');
  assert.equal(r.decision, 'deny');
  assert.match(r.reason, /no in-progress task/);
  edit(root, '.telos/STATUS.md', 'Task: 01-02', 'Task: none');
  assert.equal(guard(root, 'docs/readme.md').decision, 'allow');
  assert.equal(guard(root, 'tsconfig.json').decision, 'deny');
});

test('minimal profile, missing .telos/ and non-edit tools stay silent', (t) => {
  const minimal = repo(t, { profile: 'minimal' });
  assert.equal(guard(minimal, 'tsconfig.json').decision, 'allow');
  const root = repo(t);
  assert.equal(guard(root, 'tsconfig.json', 'Read').decision, 'allow');
  assert.equal(editGuard(root, { tool_name: 'Bash', cwd: root, tool_input: { command: 'ls' } }).decision, 'allow');
  rmSync(join(root, '.telos'), { recursive: true });
  assert.equal(guard(root, 'tsconfig.json').decision, 'allow');
});

test('absolute, ../, symlink and sibling-prefix aliases cannot bypass matching', (t) => {
  const root = repo(t, { strict: true });
  assert.equal(guard(root, join(root, 'tsconfig.json')).decision, 'deny');
  assert.equal(guard(root, 'src/../tsconfig.json').decision, 'deny');
  assert.equal(editGuard(root, { tool_name: 'Edit', cwd: join(root, 'src'), tool_input: { file_path: '../tsconfig.json' } }).decision, 'deny');
  assert.equal(guard(root, 'srcx/a.ts').decision, 'deny', 'sibling prefix of src/');
  assert.equal(guard(root, '.telosx/a.md').decision, 'deny', 'sibling prefix of .telos/');
  write(root, 'tsconfig.json', '{}\n');
  symlinkSync(join(root, 'tsconfig.json'), join(root, 'src/alias.json'));
  assert.equal(guard(root, 'src/alias.json').decision, 'deny', 'symlink to a protected file');
  mkdirSync(join(root, 'docs'));
  symlinkSync(join(root, 'docs'), join(root, 'src/docs'));
  assert.equal(guard(root, 'src/docs/new.md').decision, 'deny', 'symlinked directory leaving the scope');
  symlinkSync(join(root, 'docs'), join(root, '.telos/docs'));
  assert.equal(guard(root, '.telos/docs/x.md').decision, 'deny', 'a .telos/ alias is not exempt');
});

test('invalid standard config or an unreadable STATUS task fails closed with an actionable error', (t) => {
  const root = repo(t);
  write(root, '.telos/config.json', '{"profile": "standard", "strict_scope": "yes"}\n');
  let r = guard(root, 'src/a.ts');
  assert.equal(r.decision, 'deny');
  assert.match(r.reason, /config\.json.*strict_scope.*fix/is);
  assert.equal(guard(root, '.telos/config.json').decision, 'allow', 'the config itself stays editable');

  const other = repo(t);
  write(other, T2, '---\nid: 01-02\nstatus: [broken\n---\n');
  r = guard(other, 'src/a.ts');
  assert.equal(r.decision, 'deny');
  assert.match(r.reason, /task 01-02/);
  assert.equal(guard(other, T2).decision, 'allow', 'the task file stays editable');
  edit(other, '.telos/STATUS.md', 'Task: 01-02', 'Task: 01-09');
  assert.equal(guard(other, 'src/a.ts').decision, 'deny');
});

test('the hook emits additionalContext for warnings and exit 2 for denials', (t) => {
  const root = repo(t);
  const warn = hook(JSON.stringify(input(root, 'docs/readme.md')));
  assert.equal(warn.code, 0);
  const out = JSON.parse(warn.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /outside the scope of 01-02/);
  const deny = hook(JSON.stringify(input(root, 'tsconfig.json', 'Write')));
  assert.equal(deny.code, 2);
  assert.match(deny.stderr, /^telos edit guard: tsconfig\.json is a protected config/);
  const allow = hook(JSON.stringify(input(root, 'src/a.ts')));
  assert.deepEqual([allow.code, allow.stdout, allow.stderr], [0, '', '']);
});

test('malformed hook input is reported without a crash', () => {
  const r = hook('{not json');
  assert.equal(r.code, 0);
  assert.match(r.stderr, /^telos edit guard: unreadable hook input/);
  assert.doesNotMatch(r.stderr, /at .*\.mjs/);
});
