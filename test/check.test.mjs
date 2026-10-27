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
