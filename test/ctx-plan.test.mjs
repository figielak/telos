import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { CAP } from '../lib/ctx/index.mjs';
import { render } from '../lib/template.mjs';
import { checklist, createPhase } from '../lib/phases.mjs';
import { memoryRepo } from './memory-repo.mjs';

function repo() {
  const root = memoryRepo(null);
  const project = render('PROJECT.md', { name: 'demo' })
    .replace('## Purpose\n', '## Purpose\nA demo app that greets people.\n')
    .replace(/## Rules\n[\s\S]*?- none/, '## Rules\n- no runtime dependencies')
    .replace('## Conventions\n', '## Conventions\n- secret convention text\n');
  writeFileSync(join(root, '.telos', 'PROJECT.md'), project);
  const status = join(root, '.telos', 'STATUS.md');
  writeFileSync(status, readFileSync(status, 'utf8')
    .replace(/## Carry-over\n((?:<!--[\s\S]*?-->\n)?)- none/, '## Carry-over\n$1- 04: later thing → 01-01 Result\n- 01: rate limit → 01-01 Result\n- 03: new phase item → SPEC'));
  return root;
}

async function ctx(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(['ctx', ...args], { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

const SELF = fileURLToPath(new URL('../', import.meta.url));

test('ctx plan NN shows the target, the phase skeleton, project, stack, checks and the roadmap', async () => {
  const root = repo();
  const r = await ctx(root, 'plan', '01');
  assert.equal(r.code, 0, r.stderr);
  const out = r.stdout;
  assert.match(out, /^Target: 01-demo \[active\] demo phase · done when: demo works$/m);
  assert.match(out, /^Phase file: \.telos\/phases\/01-demo\.md \(missing; write it from this skeleton\)\n# 01-demo\n\n## Goal\ndemo phase\n\n## Done when\ndemo works\n\n## Tasks\n- \[ \] \*\*01-01 <title>\*\*$/m);
  assert.match(out, /^Carry-over:\n- rate limit → 01-01 Result$/m);
  assert.doesNotMatch(out, /later thing|new phase item/);
  assert.match(out, /^Purpose: A demo app that greets people\.$/m);
  assert.match(out, /^Rules:\n- no runtime dependencies$/m);
  assert.doesNotMatch(out, /secret convention text/);
  assert.match(out, /^Stack: /m);
  assert.match(out, /^Checks: none$/m);
  assert.match(out, /^Auto-commit: yes$/m);
  assert.match(out, /^Roadmap:\n- 01-demo \[active\] demo phase\n- 02-next \[planned\] next phase$/m);
  assert.doesNotMatch(out, /<!--|Format:|telos task new|lint-plan/);
  assert.equal(existsSync(join(root, '.telos', 'phases', '01-demo.md')), false, 'the bundle never writes');
});

test('an existing phase file is reported with its checklist state instead of the skeleton', async () => {
  const root = repo();
  mkdirSync(join(root, '.telos', 'phases'));
  writeFileSync(join(root, '.telos', 'phases', '01-demo.md'), '# 01-demo\n\n## Tasks\n- [x] **01-01 First**\n- [ ] **01-02 Second**\n');
  const out = (await ctx(root, 'plan')).stdout;
  assert.match(out, /^Phase file: \.telos\/phases\/01-demo\.md \(exists, 1\/2 done; edit it in place\)$/m);
  assert.doesNotMatch(out, /## Goal/);
});

test('without an argument the bundle names the next NN; a description targets a new phase', async () => {
  const root = repo();
  assert.match((await ctx(root, 'plan')).stdout, /^Target: 01-demo \[active\][^\n]*\nNew phase: 03$/m);
  const fresh = (await ctx(root, 'plan', 'add', 'login')).stdout;
  assert.match(fresh, /^Target: new phase "add login" → 03 \(add it with telos roadmap add/m);
  assert.doesNotMatch(fresh, /^Phase file:|^New phase:/m);
  const status = join(root, '.telos', 'STATUS.md');
  writeFileSync(status, readFileSync(status, 'utf8').replace('Phase: 01-demo', 'Phase: none'));
  assert.match((await ctx(root, 'plan')).stdout, /^Target: none \(pass a phase NN or a description\)$/m);
});

test('Delete-zone approaches and MAP Find lines are listed; Delete-zone paths and the archive are not', async () => {
  const root = repo();
  writeFileSync(join(root, '.telos', 'HISTORY.md'), render('HISTORY.md', { date: '2026-01-01', profile: 'standard' })
    .replace(/(## Delete-zone\n(?:<!--[\s\S]*?-->\n)?)- none/, '$1- approach: Global mutable cache — leaked state (01-01, 2026-01-02)\n- `src/old/` — module removed (01-01, 2026-01-02)'));
  writeFileSync(join(root, '.telos', 'HISTORY-archive.md'), '# History archive\n\n## Log\n- 2025-01-01 remove 01-01: ARCHIVED secret\n');
  writeFileSync(join(root, '.telos', 'MAP.md'), '# Map\n\n## Structure\n- `src/` — code\n\n## Find\n- greet → `src/greet.mjs:1-9`\n');
  const out = (await ctx(root, 'plan', '01')).stdout;
  assert.match(out, /^Removed approaches \(never plan these\):\n- Global mutable cache — leaked state \(01-01\)$/m);
  assert.doesNotMatch(out, /src\/old|ARCHIVED/);
  assert.match(out, /^Find \(MAP\):\n- greet → `src\/greet\.mjs:1-9`$/m);
  assert.doesNotMatch(out, /Structure/);
});

test('a broken HISTORY is reported in the bundle instead of failing it', async () => {
  const root = repo();
  writeFileSync(join(root, '.telos', 'HISTORY.md'), '# History\n## Delete-zone\n- garbage\n## Log\n');
  const r = await ctx(root, 'plan', '01');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^Removed approaches: unavailable \(/m);
});

test('ctx plan 10 on this repository stays within 6000 chars without truncation', async () => {
  const r = await ctx(SELF, 'plan', '10');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.length <= CAP + 1, String(r.stdout.length));
  assert.doesNotMatch(r.stdout, /truncated by telos ctx/);
});

test('createPhase writes the template for a ROADMAP phase once; checklist reads its boxes', () => {
  const root = repo();
  const first = createPhase(root, '02');
  assert.equal(first.created, true);
  assert.equal(first.path, join(root, '.telos', 'phases', '02-next.md'));
  const text = readFileSync(first.path, 'utf8');
  assert.match(text, /^# 02-next\n/);
  assert.ok(text.trimEnd().split('\n').length <= 80);
  assert.deepEqual(checklist(root, '02').items, [{ id: '02-01', text: '02-01 <title>', done: false }]);
  writeFileSync(first.path, text.replace('- [ ] **02-01 <title>**', '- [x] **02-01 One**\n  - [ ] nested is ignored\n- [ ] **02-02 Two**\n- [X] plain item'));
  assert.equal(createPhase(root, '02').created, false, 'an existing plan is kept');
  const state = checklist(root, '02');
  assert.deepEqual([state.exists, state.done, state.total], [true, 2, 3]);
  assert.deepEqual(state.items.map((i) => [i.id, i.done]), [['02-01', true], ['02-02', false], [null, true]]);
  assert.deepEqual(checklist(root, '07'), { path: null, exists: false, items: [], done: 0, total: 0 });
});

