import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { UsageError } from '../lib/errors.mjs';
import { loadTask, nextTask, phaseDir, phaseTasks, sections, TaskError } from '../lib/tasks.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const DEMO = join('.telos', 'phases', '01-demo');

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'telos-tasks-'));
  cpSync(FIXTURE, root, { recursive: true });
  mkdirSync(join(root, '.git'));
  return root;
}

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

const read = (root, file) => readFileSync(join(root, DEMO, file), 'utf8');
const task = (id, status, depends = []) => ({ id, meta: { status, depends } });

test('sections splits on ## headings and keeps HTML comments in the body', () => {
  const s = sections('---\nid: 01-01\n---\n## Goal\nDo it.\n\n## Tests (write first)      <!-- type: code only -->\n<!-- note -->\n- a\n');
  assert.deepEqual([...s.keys()], ['Goal', 'Tests']);
  assert.equal(s.get('Goal'), 'Do it.');
  assert.equal(s.get('Tests'), '<!-- note -->\n- a');
});

test('loadTask returns meta, sections and path from the fixture', () => {
  const root = repo();
  const t = loadTask(root, '01-02');
  assert.equal(t.id, '01-02');
  assert.equal(t.nn, '01');
  assert.equal(t.meta.status, 'approved');
  assert.deepEqual(t.meta.depends, ['01-01']);
  assert.match(t.sections.get('Files'), /src\/a\.ts/);
  assert.equal(t.path, join(root, DEMO, '01-02-second-task.md'));
});

test('a malformed id is a usage error, an unknown id a task error', () => {
  const root = repo();
  assert.throws(() => loadTask(root, '2-1'), UsageError);
  assert.throws(() => loadTask(root, '01-09'), (e) => e instanceof TaskError && e.message === 'no task 01-09');
});

test('two dirs for one phase number are an error naming both', () => {
  const root = repo();
  mkdirSync(join(root, '.telos', 'phases', '01-other'));
  assert.throws(() => phaseDir(root, '01'), /01-demo.*01-other/);
});

test('a missing phases/ or phase dir yields no tasks', () => {
  const root = repo();
  assert.deepEqual(phaseTasks(root, '02'), []);
  rmSync(join(root, '.telos', 'phases'), { recursive: true });
  assert.deepEqual(phaseTasks(root, '01'), []);
  assert.equal(phaseDir(root, '01'), null);
});

test('phaseTasks lists the phase sorted by id', () => {
  assert.deepEqual(phaseTasks(repo(), '01').map((t) => t.id), ['01-01', '01-02', '01-03']);
});

test('nextTask prefers in-progress, skips unmet depends, null when done', () => {
  assert.equal(nextTask([task('01-01', 'approved'), task('01-02', 'in-progress')]).id, '01-02');
  assert.equal(nextTask([task('01-01', 'blocked'), task('01-02', 'approved', ['01-01']), task('01-03', 'approved')]).id, '01-03');
  assert.equal(nextTask([task('01-01', 'done'), task('01-02', 'approved', ['01-01'])]).id, '01-02');
  assert.equal(nextTask([task('01-01', 'done'), task('01-02', 'done')]), null);
  assert.equal(nextTask(phaseTasks(repo(), '01')).id, '01-02');
});

test('task new renders the template with the next id', async () => {
  const root = repo();
  const r = await telos(root, 'task', 'new', '01', 'check-x', 'Check X: edge #1');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /01-04-check-x\.md/);
  const t = loadTask(root, '01-04');
  assert.equal(t.meta.title, 'Check X: edge #1');
  assert.equal(t.meta.status, 'draft');
  assert.doesNotMatch(t.text, /\{\{/);
});

test('task new creates the phase dir from the ROADMAP name', async () => {
  const root = repo();
  const r = await telos(root, 'task', 'new', '02', 'first', 'First');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(join(root, '.telos', 'phases', '02-next', '02-01-first.md')));
});

test('task new without a ROADMAP line fails; bad arguments are usage errors', async () => {
  const root = repo();
  const r = await telos(root, 'task', 'new', '03', 'x', 'X');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no phase 03 in ROADMAP\.md/);
  assert.equal((await telos(root, 'task', 'new', '01', 'Not_Kebab', 'X')).code, 2);
  assert.equal((await telos(root, 'task', 'new', '1', 'x', 'X')).code, 2);
  assert.equal((await telos(root, 'task', 'new', '01', 'x')).code, 2);
});

test('task set changes several tasks and keeps comments and alignment', async () => {
  const root = repo();
  const before = read(root, '01-01-first-task.md');
  const r = await telos(root, 'task', 'set', '01-01', '01-02', 'status=in-progress');
  assert.equal(r.code, 0, r.stderr);
  const after = read(root, '01-01-first-task.md').split('\n');
  const changed = after.filter((l, i) => l !== before.split('\n')[i]);
  assert.deepEqual(changed, ['status: in-progress # draft | approved | in-progress | done | blocked | reverted']);
  assert.match(read(root, '01-01-first-task.md'), /^effort: normal      # normal \| hard$/m);
  assert.equal(loadTask(root, '01-02').meta.status, 'in-progress');
});

test('task set rejects unknown statuses, other keys and unknown ids without writing', async () => {
  const root = repo();
  const bad = await telos(root, 'task', 'set', '01-01', 'status=finished');
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /draft, approved, in-progress, done, blocked, reverted/);
  assert.equal((await telos(root, 'task', 'set', '01-01', 'effort=hard')).code, 2);
  const before = read(root, '01-02-second-task.md');
  const missing = await telos(root, 'task', 'set', '01-02', '01-09', 'status=done');
  assert.equal(missing.code, 1);
  assert.equal(read(root, '01-02-second-task.md'), before);
});

test('task rm removes only draft tasks', async () => {
  const root = repo();
  const r = await telos(root, 'task', 'rm', '01-02');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /only draft/);
  assert.ok(existsSync(join(root, DEMO, '01-02-second-task.md')));
  assert.equal((await telos(root, 'task', 'rm', '01-03')).code, 0);
  assert.deepEqual(readdirSync(join(root, DEMO)).sort(), ['01-01-first-task.md', '01-02-second-task.md']);
});

test('unsupported frontmatter names the file and line', async () => {
  const root = repo();
  const file = join(root, DEMO, '01-02-second-task.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('critical: false', 'critical: |'));
  assert.throws(() => loadTask(root, '01-02'), /01-02-second-task\.md: frontmatter line 6/);
  const r = await telos(root, 'task', 'set', '01-02', 'status=done');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /frontmatter line 6/);
});

test('telos <command> --help prints its usage even without .telos/', async () => {
  const root = mkdtempSync(join(tmpdir(), 'telos-tasks-'));
  const r = await telos(root, 'task', '--help');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^Usage: telos task new <NN>/);
});
