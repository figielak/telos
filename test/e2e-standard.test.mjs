import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';

// CLI-level proof: this harness plays skills; it does not invoke Claude or an LLM.
const FIXTURE = fileURLToPath(new URL('fixtures/standard-loop/', import.meta.url));
const HOOKS = fileURLToPath(new URL('../hooks/', import.meta.url));
const PHASE = '.telos/phases/01-greeting';
const CONTEXT = `${PHASE}/01-CONTEXT.md`;
const STATUS = '.telos/STATUS.md';
const ROADMAP = '.telos/ROADMAP.md';
const HISTORY = '.telos/HISTORY.md';
const GATE = 'Requires standard profile. Switch with /telos:profile standard.\n';
const SID = 'standard-loop-session';
const FEATURES = ['greet', 'farewell', 'wave', 'independent'];
const CHECKS = { test: 'node src/index.mjs test', types: 'node src/index.mjs types {files}',
  format: 'node src/index.mjs format {files}' };
const taskPath = (n) => `${PHASE}/01-0${n}-${FEATURES[n - 1]}.md`;
const sourcePath = (n) => `src/${FEATURES[n - 1]}.mjs`;
const read = (root, path) => readFileSync(join(root, path), 'utf8');
const write = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const context = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const code = await main(args, { cwd: root, stdout: out, stderr: err });
    if (args[0] === 'ctx') assert.ok(out.text.trimEnd().length <= 6000, args.join(' '));
    return { code, stdout: out.text, stderr: err.text };
  } finally {
    if (context !== undefined) process.env.NODE_TEST_CONTEXT = context;
  }
}

async function ok(root, ...args) {
  const r = await telos(root, ...args);
  assert.equal(r.code, 0, `telos ${args.join(' ')}: ${r.stdout}${r.stderr}`);
  return r.stdout;
}

function commit(root, subject, paths) {
  git(root, 'add', '--', ...paths);
  git(root, 'commit', '-q', '-m', subject, '-m', '- Exercise the standard workflow in an isolated fixture');
  return git(root, 'rev-parse', 'HEAD').trim();
}

function hook(root, name, payload = {}, env = {}) {
  const r = spawnSync(process.execPath, [join(HOOKS, `${name}.mjs`)], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    input: JSON.stringify({ cwd: root, session_id: SID, ...payload }),
    env: { ...process.env, TELOS_CONTEXT_WINDOW: '', ...env },
  });
  assert.ifError(r.error);
  if (name === 'session-start') assert.ok(r.stdout.trimEnd().length <= 1200);
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const editEvent = (path, extra = {}) => ({ tool_name: 'Edit', tool_input: { file_path: path }, ...extra });
const additionalContext = (r) => r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '';
const silent = (r) => assert.deepEqual(r, { code: 0, stdout: '', stderr: '' });
const metadata = (root, count = 2) => Object.fromEntries(
  [STATUS, ROADMAP, HISTORY, CONTEXT, ...Array.from({ length: count }, (_, i) => taskPath(i + 1))]
    .map((path) => [path, read(root, path)]));
const state = (root, count = 2) => ({ head: git(root, 'rev-parse', 'HEAD'),
  dirty: git(root, 'status', '--porcelain'), metadata: metadata(root, count) });

async function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'telos-standard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(FIXTURE, root, { recursive: true });
  git(root, 'init', '-q');
  for (const [key, value] of [['user.name', 'Telos test'], ['user.email', 'test@example.com'],
    ['commit.gpgsign', 'false'], ['tag.gpgsign', 'false'], ['core.hooksPath', join(root, '.git/hooks')]]) {
    git(root, 'config', key, value);
  }
  commit(root, 'build: initialize fixture', ['package.json', 'README.md', 'src/index.mjs']);
  await ok(root, 'init', '--profile', 'minimal', '--checks', JSON.stringify(CHECKS));
  const config = JSON.parse(read(root, '.telos/config.json'));
  const claude = read(root, 'CLAUDE.md');
  await ok(root, 'profile', 'standard');
  assert.deepEqual(JSON.parse(read(root, '.telos/config.json')), { ...config, profile: 'standard' });
  assert.equal(read(root, 'CLAUDE.md'), claude);
  assert.match(read(root, HISTORY), /profile telos: minimal → standard/);
  commit(root, 'docs(telos): initialize standard', ['.telos/config.json', '.telos/PROJECT.md',
    '.telos/MAP.md', ROADMAP, STATUS, HISTORY, '.telos/LESSONS.md', 'CLAUDE.md', '.gitignore']);
  return root;
}

function context(proposed = false) {
  return `# 01 · greeting
## Goal
Ship greeting helpers.
## Decisions
- D-01${proposed ? ' [proposed]' : ''}: Export each message as a pure public function.
## Constraints
- No dependencies.
## Open questions
- none
## Carried over
- none
## Links
- README.md
`;
}

/** Draft content as plan would; preserve generated metadata and change no status by hand. */
function draft(root, n, depends) {
  const body = `## Goal
Add the ${FEATURES[n - 1]} message.
## Read first
- src/index.mjs:1-8 (fixture checks)
## Files
- ${sourcePath(n)} (create)
## Constraints
- No dependencies; keep message functions pure.
## Tests (write first)
- The fixture check validates the ${FEATURES[n - 1]} message.
## Steps
1. Run the fixture check before implementing the message.
2. Implement the message and run acceptance.
3. Record the result and commit.
## Acceptance
- [ ] all listed tests pass
- [ ] \`node src/index.mjs test ${FEATURES[n - 1]}\` → exit 0
- [ ] README describes the standard fixture.
## Result
`;
  const text = read(root, taskPath(n));
  write(root, taskPath(n), text.replace('depends: []', `depends: [${depends.join(', ')}]`)
    .replace('decisions: []', 'decisions: [D-01]').replace('scope: []', `scope: [${sourcePath(n)}]`)
    .replace(/## Goal\n[\s\S]*$/, body));
}

async function plan(root, { proposed = false, count = 2 } = {}) {
  await ok(root, 'roadmap', 'add', 'greeting', 'greeting helpers', 'messages verified');
  await ok(root, 'status', 'set', 'phase=01-greeting', 'task=none', 'next=/telos:discuss');
  assert.match(await ok(root, 'ctx', 'discuss'), /^Mode: write/m);
  write(root, CONTEXT, context(proposed));
  assert.match(await ok(root, 'ctx', 'plan', '01'), /D-01/);
  for (let n = 1; n <= count; n++) {
    await ok(root, 'task', 'new', '01', FEATURES[n - 1], `Add ${FEATURES[n - 1]}`);
    draft(root, n, n > 1 && n < 4 ? [`01-0${n - 1}`] : []);
  }
  assert.match(await ok(root, 'lint-plan', '01'), new RegExp(`^ok: ${count} tasks`));
  await ok(root, 'roadmap', 'set', '01', 'drafted');
  await ok(root, 'status', 'set', 'next=/telos:approve');
}

async function approve(root, count = 2) {
  const preview = await ok(root, 'ctx', 'approve');
  assert.match(preview, /^Lint: ok:/m);
  if (/^Blocked:\n- /m.test(preview)) return false;
  await ok(root, 'task', 'set', ...Array.from({ length: count }, (_, i) => `01-0${i + 1}`), 'status=approved');
  await ok(root, 'roadmap', 'set', '01', 'active');
  await ok(root, 'status', 'set', 'task=01-01', 'next=/telos:do');
  commit(root, 'docs(telos): plan phase 01-greeting', [CONTEXT, ROADMAP, STATUS,
    ...Array.from({ length: count }, (_, i) => taskPath(i + 1))]);
  git(root, 'tag', 'telos/01-start');
  return true;
}

async function doTask(root, n) {
  const id = `01-0${n}`;
  assert.match(await ok(root, 'ctx', 'do', id), new RegExp(`^Task: ${id} \\[approved\\]`));
  await ok(root, 'task', 'set', id, 'status=in-progress');
  await ok(root, 'status', 'set', `task=${id}`, `next=finish ${id}`);
  assert.equal((await telos(root, 'accept', id)).code, 1, 'RED: required message is not implemented');
  const messages = ['Hello', 'Bye', 'Hey', 'Welcome'];
  write(root, sourcePath(n), `export const message = (name) => \`${messages[n - 1]}, \${name}!\`;\n`);
  const acceptance = await ok(root, 'accept', id);
  assert.match(acceptance, new RegExp(`accept ${id}: PASS`));
  assert.match(acceptance, /MANUAL/);
  write(root, taskPath(n), read(root, taskPath(n)).replaceAll('- [ ] ', '- [x] ')
    .replace(/## Result\n[\s\S]*$/, `## Result\n- Added ${FEATURES[n - 1]}; fixture checks pass.\n- README reviewed.\nDeviations: none\n`));
  await ok(root, 'task', 'set', id, 'status=done');
  await ok(root, 'status', 'add', 'recent', `${id} done: ${FEATURES[n - 1]}`);
  await ok(root, 'status', 'set', 'task=none', 'next=close phase 01 (/telos:done)');
  return commit(root, `feat(${id}): add ${FEATURES[n - 1]}`, [sourcePath(n), taskPath(n), STATUS]);
}

async function completed(t, count = 2) {
  const root = await repo(t);
  await plan(root, { count });
  assert.equal(await approve(root, count), true);
  const hashes = [];
  for (let n = 1; n <= count; n++) hashes.push(await doTask(root, n));
  return { root, hashes };
}

/** Play done; manualVerified is explicit review evidence, never inferred from accept's exit. */
async function close(root, { manualVerified = false } = {}) {
  const preview = await ok(root, 'ctx', 'done');
  if (/^REFUSED:|^Close: blocked/m.test(preview)) return 'blocked';
  if ((await telos(root, 'check', '--level', 'full')).code !== 0) return 'check failed';
  const ids = [...preview.matchAll(/telos accept (\d{2}-\d{2})/g)].map((m) => m[1]);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    if ((await telos(root, 'accept', id)).code !== 0) return 'accept failed';
  }
  if (!manualVerified) return 'manual unverified';
  if (!preview.includes('→ HISTORY [promoted]')) {
    await ok(root, 'history', 'add', 'decision', '01', 'D-01: Export each message as a pure public function.');
    write(root, CONTEXT, read(root, CONTEXT).replace('public function.', 'public function. → HISTORY'));
  }
  await ok(root, 'history', 'add', 'phase', '01', 'closed 01-greeting: messages verified');
  await ok(root, 'roadmap', 'set', '01', 'done');
  await ok(root, 'status', 'set', 'task=none', 'next=/telos:plan');
  await ok(root, 'status', 'add', 'recent', '01-greeting closed: messages verified');
  commit(root, 'docs(telos): close phase 01-greeting', [CONTEXT, HISTORY, ROADMAP, STATUS]);
  return 'closed';
}

/** Play undo only after the supplied confirmation matches every previewed hash, in order. */
async function undo(root, id, confirmed = []) {
  const preview = await ok(root, 'ctx', 'undo', id);
  assert.doesNotMatch(preview, /^REFUSED:/);
  const hashes = /^Revert order: (.+)$/m.exec(preview)[1].split(' ');
  if (hashes.join(' ') !== confirmed.join(' ')) return { stopped: 'confirmation' };
  for (const hash of hashes) {
    const r = spawnSync('git', ['-C', root, 'revert', '--no-commit', hash], { encoding: 'utf8' });
    assert.ifError(r.error);
    if (r.status !== 0) {
      const conflicts = git(root, 'diff', '--name-only', '--diff-filter=U').trim().split('\n').filter(Boolean);
      if (conflicts.some((path) => !path.startsWith('.telos/'))) return { stopped: 'conflict', conflicts };
      assert.ok(conflicts.length > 0, r.stderr);
      git(root, 'restore', '--source=HEAD', '--staged', '--worktree', '--', ...conflicts);
      git(root, 'revert', '--quit');
    }
  }
  const paths = /^Telos files in these commits: (.+)$/m.exec(preview)[1].split(', ');
  git(root, 'restore', '--source=HEAD', '--staged', '--worktree', '--', ...paths);
  if ((await telos(root, 'check', '--level', 'full')).code !== 0) return { stopped: 'check failed' };
  await ok(root, 'task', 'set', id, 'status=reverted');
  const blockedLine = /^Block after undo: (.+)$/m.exec(preview)[1];
  const blocked = blockedLine === 'none' ? [] : blockedLine.split(', ');
  if (blocked.length) await ok(root, 'task', 'set', ...blocked, 'status=blocked');
  if (/^Phase after undo: reopen/m.test(preview)) await ok(root, 'roadmap', 'set', '01', 'active');
  await ok(root, 'status', 'set', `next=/telos:revise <notes> to redo ${id}`,
    ...(blocked.length ? [`blockers=${blocked.join(', ')}: depend on reverted ${id}`] : []));
  await ok(root, 'history', 'add', 'revert', id, `reverted ${id}: fixture message (${hashes.length} commits)`);
  const changed = git(root, 'diff', '--name-only').trim().split('\n').filter(Boolean);
  assert.ok(changed.every((path) => path.startsWith('.telos/')));
  commit(root, `revert(${id}): undo fixture message`, changed);
  return { stopped: null, blocked };
}

test('standard lifecycle closes with history; confirmed latest-task undo reopens and preserves earlier work', async (t) => {
  const root = await repo(t);
  await plan(root);
  assert.equal(await approve(root), true);
  assert.match(await ok(root, 'ctx', 'do', '01-02'), /^REFUSED: 01-02 depends on 01-01 \[approved\]/);
  await doTask(root, 1);
  const latest = await doTask(root, 2);
  const beforeCheck = state(root);
  assert.match(await ok(root, 'ctx', 'check'), /^Accept: telos accept 01-01 · telos accept 01-02$/m);
  assert.match(await ok(root, 'check', '--level', 'full'), /PASS/);
  assert.deepEqual(state(root), beforeCheck, 'check is read-only');
  assert.match(read(root, 'README.md'), /standard fixture/);
  assert.equal(await close(root, { manualVerified: true }), 'closed');
  assert.match(read(root, ROADMAP), /^- 01-greeting \[done\]/m);
  assert.match(read(root, HISTORY), /decision 01: D-01:/);
  assert.match(read(root, HISTORY), /phase 01: closed 01-greeting/);
  assert.match(await ok(root, 'ctx', 'done'), /^REFUSED: .*already done/);
  const before = state(root);
  const preview = await ok(root, 'ctx', 'undo', '01-02');
  assert.ok(preview.includes(latest));
  assert.match(preview, /src\/farewell\.mjs +\|/);
  assert.match(preview, /^Phase after undo: reopen/m);
  assert.deepEqual(await undo(root, '01-02'), { stopped: 'confirmation' });
  assert.deepEqual(await undo(root, '01-02', [latest.slice(0, 7)]), { stopped: 'confirmation' });
  assert.deepEqual(state(root), before);
  assert.deepEqual(await undo(root, '01-02', [latest]), { stopped: null, blocked: [] });
  assert.equal(existsSync(join(root, sourcePath(2))), false);
  assert.equal(read(root, taskPath(1)), before.metadata[taskPath(1)]);
  assert.match(read(root, taskPath(2)), /^status: reverted/m);
  assert.match(read(root, ROADMAP), /^- 01-greeting \[active\]/m);
  assert.equal(read(root, STATUS), before.metadata[STATUS]
    .replace('Next: /telos:plan', 'Next: /telos:revise <notes> to redo 01-02'));
  for (const line of before.metadata[HISTORY].split('\n').filter((s) => /^- \d{4}-/.test(s))) {
    assert.ok(read(root, HISTORY).includes(line), line);
  }
  assert.equal((read(root, HISTORY).match(/revert 01-02:/g) ?? []).length, 1);
  assert.match(await ok(root, 'ctx', 'undo', '01-02'), /^REFUSED: 01-02 is already reverted/);
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.equal(git(root, 'rev-list', '--count', 'telos/01-start..HEAD').trim(), '4');
});

test('proposed decisions block approval and execution until explicitly confirmed', async (t) => {
  const root = await repo(t);
  await plan(root, { proposed: true });
  const before = state(root);
  assert.match(await ok(root, 'ctx', 'approve'), /^- 01-01: D-01 is proposed$/m);
  assert.equal(await approve(root), false);
  assert.deepEqual(state(root), before);
  // Even a separately approved task cannot bypass the execution gate.
  await ok(root, 'task', 'set', '01-01', 'status=approved');
  assert.equal(await ok(root, 'ctx', 'do', '01-01'), 'REFUSED: decision D-01 awaits the user\n');
  write(root, CONTEXT, context());
  assert.match(await ok(root, 'ctx', 'do', '01-01'), /^Task: 01-01 \[approved\]/);
});

test('failed full checks and unverified manual acceptance leave close active without history', async (t) => {
  const { root } = await completed(t);
  const before = state(root);
  write(root, '.telos/.cache/fail-test', 'fail\n');
  const failed = await telos(root, 'check', '--level', 'full');
  assert.equal(failed.code, 1);
  assert.match(failed.stdout, /test:FAIL/);
  assert.equal(await close(root, { manualVerified: true }), 'check failed');
  assert.deepEqual(state(root), before);
  rmSync(join(root, '.telos/.cache/fail-test'));
  assert.match(await ok(root, 'accept', '01-01'), /MANUAL/);
  assert.equal(await close(root), 'manual unverified');
  assert.deepEqual(state(root), before);
  assert.doesNotMatch(read(root, HISTORY), /phase 01:|decision 01:/);
});

test('undo prerequisite warns transitively, then blocks only dependents and retains unrelated completed tasks', async (t) => {
  const { root, hashes } = await completed(t, 4);
  const before = state(root, 4);
  const preview = await ok(root, 'ctx', 'undo', '01-01');
  assert.match(preview, /^Dependents \(transitive, never reverted\): 01-02 \[done\], 01-03 \[done\]$/m);
  assert.match(preview, /^Block after undo: 01-02, 01-03$/m);
  assert.deepEqual(state(root, 4), before);
  assert.deepEqual(await undo(root, '01-01', [hashes[0]]), { stopped: null, blocked: ['01-02', '01-03'] });
  assert.equal(existsSync(join(root, sourcePath(1))), false);
  for (const n of [2, 3]) {
    assert.match(read(root, taskPath(n)), /^status: blocked/m);
    assert.ok(existsSync(join(root, sourcePath(n))), 'dependent code is never reverted');
  }
  assert.equal(read(root, taskPath(4)), before.metadata[taskPath(4)]);
  assert.match(read(root, STATUS), /^Blockers: 01-02, 01-03: depend on reverted 01-01$/m);
  assert.match(read(root, STATUS), /01-04 done: independent/);
  assert.match(read(root, HISTORY), /revert 01-01:/);
  assert.equal(git(root, 'status', '--porcelain'), '');
});

test('code conflict during undo records no reverted state, blocked dependents or successful history', async (t) => {
  const { root, hashes } = await completed(t);
  write(root, sourcePath(1), 'export const message = (name) => `Changed, ${name}!`;\n');
  commit(root, 'fix(quick): change greeting after task', [sourcePath(1)]);
  const before = metadata(root);
  const head = git(root, 'rev-parse', 'HEAD');
  const r = await undo(root, '01-01', [hashes[0]]);
  assert.equal(r.stopped, 'conflict');
  assert.ok(r.conflicts.includes(sourcePath(1)));
  // Git can leave inverse metadata/conflict markers; the skill stops before recording success.
  for (const [path, text] of Object.entries(before)) assert.equal(git(root, 'show', `HEAD:${path}`), text);
  assert.equal(read(root, HISTORY), before[HISTORY]);
  assert.equal(read(root, taskPath(2)), before[taskPath(2)]);
  assert.doesNotMatch(read(root, taskPath(1)), /^status: reverted/m);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.match(git(root, 'diff', '--name-only', '--diff-filter=U'), /src\/greet\.mjs/);
  assert.doesNotMatch(read(root, HISTORY), /revert 01-01:/);
});

test('failed post-revert checks stop before undo state and history changes', async (t) => {
  const { root, hashes } = await completed(t);
  write(root, '.telos/.cache/fail-test', 'fail\n');
  const before = metadata(root);
  const head = git(root, 'rev-parse', 'HEAD');
  assert.deepEqual(await undo(root, '01-01', [hashes[0]]), { stopped: 'check failed' });
  assert.deepEqual(metadata(root), before);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.match(git(root, 'diff', '--cached', '--name-only'), /src\/greet\.mjs/);
  assert.doesNotMatch(read(root, HISTORY), /revert 01-01:/);
});

test('lessons and approaches reach their bundles; edit, delete, Stop and compact hooks use subprocess payloads', async (t) => {
  const root = await repo(t);
  write(root, '.telos/LESSONS.md', '# Lessons\n- [src/] Keep messages pure (quick)\n- [docs/] Use concrete examples (quick)\n');
  await ok(root, 'history', 'add', 'remove', 'quick', 'Shared state leaked', '--approach', 'Global mutable cache');
  await ok(root, 'history', 'add', 'remove', 'quick', 'Legacy code removed', '--path', 'src/legacy');
  const lesson = await ok(root, 'ctx', 'lesson');
  assert.match(lesson, /Lessons: 2\/20/);
  const planning = await ok(root, 'ctx', 'plan');
  assert.match(planning, /Keep messages pure/);
  assert.match(planning, /Use concrete examples/);
  assert.match(planning, /Global mutable cache/);
  const quick = await ok(root, 'ctx', 'quick', '--area', 'src/greet.mjs');
  assert.match(quick, /Keep messages pure/);
  assert.match(quick, /Global mutable cache/);
  assert.doesNotMatch(quick, /Use concrete examples/);
  assert.doesNotMatch(await ok(root, 'ctx', 'quick'), /Keep messages pure/);
  await plan(root);
  assert.equal(await approve(root), true);
  await ok(root, 'task', 'set', '01-01', 'status=in-progress');
  assert.doesNotMatch(await ok(root, 'ctx', 'do'), /Use concrete examples|Global mutable cache/);
  silent(hook(root, 'edit-guard', editEvent(sourcePath(1))));
  const protectedEdit = hook(root, 'edit-guard', editEvent('tsconfig.json'));
  assert.equal(protectedEdit.code, 2);
  assert.match(protectedEdit.stderr, /protected config/);
  const warning = hook(root, 'edit-guard', editEvent('src/legacy/new.mjs'));
  assert.equal(warning.code, 0);
  assert.match(additionalContext(warning), /outside the scope/);
  assert.match(additionalContext(warning), /delete-zone/i);
  assert.match(additionalContext(warning), /--path 'src\/legacy'/);
  assert.doesNotMatch(additionalContext(hook(root, 'edit-guard', editEvent('src/legacy/new.mjs'))), /delete-zone/i);
  await ok(root, 'history', 'add', 'revert', 'quick', 'Restore on user request', '--path', 'src/legacy');
  assert.doesNotMatch(additionalContext(hook(root, 'edit-guard', editEvent('src/legacy/other.mjs'))), /delete-zone/i);
  assert.match(await ok(root, 'ctx', 'quick', '--area', 'src/'), /Global mutable cache/);
  const before = metadata(root);
  for (const path of ['src/index.mjs', 'src/index.mjs', 'README.md']) {
    silent(hook(root, 'edited', editEvent(path, { tool_response: { success: true } })));
  }
  silent(hook(root, 'pre-compact', { hook_event_name: 'PreCompact', trigger: 'auto' }));
  const restored = hook(root, 'session-start', { source: 'compact' });
  assert.equal(restored.code, 0);
  assert.match(restored.stdout, /^Before compaction: task 01-01 · edited: README\.md, src\/index\.mjs$/m);
  assert.doesNotMatch(hook(root, 'session-start', { source: 'compact', session_id: 'foreign' }).stdout, /Before compaction/);
  assert.doesNotMatch(hook(root, 'session-start', { source: 'startup' }).stdout, /Before compaction/);
  write(root, '.telos/.cache/fail-types', 'fail\n');
  const failed = hook(root, 'stop');
  assert.equal(failed.code, 2);
  assert.match(failed.stderr, /types FAIL/);
  assert.ok(failed.stderr.split('\n').filter((line) => line.startsWith('  ')).length <= 10);
  assert.ok(failed.stderr.length <= 2501);
  silent(hook(root, 'stop', { stop_hook_active: true }));
  rmSync(join(root, '.telos/.cache/fail-types'));
  silent(hook(root, 'stop'));
  const log = read(root, '.telos/.cache/checks.jsonl');
  const rows = log.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(rows.map((row) => row.mode), ['format', 'types', 'format', 'types']);
  for (const row of rows) assert.deepEqual(row.files, ['./README.md', './src/index.mjs']);
  silent(hook(root, 'stop'));
  assert.equal(read(root, '.telos/.cache/checks.jsonl'), log, 'successful Stop consumes the batch');
  write(root, '.telos/.cache/transcript.jsonl', JSON.stringify({ type: 'assistant', message: {
    role: 'assistant', content: [], usage: { input_tokens: 850 },
  } }) + '\n');
  const usage = editEvent(sourcePath(1), { transcript_path: join(root, '.telos/.cache/transcript.jsonl') });
  const hint = hook(root, 'edit-guard', usage, { TELOS_CONTEXT_WINDOW: '1000' });
  assert.equal(hint.code, 0);
  assert.match(additionalContext(hint), /85% hint/);
  silent(hook(root, 'edit-guard', usage, { TELOS_CONTEXT_WINDOW: '1000' }));
  assert.deepEqual(metadata(root), before, 'hooks never change planning state');
});

test('downgrade after history retains data, suppresses standard hooks and returns exact gates', async (t) => {
  const { root } = await completed(t);
  assert.equal(await close(root, { manualVerified: true }), 'closed');
  write(root, '.telos/LESSONS.md', '# Lessons\n- [src/] Keep messages pure (01-01)\n');
  await ok(root, 'history', 'add', 'remove', '01-01', 'Shared state leaked', '--approach', 'Global mutable cache');
  silent(hook(root, 'edited', editEvent('src/index.mjs', { tool_response: { success: true } })));
  silent(hook(root, 'pre-compact'));
  const savedSession = read(root, '.telos/.cache/session');
  const savedChecks = read(root, '.telos/.cache/checks.jsonl');
  const config = JSON.parse(read(root, '.telos/config.json'));
  const preserved = Object.fromEntries([CONTEXT, '.telos/LESSONS.md', 'CLAUDE.md', ROADMAP,
    taskPath(1), taskPath(2)].map((path) => [path, read(root, path)]));
  const history = read(root, HISTORY);
  await ok(root, 'profile', 'minimal');
  assert.deepEqual(JSON.parse(read(root, '.telos/config.json')), { ...config, profile: 'minimal' });
  for (const [path, text] of Object.entries(preserved)) assert.equal(read(root, path), text);
  for (const line of history.split('\n').filter((s) => /^- /.test(s))) assert.ok(read(root, HISTORY).includes(line));
  assert.match(read(root, HISTORY), /profile telos: standard → minimal/);
  const after = read(root, HISTORY);
  for (const name of ['discuss', 'lesson', 'check', 'done', 'undo']) assert.equal(await ok(root, 'ctx', name), GATE);
  for (const args of [['check', '--level', 'full'], ['history', 'add', 'quick', 'quick', 'must not write']]) {
    const r = await telos(root, ...args);
    assert.equal(r.code, 1);
    assert.equal(r.stdout + r.stderr, args[0] === 'history' ? `telos history: ${GATE}` : GATE);
  }
  assert.equal(read(root, HISTORY), after);
  for (const args of [['plan'], ['quick', '--area', 'src/']]) {
    assert.doesNotMatch(await ok(root, 'ctx', ...args), /Keep messages pure|Global mutable cache/);
  }
  silent(hook(root, 'edit-guard', editEvent('tsconfig.json')));
  silent(hook(root, 'edited', editEvent('README.md', { tool_response: { success: true } })));
  silent(hook(root, 'stop'));
  silent(hook(root, 'pre-compact'));
  assert.equal(read(root, '.telos/.cache/session'), savedSession);
  assert.equal(read(root, '.telos/.cache/checks.jsonl'), savedChecks);
  const start = hook(root, 'session-start', { source: 'compact' });
  assert.match(start.stdout, /^Profile: minimal$/m);
  assert.doesNotMatch(start.stdout, /Before compaction/);
});

test('large context and session outputs stay capped while retaining workflow pointers', async (t) => {
  const { root } = await completed(t);
  write(root, CONTEXT, context() + `\n${'- extra context detail\n'.repeat(500)}`);
  write(root, '.telos/LESSONS.md', '# Lessons\n' + Array.from({ length: 20 }, (_, i) =>
    `- [src/] Lesson ${i}: ${'keep message pure '.repeat(8)} (quick)\n`).join(''));
  for (const args of [['init'], ['profile'], ['status'], ['map'], ['lesson'], ['plan'], ['approve'], ['do', '01-01'],
    ['discuss'], ['check'], ['done'], ['quick', '--area', 'src/'], ['undo']]) {
    await ok(root, 'ctx', ...args);
  }
  await ok(root, 'status', 'set', `awaiting=${'01:D-02 '.repeat(300)}`, `blockers=${'reason '.repeat(300)}`);
  const start = hook(root, 'session-start', { source: 'startup' });
  assert.equal(start.code, 0);
  assert.match(start.stdout, /^Awaiting user:/);
  assert.match(start.stdout, /truncated by telos ctx/);
});
