import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { CAP } from '../lib/ctx/index.mjs';
import { render } from '../lib/template.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const DEMO = join('.telos', 'phases', '01-demo');

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'telos-ctx-plan-'));
  cpSync(FIXTURE, root, { recursive: true });
  mkdirSync(join(root, '.git'));
  const project = render('PROJECT.md', { name: 'demo' })
    .replace('## Purpose\n', '## Purpose\nA demo app that greets people.\n')
    .replace(/## Rules\n[\s\S]*?- none/, '## Rules\n- no runtime dependencies')
    .replace('## Conventions\n', '## Conventions\n- secret convention text\n');
  writeFileSync(join(root, '.telos', 'PROJECT.md'), project);
  const status = join(root, '.telos', 'STATUS.md');
  writeFileSync(status, readFileSync(status, 'utf8')
    .replace('## Carry-over\n- none', '## Carry-over\n- 04: later thing → 01-01 Result\n- 01: rate limit → 01-01 Result\n- 03: new phase item → SPEC'));
  return root;
}

function edit(root, file, fn) {
  const path = join(root, DEMO, file);
  writeFileSync(path, fn(readFileSync(path, 'utf8')));
}

async function ctx(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(['ctx', ...args], { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

test('ctx plan NN shows the phase line, project, stack, roadmap and the task index', async () => {
  const r = await ctx(repo(), 'plan', '01');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^Profile: minimal$/m);
  assert.match(r.stdout, /^Target: 01-demo \[active\] demo phase · done when: demo works$/m);
  assert.match(r.stdout, /^Purpose: A demo app that greets people\.$/m);
  assert.match(r.stdout, /^Rules:\n- no runtime dependencies$/m);
  assert.doesNotMatch(r.stdout, /secret convention/);
  assert.match(r.stdout, /^Stack: /m);
  assert.match(r.stdout, /^Checks: none$/m);
  assert.match(r.stdout, /^- 02-next \[planned\]/m);
  assert.match(r.stdout, /^- 01-01 \[done\] First task · normal · depends: none$/m);
  assert.match(r.stdout, /^- 01-02 \[approved\] Second task · normal · depends: 01-01$/m);
  assert.match(r.stdout, /^- 01-03 \[draft\]/m);
  assert.match(r.stdout, /^Format: /m);
});

test('without an argument ctx plan targets the STATUS phase', async () => {
  const r = await ctx(repo(), 'plan');
  assert.match(r.stdout, /^Target: 01-demo \[active\]/m);
});

test('without an argument the bundle also names the next NN and its carry-over', async () => {
  const r = await ctx(repo(), 'plan');
  assert.match(r.stdout, /^Target: 01-demo \[active\][^\n]*\nNew phase: 03\n- #3 new phase item → SPEC$/m);
  assert.doesNotMatch((await ctx(repo(), 'plan', '01')).stdout, /^New phase:/m);
});

test('a description targets a new phase with the next NN', async () => {
  const r = await ctx(repo(), 'plan', 'add', 'auth');
  assert.match(r.stdout, /^Target: new phase "add auth" → 03/m);
  assert.match(r.stdout, /^Tasks:\n- none$/m);
  assert.match(r.stdout, /^Carry-over for 03:\n- #3 new phase item → SPEC$/m);
});

test('carry-over shows only items of the target phase with their numbers', async () => {
  const r = await ctx(repo(), 'plan', '01');
  assert.match(r.stdout, /^Carry-over for 01:\n- #2 rate limit → 01-01 Result$/m);
  assert.doesNotMatch(r.stdout, /later thing/);
});

test('the phase CONTEXT is included without comments when present', async () => {
  const root = repo();
  writeFileSync(join(root, DEMO, '01-CONTEXT.md'), '# 01 · Demo\n## Goal\n<!-- hidden -->\nGreet.\n## Decisions\n- D-01: keep it small\n');
  const r = await ctx(root, 'plan', '01');
  assert.match(r.stdout, /^Context \(\.telos\/phases\/01-demo\/01-CONTEXT\.md\):\n# 01 · Demo\n## Goal\nGreet\./m);
  assert.doesNotMatch(r.stdout, /hidden/);
});

test('ctx approve lists lint problems and a missing tag', async () => {
  const r = await ctx(repo(), 'approve', '09');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^Lint:\n09-01: scope empty$/m);
  assert.match(r.stdout, /^Tag: telos\/09-start missing$/m);
  assert.match(r.stdout, /^Draft: 09-01, 09-02$/m);
});

test('ctx approve on a clean phase shows ok, draft ids and blocked tasks', async () => {
  const root = repo();
  writeFileSync(join(root, DEMO, '01-CONTEXT.md'), '# 01 · Demo\n## Decisions\n- D-01: keep it small\n- D-02 [proposed]: maybe\n');
  edit(root, '01-03-third-task.md', (t) => t.replace('decisions: []', 'decisions: [D-01, D-02]'));
  const r = await ctx(root, 'approve');
  assert.match(r.stdout, /^Phase: 01-demo \[active\]$/m);
  assert.match(r.stdout, /^Lint: ok: 3 tasks$/m);
  assert.match(r.stdout, /^Draft: 01-03$/m);
  assert.match(r.stdout, /^Blocked:\n- 01-03: D-02 is proposed$/m);
});

test('a decision listed in Awaiting user blocks its task', async () => {
  const root = repo();
  writeFileSync(join(root, DEMO, '01-CONTEXT.md'), '# 01 · Demo\n## Decisions\n- D-01: keep it small\n');
  edit(root, '01-03-third-task.md', (t) => t.replace('decisions: []', 'decisions: [D-01]'));
  const status = join(root, '.telos', 'STATUS.md');
  writeFileSync(status, readFileSync(status, 'utf8').replace('Awaiting user: none', 'Awaiting user: 01:D-01, 02:D-03'));
  const r = await ctx(root, 'approve', '01');
  assert.match(r.stdout, /^- 01-03: D-01 awaits the user$/m);
});

test('the task index and format survive a long CONTEXT; the cut lands in the CONTEXT', async () => {
  const root = repo();
  writeFileSync(join(root, DEMO, '01-CONTEXT.md'), `# 01 · Demo\n${'- long line of context\n'.repeat(400)}`);
  const r = await ctx(root, 'plan', '01');
  assert.match(r.stdout, /^- 01-03 \[draft\]/m);
  assert.match(r.stdout, /^Format: /m);
  assert.match(r.stdout, /\n- l[^\n]*\n…\[truncated by telos ctx\]\n$/);
});

test('bundles have no HTML comments and stay under the cap', async () => {
  const root = repo();
  for (let i = 0; i < 40; i++) edit(root, '01-03-third-task.md', (t) => t);
  writeFileSync(join(root, DEMO, '01-CONTEXT.md'), `# 01 · Demo\n<!-- c -->\n${'- long line of context\n'.repeat(400)}`);
  for (const args of [['plan', '01'], ['approve', '01'], ['plan', 'x']]) {
    const r = await ctx(root, ...args);
    assert.doesNotMatch(r.stdout, /<!--/);
    assert.ok(r.stdout.length <= CAP + 1, `${args} ${r.stdout.length}`);
  }
});

test('ctx plan and approve without a phase say so', async () => {
  const root = repo();
  const status = join(root, '.telos', 'STATUS.md');
  writeFileSync(status, readFileSync(status, 'utf8').replace('Phase: 01-demo', 'Phase: none'));
  assert.match((await ctx(root, 'plan')).stdout, /^Target: none/m);
  assert.match((await ctx(root, 'approve')).stdout, /^REFUSED: no phase/m);
});

// Memory (04-05): lessons and Delete-zone approaches on standard+; the archive never appears.
function withMemory(root, { lessons = 3, approaches = 2 } = {}) {
  const config = join(root, '.telos', 'config.json');
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), profile: 'standard' }, null, 2));
  const lines = Array.from({ length: lessons }, (_, i) => `- [src/area${i}/] lesson number ${i} (01-0${(i % 9) + 1})`);
  writeFileSync(join(root, '.telos', 'LESSONS.md'), `# Lessons\n${lines.join('\n') || '- none'}\n`);
  const zone = [
    ...Array.from({ length: approaches }, (_, i) => `- approach: removed approach ${i} — too slow (01-01, 2026-01-0${(i % 9) + 1})`),
    '- `src/old/` — module removed (01-01, 2026-01-02)',
  ];
  writeFileSync(join(root, '.telos', 'HISTORY.md'), render('HISTORY.md', { date: '2026-01-01', profile: 'standard' })
    .replace(/(## Delete-zone\n(?:<!--[\s\S]*?-->\n)?)- none/, `$1${zone.join('\n')}`));
  writeFileSync(join(root, '.telos', 'HISTORY-archive.md'),
    '# History archive\n\n## Log\n- 2025-01-01 remove 01-01: ARCHIVED secret approach\n');
  return root;
}

test('ctx plan on standard includes all lessons and Delete-zone approaches, never the archive', async () => {
  const root = withMemory(repo());
  const r = await ctx(root, 'plan', '01');
  assert.match(r.stdout, /^Lessons \(3\/20\):\n- \[src\/area0\/\] lesson number 0 \(01-01\)\n- \[src\/area1\/\]/m);
  assert.match(r.stdout, /^Removed approaches \(never reintroduce\):\n- removed approach 0 — too slow \(01-01, 2026-01-01\)\n- removed approach 1/m);
  assert.doesNotMatch(r.stdout, /ARCHIVED|src\/old\//);
  // Memory sits before the roadmap and CONTEXT, after the task index and format.
  assert.ok(r.stdout.indexOf('Format: ') < r.stdout.indexOf('Lessons ('));
  assert.ok(r.stdout.indexOf('Removed approaches') < r.stdout.indexOf('Roadmap:'));
});

test('ctx plan on minimal omits standard memory even when the files remain', async () => {
  const root = withMemory(repo());
  const config = join(root, '.telos', 'config.json');
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), profile: 'minimal' }, null, 2));
  const r = await ctx(root, 'plan', '01');
  assert.doesNotMatch(r.stdout, /Lessons|Removed approaches|lesson number/);
});

test('oversized memory is budgeted with explicit omissions; rules, checks and tasks survive', async () => {
  const root = withMemory(repo(), { lessons: 20, approaches: 200 });
  const r = await ctx(root, 'plan', '01');
  assert.ok(r.stdout.length <= CAP + 1, String(r.stdout.length));
  assert.match(r.stdout, /^Rules:\n- no runtime dependencies$/m);
  assert.match(r.stdout, /^Checks: /m);
  assert.match(r.stdout, /^- 01-02 \[approved\]/m);
  assert.match(r.stdout, /^Lessons \(20\/20\):/m);
  for (let i = 0; i < 20; i++) assert.match(r.stdout, new RegExp(`lesson number ${i} \\(`));
  assert.match(r.stdout, /^- … \d+ more approaches omitted \(see \.telos\/HISTORY\.md §Delete-zone\)$/m);
  assert.match(r.stdout, /^Roadmap:/m);
});

test('a broken HISTORY is reported in the bundle instead of failing it', async () => {
  const root = withMemory(repo());
  writeFileSync(join(root, '.telos', 'HISTORY.md'), '# History\nbroken\n');
  const r = await ctx(root, 'plan', '01');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^Removed approaches: unavailable \(/m);
  assert.match(r.stdout, /^Lessons \(3\/20\):/m);
});

test('ctx do never reads LESSONS', async () => {
  const root = withMemory(repo());
  const r = await ctx(root, 'do', '01-02');
  assert.doesNotMatch(r.stdout, /lesson number/);
});
