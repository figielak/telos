import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runChecks } from '../lib/check.mjs';
import { main } from '../lib/cli.mjs';

const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
const node = quote(process.execPath);

function repo(t, checks = {}, profile = 'standard') {
  const root = mkdtempSync(join(tmpdir(), 'telos-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  mkdirSync(join(root, '.telos'));
  writeFileSync(join(root, '.telos/config.json'), JSON.stringify({ profile, checks }));
  writeFileSync(join(root, 'probe.mjs'), `
import { appendFileSync, writeFileSync } from 'node:fs';
const [mode, ...args] = process.argv.slice(2);
if (mode === 'order') appendFileSync('order', args[0] + '\\n');
if (mode === 'args') writeFileSync('args.json', JSON.stringify(args));
if (mode === 'fail') { for (let i = 0; i < 50; i++) console.log('line ' + i); process.exit(3); }
if (mode === 'hang' || mode === 'overflow') {
  writeFileSync('pid', String(process.pid));
  setInterval(() => {}, 100);
}
if (mode === 'overflow') process.stdout.write('x'.repeat(256 * 1024));
`);
  return root;
}

const probe = (mode) => `${node} probe.mjs ${mode}`;
const writer = () => ({ value: '', write(s) { this.value += s; } });
async function cli(root, ...args) {
  const stdout = writer(), stderr = writer();
  const code = await main(['check', ...args], { cwd: root, stdout, stderr });
  return { code, stdout: stdout.value, stderr: stderr.value };
}

test('full checks run in order, aggregate failures, skip missing checks and omit success output', async (t) => {
  const root = repo(t, {
    build: `${probe('order build')}; echo hidden-success`,
    types: `${probe('order types')}; ${probe('fail')}`,
    test: probe('order test'),
    test_related: probe('order related'), e2e: probe('order e2e'),
  });
  const result = await runChecks(root);
  assert.deepEqual(readFileSync(join(root, 'order'), 'utf8').trim().split('\n'), ['build', 'types', 'test']);
  assert.deepEqual(result.checks.map(({ name, verdict }) => [name, verdict]),
    [['build', 'PASS'], ['types', 'FAIL'], ['lint', 'SKIP'], ['test', 'PASS']]);
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].output, undefined);
  assert.equal(result.checks[1].output.length, 30);
  assert.equal(result.checks[1].output[0], 'line 0');
  assert.equal(result.checks[1].output.at(-1), 'line 29');
  const report = await cli(root);
  assert.equal(report.code, 1);
  assert.match(report.stdout, /^TELOS CHECK  build:PASS  types:FAIL  lint:SKIP  test:PASS/m);
  assert.doesNotMatch(report.stdout, /hidden-success|line 30/);
  assert.ok(report.stdout.split('\n').filter((line) => line.startsWith('types:')).length <= 30);
});

test('quick runs related tests with files then lint and types; falls back to ordinary tests', async (t) => {
  const checks = { build: probe('order build'), types: probe('order types'), lint: probe('order lint'),
    test: probe('order test'), test_related: `${probe('order related')} {files}` };
  const root = repo(t, checks);
  const related = await runChecks(root, { level: 'quick', files: ['src/a.js'] });
  assert.equal(related.ok, true);
  assert.deepEqual(related.checks.map((c) => c.name), ['test_related', 'lint', 'types']);
  assert.equal(readFileSync(join(root, 'order'), 'utf8'), 'related\nlint\ntypes\n');
  rmSync(join(root, 'order'));
  await runChecks(root, { level: 'quick' });
  assert.equal(readFileSync(join(root, 'order'), 'utf8'), 'test\nlint\ntypes\n');
  const fallback = repo(t, { test: probe('order fallback') });
  assert.equal((await runChecks(fallback, { level: 'quick', files: ['a'] })).checks[0].name, 'test');
});

test('missing checks are SKIP; no applicable configured checks is explicitly unverified', async (t) => {
  for (const checks of [{}, { e2e: 'true' }, { test_related: 'true' }]) {
    const root = repo(t, checks);
    const result = await runChecks(root);
    assert.equal(result.ok, false);
    assert.ok(result.checks.every((c) => c.verdict === 'SKIP'));
    const report = await cli(root);
    assert.equal(report.code, 1);
    assert.match(report.stdout, /unverified/i);
  }
  const root = repo(t, { test: 'true' });
  const report = await cli(root);
  assert.equal(report.code, 0);
  assert.match(report.stdout, /build:SKIP.*types:SKIP.*lint:SKIP.*test:PASS/);
});

test('minimal prints the exact standard profile requirement and executes nothing', async (t) => {
  const root = repo(t, { test: probe('order forbidden') }, 'minimal');
  const report = await cli(root);
  assert.equal(report.code, 1);
  assert.equal(report.stdout + report.stderr, 'Requires standard profile. Switch with /telos:profile standard.\n');
  assert.equal(existsSync(join(root, 'order')), false);
});

test('failures, missing executables and signals are failures with bounded diagnostics', async (t) => {
  const root = repo(t, { build: probe('fail'), types: 'telos-nonexistent-executable-04-06', lint: 'kill -TERM $$' });
  const result = await runChecks(root);
  assert.equal(result.ok, false);
  for (const check of result.checks.slice(0, 3)) {
    assert.equal(check.verdict, 'FAIL');
    assert.ok(check.note);
    assert.ok(check.output.length <= 30);
  }
  assert.match(result.checks[2].note, /SIGTERM|signal/i);
});

for (const mode of ['hang', 'overflow']) {
  test(`${mode} terminates the command and descendants and still runs later checks`, async (t) => {
    const root = repo(t, { build: `${probe(mode)} & wait`, test: probe('order after') });
    const result = await runChecks(root, { timeoutMs: 1500 });
    assert.equal(result.ok, false);
    assert.equal(result.checks[0].verdict, 'FAIL');
    assert.match(result.checks[0].note, mode === 'hang' ? /timeout/i : /output/i);
    assert.ok(result.checks[0].output.length <= 30);
    assert.equal(readFileSync(join(root, 'order'), 'utf8'), 'after\n');
    const pid = Number(readFileSync(join(root, 'pid'), 'utf8'));
    // A killed descendant can briefly remain a zombie until its parent is reaped.
    const alive = () => {
      try { return !/\) Z /.test(readFileSync(`/proc/${pid}/stat`, 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    };
    assert.equal(alive(), false);
  });
}

test('failure reports bound long lines as well as their count', async (t) => {
  const root = repo(t, { test: `${node} -e 'console.error("x".repeat(60000)); process.exit(1)'` });
  const report = await cli(root);
  assert.equal(report.code, 1);
  assert.ok(report.stdout.length < 2000);
});

test('file placeholders quote each literal argument, neutralize leading dashes, and support repeated placeholders', async (t) => {
  const files = ['space name.js', "quote'file.js", '$(touch PWNED)', '`touch PWNED2`',
    'a;touch PWNED3', '-danger', '--help', 'a\nb.js', 'a"b.js', '$&.js'];
  const root = repo(t, { test_related: `${probe('args')} {files} {files}` });
  const result = await runChecks(root, { level: 'quick', files });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'args.json'), 'utf8')),
    [...files, ...files].map((f) => `./${f}`));
  for (const file of ['PWNED', 'PWNED2', 'PWNED3']) assert.equal(existsSync(join(root, file)), false);
});

test('commands without placeholders run unchanged and full placeholders receive files', async (t) => {
  const root = repo(t, { build: `${probe('args')} fixed` });
  assert.equal((await runChecks(root, { files: ['unused'] })).ok, true);
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'args.json'), 'utf8')), ['fixed']);
  const full = repo(t, { test: `${probe('args')} {files}` });
  assert.equal((await cli(full, '--files', 'one', 'two', '--level', 'full')).code, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(full, 'args.json'), 'utf8')), ['./one', './two']);
  await runChecks(full);
  assert.deepEqual(JSON.parse(readFileSync(join(full, 'args.json'), 'utf8')), []);
  await cli(full, '--files', './-danger', './--help');
  assert.deepEqual(JSON.parse(readFileSync(join(full, 'args.json'), 'utf8')), ['./-danger', './--help']);
});

test('unsafe placeholder contexts fail without execution; ordinary quoted command arguments stay supported', async (t) => {
  for (const template of ['"{files}"', "'{files}'", '--option={files}', '\\{files}',
    '"prefix {files} suffix"', '$(echo {files})', '`echo {files}`', '${value:-{files}}',
    '<<EOF\n{files}\nEOF', '# {files}']) {
    const root = repo(t, { build: `${probe('order forbidden')} ${template}`, test: 'true' });
    const result = await runChecks(root, { files: ['$(touch PWNED)'] });
    assert.equal(result.ok, false, template);
    assert.equal(result.checks[0].verdict, 'FAIL', template);
    assert.match(result.checks[0].note, /placeholder/i);
    assert.equal(result.checks[3].verdict, 'PASS');
    assert.equal(existsSync(join(root, 'order')), false, template);
    assert.equal(existsSync(join(root, 'PWNED')), false, template);
  }
  const root = repo(t, { test: `${probe('args')} 'fixed value' {files}` });
  assert.equal((await runChecks(root, { files: ['a b'] })).ok, true);
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'args.json'), 'utf8')), ['fixed value', './a b']);
});

test('outside paths, symlink escapes and dangling external symlinks are rejected before any check executes', async (t) => {
  const root = repo(t, { build: probe('order forbidden') });
  const outside = mkdtempSync(join(tmpdir(), 'telos-check-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(root, 'escape'));
  symlinkSync(join(outside, 'missing'), join(root, 'dangling'));
  for (const file of ['../outside', outside, 'escape/new.js', 'dangling', 'nul\0path']) {
    await assert.rejects(() => runChecks(root, { files: [file] }), /path|outside|repo|symlink/i);
    assert.equal(existsSync(join(root, 'order')), false);
  }
  const inside = repo(t, { test: `${probe('args')} {files}` });
  assert.equal((await runChecks(inside, { files: [join(inside, 'new.js')] })).ok, true);
  assert.deepEqual(JSON.parse(readFileSync(join(inside, 'args.json'), 'utf8')), ['./new.js']);
});

test('unknown flags, unknown levels and empty --files produce usage exit 2', async (t) => {
  const root = repo(t, { test: probe('order forbidden') });
  for (const args of [['--wat'], ['--level', 'deep'], ['--level'], ['--files'], ['--files', '--level', 'quick'],
    ['--files', ''], ['positional'], ['--level', 'quick', '--wat'], ['--files', 'a', '--wat']]) {
    const report = await cli(root, ...args);
    assert.equal(report.code, 2, JSON.stringify({ args, report }));
  }
  assert.equal(existsSync(join(root, 'order')), false);
});

test('check is read-only for Telos state and git, including when invoked in a subdirectory', async (t) => {
  const root = repo(t, { test: 'true' }, 'deep');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, '.telos/STATUS.md'), 'unchanged\n');
  const snapshot = (path) => readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? snapshot(join(path, entry.name)) : [[join(path, entry.name), readFileSync(join(path, entry.name)).toString('base64')]]);
  const before = [...snapshot(join(root, '.telos')), ...snapshot(join(root, '.git'))];
  assert.equal((await cli(join(root, 'src'), '--level', 'quick')).code, 0);
  assert.deepEqual([...snapshot(join(root, '.telos')), ...snapshot(join(root, '.git'))], before);
});

// Targeted full checks (05-05, D-02): --task/--phase select tasks; deep critical code requires e2e.
function task(root, id, { type = 'code', critical = false, status = 'done' } = {}) {
  const dir = join(root, '.telos', 'phases', `${id.slice(0, 2)}-demo`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}-t.md`), `---\nid: ${id}\ntitle: T ${id}\ntype: ${type}\nstatus: ${status}\n`
    + `critical: ${critical}\neffort: normal\ndepends: []\ndecisions: []\nscope: ["src/"]\n---\n## Goal\nx\n`);
  return root;
}
const statusPhase = (root, phase) => writeFileSync(join(root, '.telos/STATUS.md'), `# Status\nPhase: ${phase}\nTask: none\n`);
const readOrDir = (path) => { try { return readFileSync(path, 'utf8'); } catch (e) { if (e.code === 'EISDIR') return 'dir'; throw e; } };
const telosSnapshot = (root) => readdirSync(join(root, '.telos'), { recursive: true }).sort()
  .map((p) => [p, readOrDir(join(root, '.telos', p))]);
const order = (root) => existsSync(join(root, 'order')) ? readFileSync(join(root, 'order'), 'utf8').trim().split('\n') : [];

function deep(t, checks) {
  const root = repo(t, checks, 'deep');
  task(root, '01-01');
  task(root, '01-02', { critical: true });
  task(root, '02-01');
  statusPhase(root, '02-demo');
  return root;
}

test('deep critical code runs the full checks then e2e for the selected phase, independent of STATUS', async (t) => {
  const root = deep(t, { test: probe('order test'), e2e: probe('order e2e') });
  const r = await cli(root, '--level', 'full', '--phase', '01');
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(order(root), ['test', 'e2e']);
  assert.match(r.stdout, /^Target: phase 01 · e2e required for critical code 01-02$/m);
  assert.match(r.stdout, /test:PASS  e2e:PASS/);
  rmSync(join(root, 'order'));
  const status = await cli(root);
  assert.equal(status.code, 0);
  assert.deepEqual(order(root), ['test'], 'STATUS phase 02 has no critical code');
  assert.match(status.stdout, /^Target: phase 02 · no e2e required$/m);
  rmSync(join(root, 'order'));
  const one = await runChecks(root, { task: '01-01' });
  assert.equal(one.ok, true);
  assert.deepEqual(order(root), ['test'], 'a noncritical task needs no e2e');
  rmSync(join(root, 'order'));
  assert.equal((await runChecks(root, { task: '01-02' })).ok, true);
  assert.deepEqual(order(root), ['test', 'e2e']);
});

test('missing e2e for deep critical code is UNVERIFIED and exit 1 even when other checks pass', async (t) => {
  const root = deep(t, { test: probe('order test') });
  const result = await runChecks(root, { phase: '01' });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((c) => c.name === 'test').verdict, 'PASS');
  assert.match(result.note, /^UNVERIFIED: e2e required for critical code 01-02 but checks\.e2e is not configured/);
  const r = await cli(root, '--task', '01-02');
  assert.equal(r.code, 1);
  assert.match(r.stdout, /e2e:SKIP/);
  assert.match(r.stdout, /UNVERIFIED: e2e required/);
});

test('a failing or timed-out e2e is FAIL with exit 1 and writes no Telos state', async (t) => {
  const failing = deep(t, { test: 'true', e2e: probe('fail') });
  const before = telosSnapshot(failing);
  const r = await cli(failing, '--phase', '01');
  assert.equal(r.code, 1);
  assert.match(r.stdout, /test:PASS  e2e:FAIL/);
  assert.match(r.stdout, /^e2e: exit 3$/m);
  assert.deepEqual(telosSnapshot(failing), before);
  const hanging = deep(t, { test: 'true', e2e: probe('hang') });
  const timed = await runChecks(hanging, { phase: '01', timeoutMs: 300 });
  assert.equal(timed.ok, false);
  assert.deepEqual(timed.checks.at(-1), { ...timed.checks.at(-1), name: 'e2e', verdict: 'FAIL' });
  assert.match(timed.checks.at(-1).note, /^timeout/);
});

test('noncritical, doc/audit and standard work keep the existing check set without e2e', async (t) => {
  const checks = { test: probe('order test'), e2e: probe('order e2e') };
  const docs = repo(t, checks, 'deep');
  task(docs, '01-01', { type: 'doc', critical: true });
  task(docs, '01-02', { type: 'audit', critical: true });
  task(docs, '01-03');
  statusPhase(docs, '01-demo');
  assert.equal((await cli(docs)).code, 0);
  assert.deepEqual(order(docs), ['test']);
  const standard = repo(t, checks, 'standard');
  task(standard, '01-01', { critical: true });
  statusPhase(standard, '01-demo');
  const r = await cli(standard, '--phase', '01');
  assert.equal(r.code, 0);
  assert.deepEqual(order(standard), ['test']);
  rmSync(join(standard, 'order'));
  assert.equal((await cli(standard)).code, 0, 'standard without a selector is unchanged');
  assert.deepEqual(order(standard), ['test']);
  const noE2e = repo(t, { test: 'true' }, 'standard');
  task(noE2e, '01-01', { critical: true });
  assert.equal((await cli(noE2e, '--task', '01-01')).code, 0);
});

test('malformed, conflicting, repeated or quick-level selectors are usage errors before any check runs', async (t) => {
  const root = deep(t, { test: probe('order forbidden'), e2e: probe('order forbidden') });
  for (const args of [['--task', '1-1'], ['--task', '01-1'], ['--phase', '1'], ['--phase', '01-02'], ['--task'], ['--phase'],
    ['--task', '01-01', '--phase', '01'], ['--phase', '01', '--phase', '02'], ['--level', 'quick', '--task', '01-01'],
    ['--phase', '01', '--level', 'quick'], ['--task', '--level', 'full']]) {
    const r = await cli(root, ...args);
    assert.equal(r.code, 2, JSON.stringify({ args, r }));
  }
  await assert.rejects(runChecks(root, { level: 'quick', phase: '01' }), /usage/);
  await assert.rejects(runChecks(root, { task: '01-01', phase: '01' }), /usage/);
  assert.equal(existsSync(join(root, 'order')), false);
});

test('a missing task, phase or default phase in deep full mode fails with a remedy and runs nothing', async (t) => {
  const root = deep(t, { test: probe('order forbidden') });
  const task9 = await cli(root, '--task', '01-09');
  assert.equal(task9.code, 1);
  assert.match(task9.stdout, /no task 01-09/);
  const phase7 = await cli(root, '--phase', '07');
  assert.equal(phase7.code, 1);
  assert.match(phase7.stdout, /phase 07 has no task files/);
  statusPhase(root, 'none');
  const none = await cli(root);
  assert.equal(none.code, 1);
  assert.match(none.stdout, /no phase in STATUS; pass --phase NN or --task NN-MM/);
  rmSync(join(root, '.telos/STATUS.md'));
  assert.equal((await cli(root, '--level', 'full')).code, 1);
  assert.equal(existsSync(join(root, 'order')), false);
  assert.equal((await cli(root, '--level', 'quick')).code, 0, 'quick needs no target');
});
