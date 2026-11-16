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
