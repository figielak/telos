import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { CAP } from '../lib/ctx/index.mjs';
import { render } from '../lib/template.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

function repo(checks = { test: 'npm test', test_related: 'node --test {files}', build: 'npm run build' }) {
  const root = mkdtempSync(join(tmpdir(), 'telos-ctx-quick-'));
  cpSync(FIXTURE, root, { recursive: true });
  writeFileSync(join(root, '.telos', 'PROJECT.md'), render('PROJECT.md', { name: 'demo' })
    .replace(/## Rules\n[\s\S]*?- none/, '## Rules\n- no runtime dependencies'));
  const config = join(root, '.telos', 'config.json');
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), checks }, null, 2));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'chore: init');
  return root;
}

async function ctxQuick(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const code = await main(['ctx', 'quick', ...args], { cwd: root, stdout: out, stderr: { write() {} } });
  assert.equal(code, 0);
  return out.text;
}

test('the bundle has rules, stack and only the configured quick checks, never the description', async () => {
  const out = await ctxQuick(repo());
  assert.doesNotMatch(out, /^(Change|REFUSED):/m);
  assert.match(out, /^Rules:\n- no runtime dependencies$/m);
  assert.match(out, /^Stack: /m);
  assert.match(out, /^Checks: test_related=node --test \{files\} · test=npm test$/m);
  assert.doesNotMatch(out, /build/);
  assert.match(out, /^Size: ≤ ~5 files and < 1 hour; larger → stop and suggest \/telos:plan$/m);
});

test('a dirty tree lists its files, a clean tree says clean', async () => {
  const root = repo();
  assert.match(await ctxQuick(root), /^Working tree: clean$/m);
  writeFileSync(join(root, 'src', 'a.ts'), 'changed\n');
  writeFileSync(join(root, 'notes.md'), 'new\n');
  assert.match(await ctxQuick(root), /^Working tree:\n- notes\.md\n- src\/a\.ts$/m);
});

test('more than 20 changed files are summarized', async () => {
  const root = repo();
  for (let i = 0; i < 25; i++) writeFileSync(join(root, `f${String(i).padStart(2, '0')}.txt`), 'x\n');
  const out = await ctxQuick(root);
  assert.match(out, /^- f19\.txt\n- … 5 more$/m);
});

test('the current task is named with its state', async () => {
  const root = repo();
  const task = join(root, '.telos', 'phases', '01-demo', '01-02-second-task.md');
  writeFileSync(task, readFileSync(task, 'utf8').replace('status: approved', 'status: in-progress'));
  assert.match(await ctxQuick(root), /^Current: phase 01-demo · task 01-02 \[in-progress\] — keep quick changes out of its files$/m);
});

test('no checks configured', async () => {
  assert.match(await ctxQuick(repo({})), /^Checks: none$/m);
});

test('the bundle stays under the cap without comments', async () => {
  const out = await ctxQuick(repo());
  assert.ok(out.length <= CAP + 1);
  assert.doesNotMatch(out, /<!--/);
});

// Memory (04-05): area-matched lessons via explicit --area selectors, Delete-zone approaches.
function withMemory(root, lessons = [
  '- [src/a/] lesson for a (01-01)',
  '- [src/ab/] lesson for ab (01-02)',
  '- [tests] lesson about tests (quick)',
  '- [Git] lesson about git (01-03)',
]) {
  const config = join(root, '.telos', 'config.json');
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), profile: 'standard' }, null, 2));
  writeFileSync(join(root, '.telos', 'LESSONS.md'), `# Lessons\n${lessons.join('\n')}\n`);
  writeFileSync(join(root, '.telos', 'HISTORY.md'), render('HISTORY.md', { date: '2026-01-01', profile: 'standard' })
    .replace(/(## Delete-zone\n(?:<!--[\s\S]*?-->\n)?)- none/, '$1- approach: global mutable cache — races (01-01, 2026-01-01)'));
  writeFileSync(join(root, '.telos', 'HISTORY-archive.md'), '# History archive\n\n## Log\n- 2025-01-01 remove 01-01: ARCHIVED\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'chore: memory');
  return root;
}

async function ctxQuickRaw(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const code = await main(['ctx', 'quick', ...args], { cwd: root, stdout: out, stderr: out });
  return { code, text: out.text };
}

test('matchLessons: path-prefix boundaries and exact topics; no selectors → none', async () => {
  const { matchLessons, parseLessons } = await import('../lib/lessons.mjs');
  const { entries } = parseLessons('# Lessons\n- [src/a/] A (01-01)\n- [src/ab/] AB (01-02)\n- [tests] T (quick)\n- [src] S (01-03)\n');
  const texts = (sel) => matchLessons(entries, sel).map((e) => e.text);
  assert.deepEqual(texts([]), []);
  assert.deepEqual(texts(['src/a/x.mjs']), ['A', 'S']);
  assert.deepEqual(texts(['src/a']), ['A', 'S']);
  assert.deepEqual(texts(['src/ab']), ['AB', 'S']);
  assert.deepEqual(texts(['./src/a//']), ['A', 'S']);
  assert.deepEqual(texts(['Tests']), ['T']);
  assert.deepEqual(texts(['test']), []);
  assert.deepEqual(texts(['src/abc']), ['S']);
});

test('ctx quick without selectors shows no lessons but says how to ask; approaches always show', async () => {
  const out = await ctxQuick(withMemory(repo()));
  assert.doesNotMatch(out, /lesson for|lesson about/);
  assert.match(out, /^Lessons: none selected \(rerun `telos ctx quick --area <path-or-topic>`/m);
  assert.match(out, /^Removed approaches \(never reintroduce\):\n- global mutable cache — races \(01-01, 2026-01-01\)$/m);
  assert.doesNotMatch(out, /ARCHIVED/);
});

test('ctx quick --area on a clean tree returns only matching lessons', async () => {
  const root = withMemory(repo());
  const out = await ctxQuick(root, '--area', 'src/a/b.mjs', '--area', 'git');
  assert.match(out, /^Working tree: clean$/m);
  assert.match(out, /^Lessons \(--area src\/a\/b\.mjs, git\):\n- \[src\/a\/\] lesson for a \(01-01\)\n- \[Git\] lesson about git \(01-03\)$/m);
  assert.doesNotMatch(out, /lesson for ab|lesson about tests/);
  const none = await ctxQuick(root, '--area', 'docs/');
  assert.match(none, /^Lessons \(--area docs\/\): none match$/m);
});

test('malformed or hostile selectors are usage errors', async () => {
  const root = withMemory(repo());
  for (const args of [['--area'], ['--area', ''], ['--area', "it's"], ['--area', 'a;rm -rf'], ['--area', '$(id)'],
    ['--area', '../x'], ['--area', '/etc'], ['--area', 'a b'], ['src/a'], ['--bogus', 'x']]) {
    assert.equal((await ctxQuickRaw(root, ...args)).code, 2, args.join(' '));
  }
});

test('ctx quick on minimal omits memory and still rejects bad selectors', async () => {
  const root = withMemory(repo());
  const config = join(root, '.telos', 'config.json');
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), profile: 'minimal' }, null, 2));
  const out = await ctxQuick(root, '--area', 'src/a');
  assert.doesNotMatch(out, /Lessons|Removed approaches|lesson for/);
  assert.equal((await ctxQuickRaw(root, '--area', "x'y")).code, 2);
});

test('oversized quick memory is capped with omissions while rules and checks survive', async () => {
  const lessons = Array.from({ length: 20 }, (_, i) => `- [src/a/] ${'very long lesson text '.repeat(20).trim()} ${i} (01-01)`);
  const root = withMemory(repo(), lessons);
  const zone = Array.from({ length: 150 }, (_, i) => `- approach: approach ${i} ${'x'.repeat(40)} — no (01-01, 2026-01-01)`);
  writeFileSync(join(root, '.telos', 'HISTORY.md'), render('HISTORY.md', { date: '2026-01-01', profile: 'standard' })
    .replace(/(## Delete-zone\n(?:<!--[\s\S]*?-->\n)?)- none/, `$1${zone.join('\n')}`));
  const out = await ctxQuick(root, '--area', 'src/a');
  assert.ok(out.length <= CAP + 1, String(out.length));
  assert.match(out, /^Rules:\n- no runtime dependencies$/m);
  assert.match(out, /^Checks: test_related=/m);
  assert.match(out, /^Size: /m);
  assert.match(out, /^- … \d+ more (?:lessons|approaches) omitted \(see /m);
  assert.doesNotMatch(out, /truncated by telos ctx/);
});
