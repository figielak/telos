import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { CAP } from '../lib/ctx/index.mjs';
import { resolveRef } from '../lib/ctx/do.mjs';
import { render } from '../lib/template.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const DEMO = join('.telos', 'phases', '01-demo');
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

function repo({ realGit = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-ctx-do-'));
  cpSync(FIXTURE, root, { recursive: true });
  writeFileSync(join(root, '.telos', 'PROJECT.md'), render('PROJECT.md', { name: 'demo' })
    .replace(/## Rules\n[\s\S]*?- none/, '## Rules\n- no runtime dependencies')
    .replace(/## Conventions\n[\s\S]*?- none/, '## Conventions\n- name files in kebab-case'));
  if (realGit) {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 't@example.com');
    git(root, 'config', 'user.name', 'T');
    git(root, 'config', 'commit.gpgsign', 'false');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'chore: init');
  } else mkdirSync(join(root, '.git'));
  return root;
}

function edit(root, file, fn) {
  const path = join(root, file);
  writeFileSync(path, fn(readFileSync(path, 'utf8')));
}
const editTask = (root, file, fn) => edit(root, join(DEMO, file), fn);
const readFirst = (refs) => (t) => t.replace('- src/a.ts:1-5 (greet)', refs.join('\n'));

async function ctxDo(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(['ctx', 'do', ...args], { cwd: root, stdout: out, stderr: err });
  assert.equal(code, 0, err.text);
  return out.text;
}

test('without an id the in-progress task wins, else the first approved one with done depends', async () => {
  const root = repo();
  assert.match(await ctxDo(root), /^Task: 01-02 \[approved\] Second task · type code · effort normal$/m);
  editTask(root, '01-03-third-task.md', (t) => t.replace('status: draft', 'status: in-progress').replace('depends: [01-02]', 'depends: []'));
  assert.match(await ctxDo(root), /^Task: 01-03 \[in-progress\]/m);
});

test('a phase with every task done is complete', async () => {
  const root = repo();
  for (const f of ['01-02-second-task.md', '01-03-third-task.md']) {
    editTask(root, f, (t) => t.replace(/^status: \w+/m, 'status: done'));
  }
  assert.equal(await ctxDo(root), 'REFUSED: no approved task (phase complete)\n');
});

test('a draft task is refused', async () => {
  assert.equal(await ctxDo(repo(), '01-03'), 'REFUSED: 01-03 is draft, run /telos:approve\n');
});

test('an unmet depend is refused', async () => {
  const root = repo();
  editTask(root, '01-03-third-task.md', (t) => t.replace('status: draft', 'status: approved'));
  assert.equal(await ctxDo(root, '01-03'), 'REFUSED: 01-03 depends on 01-02 [approved]\n');
});

test('a proposed or awaited decision is refused', async () => {
  const root = repo();
  writeFileSync(join(root, DEMO, '01-CONTEXT.md'),
    '# 01 · Demo\n## Goal\nGreet people.\n## Decisions\n- D-01: keep it small\n- D-02 [proposed]: maybe\n');
  editTask(root, '01-02-second-task.md', (t) => t.replace('decisions: []', 'decisions: [D-02]'));
  assert.equal(await ctxDo(root), 'REFUSED: decision D-02 awaits the user\n');
  editTask(root, '01-02-second-task.md', (t) => t.replace('decisions: [D-02]', 'decisions: [D-01]'));
  edit(root, '.telos/STATUS.md', (t) => t.replace('Awaiting user: none', 'Awaiting user: 01:D-01'));
  assert.equal(await ctxDo(root), 'REFUSED: decision D-01 awaits the user\n');
});

test('effort hard adds a hint and keeps the full bundle', async () => {
  const root = repo();
  editTask(root, '01-02-second-task.md', (t) => t.replace('effort: normal', 'effort: hard'));
  const out = await ctxDo(root);
  assert.match(out, /^HINT: effort hard → suggest \/telos:do-hard 01-02 before any work$/m);
  assert.match(out, /^## Goal$/m);
});

test('the bundle has the task, STATUS, rules, stack, checks and excerpts in order', async () => {
  const out = await ctxDo(repo());
  const order = ['Task: 01-02', 'File: .telos/phases/01-demo/01-02-second-task.md', 'id: 01-02', '## Acceptance',
    'Status: phase 01-demo', 'Rules:\n- no runtime dependencies', 'Stack: ', 'Checks: ', 'Read first:', '--- src/a.ts:1-5 (greet)'];
  let at = -1;
  for (const part of order) {
    const i = out.indexOf(part);
    assert.ok(i > at, `${part} out of order`);
    at = i;
  }
  assert.doesNotMatch(out, /<!--|# draft \|/);
  assert.match(out, /--- src\/a\.ts:1-5 \(greet\)\nexport function greet\(name\) \{\n[\s\S]*export function bye\(name\) \{\n/);
});

test('a range past the end is clamped, a missing file says so', () => {
  const root = repo();
  const past = resolveRef(root, 'src/a.ts:5-20 (bye)');
  assert.equal(past.note, 'file has 7 lines');
  assert.equal(past.text, 'export function bye(name) {\n  return `bye ${name}`;\n}');
  assert.deepEqual(resolveRef(root, 'src/x.ts:1-3 (thing)'), { label: 'src/x.ts:1-3 (thing)', text: '', note: 'missing: src/x.ts (re-locate by label)' });
});

test('a file changed since the phase tag is flagged as stale', () => {
  const root = repo({ realGit: true });
  assert.equal(resolveRef(root, 'src/a.ts:1-3 (greet)', { since: 'telos/01-start' }).note, undefined);
  git(root, 'tag', 'telos/01-start');
  writeFileSync(join(root, 'src', 'a.ts'), '// moved\nexport function greet(name) {}\n');
  assert.equal(resolveRef(root, 'src/a.ts:1-3 (greet)', { since: 'telos/01-start' }).note, 'changed since plan, re-locate by label');
});

test('FILE.md §Section reads a .telos/ file first, then the repo root; numbered headings match exactly', () => {
  const root = repo();
  const conv = resolveRef(root, 'PROJECT.md §Conventions');
  assert.match(conv.text, /^## Conventions\n- name files in kebab-case$/);
  writeFileSync(join(root, 'SPEC.md'), '# Spec\n## 5. Commands\nall\n### 5.1 Core loop\nloop text\n### 5.2 Approval\nother\n## 6. Map\nmap\n');
  assert.equal(resolveRef(root, 'SPEC.md §5.1').text, '### 5.1 Core loop\nloop text');
  assert.equal(resolveRef(root, 'SPEC.md §5').text, '## 5. Commands\nall\n### 5.1 Core loop\nloop text\n### 5.2 Approval\nother');
  assert.equal(resolveRef(root, 'SPEC.md §5.1, §6 (loop and map)').text, '### 5.1 Core loop\nloop text\n\n## 6. Map\nmap');
  assert.equal(resolveRef(root, 'SPEC.md §9').note, 'no section §9 in SPEC.md');
});

test('a path without range includes short files whole; other refs are listed unresolved', () => {
  const root = repo();
  assert.match(resolveRef(root, 'src/a.ts (greeting module)').text, /export function bye/);
  writeFileSync(join(root, 'big.ts'), 'x\n'.repeat(200));
  assert.equal(resolveRef(root, 'big.ts (huge)').note, 'not included (200 lines); open the part you need');
  assert.equal(resolveRef(root, '01-CONTEXT.md D-06').note, 'unresolved: open it if needed');
});

test('a depend contributes only its Interface section', async () => {
  const root = repo();
  editTask(root, '01-01-first-task.md', (t) => t.replace('## Steps', '## Interface\nexport function greet(name: string): string\n\n## Steps')
    .replace('## Result', '## Result\nsecret result text'));
  const out = await ctxDo(root);
  assert.match(out, /^Interface of 01-01:\nexport function greet\(name: string\): string$/m);
  assert.doesNotMatch(out, /secret result text/);
});

test('decisions and the CONTEXT goal are included when the phase has a CONTEXT', async () => {
  const root = repo();
  writeFileSync(join(root, DEMO, '01-CONTEXT.md'),
    '# 01 · Demo\n## Goal\nGreet people.\n## Decisions\n- D-01: keep it small\n- D-03: other\n');
  editTask(root, '01-02-second-task.md', (t) => t.replace('decisions: []', 'decisions: [D-01]'));
  const out = await ctxDo(root);
  assert.match(out, /^Phase goal: Greet people\.\nDecisions:\n- D-01: keep it small$/m);
  assert.doesNotMatch(out, /D-03/);
});

test('MAP lines mentioning a scope path are added, a stub MAP adds only the Not built yet hint', async () => {
  const root = repo();
  writeFileSync(join(root, '.telos', 'MAP.md'), render('MAP.md', {}));
  const stub = await ctxDo(root);
  assert.match(stub, /^Map: Not built yet: run `\/telos:map`\. Until then, locate code with targeted Glob\/Grep; never read the whole repo\.$/m);
  assert.equal(stub.match(/^Map/gm).length, 1);
  writeFileSync(join(root, '.telos', 'MAP.md'), '# Map\n## Structure\n- src/ — app code\n- docs/ — docs\n');
  assert.match(await ctxDo(root), /^Map:\n- src\/ — app code$/m);
  const rows = Array.from({ length: 15 }, (_, i) => `- src/m${i}.ts — module ${i}`).join('\n');
  writeFileSync(join(root, '.telos', 'MAP.md'), `# Map\n## Find\n${rows}\n`);
  const built = (await ctxDo(root)).split('Map:\n')[1].split('\n').filter((l) => l.startsWith('- src/m'));
  assert.equal(built.length, 10);
});

test('a long bundle cuts excerpts, never the task file', async () => {
  const root = repo();
  writeFileSync(join(root, 'long.ts'), 'const filler = 1; // padding padding padding\n'.repeat(400));
  editTask(root, '01-02-second-task.md', readFirst(['- long.ts:1-300 (filler)', '- src/a.ts:1-3 (greet)']));
  const out = await ctxDo(root);
  assert.ok(out.length <= CAP + 1, String(out.length));
  assert.match(out, /^## Result$/m);
  assert.match(out, /^--- src\/a\.ts:1-3 \(greet\)\nexport function greet\(name\) \{\n  return `hello \$\{name\}`;\n\}$/m);
  assert.match(out, /^…\[cut; open long\.ts:1-300 for the rest\]$/m);
});
