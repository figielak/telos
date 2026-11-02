import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { calibrate, formatTable } from '../bench/calibrate.mjs';
import { loadManifest } from '../bench/lib/manifest.mjs';

const CLI = fileURLToPath(new URL('../bench/calibrate.mjs', import.meta.url));
const REAL = fileURLToPath(new URL('../bench/corpus/', import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function tmp(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function commitAll(root, subject) {
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', subject);
  return git(root, 'rev-parse', 'HEAD').trim();
}

// Acceptance contract (PROTOCOL §4.2): exit 0 accepted, 1 behavioural check fails, 2 regression check fails.
// The fixture "behaviour" is `greet.txt` containing `hello`; `old.txt` is the regression subject.
const SCRIPT = `import { existsSync, readFileSync } from 'node:fs';
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8').trim() : null);
if (read('old.txt') !== 'old') process.exit(2);
process.exit(read('greet.txt') === 'hello' ? 0 : 1);
`;

/** Source repo: a start commit, a reference commit adding the behaviour (plus a second commit so the diff is `ref^1..ref`). */
function world(t) {
  const base = tmp(t, 'telos-bench-cal-');
  const src = join(base, 'src');
  mkdirSync(src);
  git(src, 'init', '-q', '-b', 'main');
  git(src, 'config', 'user.email', 't@example.com');
  git(src, 'config', 'user.name', 'T');
  git(src, 'config', 'commit.gpgsign', 'false');
  put(src, 'old.txt', 'old\n');
  put(src, 'README.md', 'repo\n');
  const start = commitAll(src, 'start');
  put(src, 'greet.txt', 'hello\n');
  const reference = commitAll(src, 'reference');
  return { base, src, start, reference };
}

function manifestDir(t, { start, reference, src }, { script = SCRIPT, alt = null, extra = {} } = {}) {
  const dir = tmp(t, 'telos-bench-calman-');
  put(dir, 'r1/1111111111111111111111111111111111111111/CLAUDE.md', 'b\n');
  put(dir, 'r1/acceptance/t-one.mjs', script);
  if (alt) for (const [name, patch] of Object.entries(alt)) put(dir, `r1/acceptance/t-one.alt/${name}.patch`, patch);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    repos: [{ id: 'r1', url: src }],
    tasks: [{ id: 't-one', repo: 'r1', start, reference, type: 'single', prompt: 'Add a greeting.', expectedPaths: ['greet.txt'],
      acceptance: 'r1/acceptance/t-one.mjs', b: 'r1/1111111111111111111111111111111111111111/CLAUDE.md', ...extra }],
  }));
  return dir;
}

test('fails at start and passes at the reference → OK', (t) => {
  const w = world(t);
  const dir = manifestDir(t, w);
  const [row] = calibrate(loadManifest(dir), { workDir: join(w.base, 'work') }).rows;
  assert.equal(row.task, 't-one');
  assert.equal(row.verdict, 'OK');
  assert.deepEqual([row.atStart, row.atReference], [1, 0]);
});

test('passes at start → invalid: passes at start', (t) => {
  const w = world(t);
  const dir = manifestDir(t, w, { script: 'process.exit(0);\n' });
  const out = calibrate(loadManifest(dir), { workDir: join(w.base, 'work') });
  assert.equal(out.rows[0].verdict, 'invalid: passes at start');
  assert.equal(out.ok, false);
});

test('fails at reference → invalid: fails at reference', (t) => {
  const w = world(t);
  const dir = manifestDir(t, w, { script: 'process.exit(1);\n' });
  const out = calibrate(loadManifest(dir), { workDir: join(w.base, 'work') });
  assert.equal(out.rows[0].verdict, 'invalid: fails at reference');
});

test('a regression failure at start is its own verdict, not a behavioural pass', (t) => {
  const w = world(t);
  const dir = manifestDir(t, w, { script: 'process.exit(2);\n' });
  const out = calibrate(loadManifest(dir), { workDir: join(w.base, 'work') });
  assert.equal(out.rows[0].verdict, 'invalid: regression fails at start');
});

test('an alternative implementation of the behaviour passes the same acceptance; a wrong one is reported', (t) => {
  const w = world(t);
  const good = 'diff --git a/greet.txt b/greet.txt\nnew file mode 100644\nindex 0000000..ce01362\n--- /dev/null\n+++ b/greet.txt\n@@ -0,0 +1 @@\n+hello\n';
  const bad = 'diff --git a/greet.txt b/greet.txt\nnew file mode 100644\nindex 0000000..ce01362\n--- /dev/null\n+++ b/greet.txt\n@@ -0,0 +1 @@\n+hi\n';
  const dirGood = manifestDir(t, w, { alt: { 'other-file-layout': good } });
  const okRow = calibrate(loadManifest(dirGood), { workDir: join(w.base, 'work1') }).rows[0];
  assert.equal(okRow.verdict, 'OK');
  assert.deepEqual(okRow.alternatives, [{ name: 'other-file-layout', exit: 0 }]);

  const dirBad = manifestDir(t, w, { alt: { wrong: bad } });
  const badOut = calibrate(loadManifest(dirBad), { workDir: join(w.base, 'work2') });
  assert.equal(badOut.rows[0].verdict, 'invalid: alternative wrong fails');
  assert.equal(badOut.ok, false);
});

test('--task limits the run; an unknown task is a usage error', (t) => {
  const w = world(t);
  const dir = manifestDir(t, w);
  const bad = spawnSync(process.execPath, [CLI, '--manifest', dir, '--task', 'nope', '--work', join(w.base, 'w')], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown task nope/);
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 2);
});

test('CLI exits 0 and prints a table when all tasks are valid, 1 and lists the invalid ones otherwise', (t) => {
  const w = world(t);
  const ok = spawnSync(process.execPath, [CLI, '--manifest', manifestDir(t, w), '--work', join(w.base, 'w1')], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /t-one\s+\|.*\|\s*OK/);
  const bad = spawnSync(process.execPath, [CLI, '--manifest', manifestDir(t, w, { script: 'process.exit(0);\n' }), '--work', join(w.base, 'w2')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /invalid: t-one — invalid: passes at start/);
});

test('formatTable renders one row per task with both exit codes', () => {
  const text = formatTable([{ task: 't-one', repo: 'r1', atStart: 1, atReference: 0, alternatives: [], verdict: 'OK' }]);
  assert.match(text, /\| task +\| repo +\| start +\| reference +\| alternatives +\| verdict/);
  assert.match(text, /t-one +\| r1 +\| 1 +\| 0 +\| 0\/0 +\| OK/);
});

test('loadManifest validates the real corpus (every task has start, reference, acceptance and its B file)', () => {
  const manifest = loadManifest(REAL);
  assert.ok(manifest.tasks.length >= 6, `${manifest.tasks.length} tasks`);
  for (const task of manifest.tasks) assert.match(task.acceptance, /\/acceptance\//, task.id);
});

test('a built acceptance script restores the original tests, drops added ones and maps failures to exit 1 / 2', async (t) => {
  const { buildScript } = await import('../bench/corpus/build-acceptance.mjs');
  const base = tmp(t, 'telos-bench-acc-');
  const repo = join(base, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 't@example.com');
  git(repo, 'config', 'user.name', 'T');
  git(repo, 'config', 'commit.gpgsign', 'false');
  put(repo, 'lib.txt', 'v1\n');
  put(repo, 'check.test', 'must-hold\n');
  const start = commitAll(repo, 'start');
  // regression: the original test file must still say must-hold; behavioural: lib.txt must say v2 (hidden file checks it)
  const src = join(base, 'src');
  put(src, 'spec.json', JSON.stringify({ start, testPatterns: ['\\.test$'], regression: 'grep -qx must-hold check.test',
    behavioural: 'grep -qx v2 lib.txt && grep -qx hidden-ran hidden.test' }));
  put(src, 'hidden/hidden.test', 'hidden-ran\n');
  const script = join(base, 'accept.mjs');
  writeFileSync(script, buildScript(src));
  const grade = () => spawnSync(process.execPath, [script], { cwd: repo, encoding: 'utf8' }).status;

  assert.equal(grade(), 1, 'behaviour missing → 1');
  put(repo, 'lib.txt', 'v2\n');
  assert.equal(grade(), 0, 'behaviour present → 0');
  put(repo, 'check.test', 'weakened\n');
  assert.equal(grade(), 0, 'a weakened original test is restored before grading');
  assert.equal(git(repo, 'status', '--short').includes('check.test'), false);
  put(repo, 'added.test', 'agent test\n');
  grade();
  assert.throws(() => git(repo, 'cat-file', '-e', ':added.test'));
  // a renamed (tracked) test path does not survive either: only start-commit test paths are run
  git(repo, 'mv', 'check.test', 'moved.test');
  git(repo, 'commit', '-qm', 'rename');
  grade();
  assert.equal(existsSync(join(repo, 'moved.test')), false);
  assert.equal(existsSync(join(repo, 'check.test')), true);
  put(repo, 'lib.txt', 'v1\nx\n');
  put(repo, 'check.test', 'must-hold\n');
  git(repo, 'rm', '-q', '--cached', 'check.test');
  assert.equal(grade(), 1, 'a deleted-from-index original test is re-created; behaviour still missing');
  // regression failure: a start commit whose suite cannot pass
  const bad = join(base, 'bad');
  put(bad, 'spec.json', JSON.stringify({ start, testPatterns: ['\\.test$'], regression: 'false', behavioural: 'true' }));
  put(bad, 'hidden/h.test', 'x\n');
  writeFileSync(script, buildScript(bad));
  assert.equal(grade(), 2);
});

test('the CLI runs the suites.json setup recipe of the repository in each copy, with its _pathPrepend in front of PATH', (t) => {
  const w = world(t);
  const script = `import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const tool = spawnSync('fake-tool', ['--version'], { encoding: 'utf8' });
if (!existsSync('setup-ran') || tool.stdout.trim() !== 'fake 1') process.exit(2);
process.exit(existsSync('greet.txt') ? 0 : 1);
`;
  const dir = manifestDir(t, w, { script });
  const bin = join(w.base, 'bin');
  put(bin, 'fake-tool', '#!/bin/sh\necho "fake 1"\n');
  execFileSync('chmod', ['+x', join(bin, 'fake-tool')]);
  writeFileSync(join(dir, 'suites.json'), JSON.stringify({ _pathPrepend: [bin], r1: { url: w.src, setup: 'touch setup-ran', test: 'true' } }));
  const ok = spawnSync(process.execPath, [CLI, '--manifest', dir, '--work', join(w.base, 'w1')], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  const skipped = spawnSync(process.execPath, [CLI, '--manifest', dir, '--work', join(w.base, 'w2'), '--no-setup'], { encoding: 'utf8' });
  assert.equal(skipped.status, 1, 'without setup the marker is missing → regression exit 2 at start');
  assert.match(skipped.stderr, /regression fails at start/);
});
