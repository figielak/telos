import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { CAP, contextOf } from '../lib/ctx/index.mjs';
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
  return { code, stdout: contextOf(out.text), stderr: err.text };
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

// 14-05: removed paths are listed too; the Delete-zone edit warning is a Claude Code hook only.
test('Delete-zone approaches, removed paths and the MAP index are listed; the archive is not', async () => {
  const root = repo();
  writeFileSync(join(root, '.telos', 'HISTORY.md'), render('HISTORY.md', { date: '2026-01-01' })
    .replace(/(## Delete-zone\n(?:<!--[\s\S]*?-->\n)?)- none/, '$1- approach: Global mutable cache — leaked state (01-01, 2026-01-02)\n- `src/old/` — module removed (01-01, 2026-01-02)'));
  writeFileSync(join(root, '.telos', 'HISTORY-archive.md'), '# History archive\n\n## Log\n- 2025-01-01 remove 01-01: ARCHIVED secret\n');
  writeFileSync(join(root, '.telos', 'MAP.md'), '# Map\n\n## Structure\n- `src/` — code\n\n## Find\n- greet → `src/greet.mjs:1-9`\n');
  const out = (await ctx(root, 'plan', '01')).stdout;
  assert.match(out, /^Removed approaches \(never plan these\):\n- Global mutable cache — leaked state \(01-01\)$/m);
  assert.match(out, /^Removed paths \(never recreate; reasons in HISTORY\.md\): `src\/old`$/m);
  assert.doesNotMatch(out, /ARCHIVED/);
  assert.match(out, /^Map index \(\.telos\/MAP\.md\):\n## Structure\n- `src\/` — code\n## Find\n- greet → `src\/greet\.mjs:1-9`$/m);
  rmSync(join(root, '.telos', 'MAP.md'));
  assert.match((await ctx(root, 'plan', '01')).stdout, /^Map index: none \(run \/telos:map\)$/m);
});

// 11-04: selective loading of area files.
const HASH = 'a'.repeat(40);
function withAreas(root, size = 0) {
  mkdirSync(join(root, '.telos', 'areas'), { recursive: true });
  const spec = { web: 'src/web/', api: 'src/api/', db: 'src/db/' };
  for (const [name, path] of Object.entries(spec)) {
    const text = render('area.md', { commit: HASH, date: '2026-11-16', paths: path, name })
      .replace('## Purpose\n', `## Purpose\nThe ${name} area secret-${name}.\n${'- filler line for the budget\n'.repeat(size)}`);
    writeFileSync(join(root, '.telos', 'areas', `${name}.md`), text);
  }
  writeFileSync(join(root, '.telos', 'MAP.md'), `# Map\n\n## Areas\n${Object.entries(spec).map(([n, p]) => `- ${n} — ${n} · \`${p}\``).join('\n')}\n`);
}

test('ctx plan --area includes only the area files matching the path, whole', async () => {
  const root = repo();
  withAreas(root);
  const out = (await ctx(root, 'plan', '01', '--area', 'src/api/routes.ts')).stdout;
  assert.match(out, /^Target: 01-demo /m);
  assert.match(out, /^Areas for src\/api\/routes\.ts: api$/m);
  assert.match(out, /^--- area api · paths: src\/api\/\n# api\n/m);
  assert.match(out, /secret-api/);
  assert.doesNotMatch(out, /secret-web|secret-db/);
  assert.ok(out.indexOf('--- end api') < out.indexOf('Roadmap:'));
  const both = (await ctx(root, 'plan', '--area', 'src/web/a.ts', '--area', 'src/db/b.ts')).stdout;
  assert.match(both, /^Areas for src\/web\/a\.ts, src\/db\/b\.ts: db, web$/m);
  assert.match(both, /secret-db[\s\S]*secret-web/);
  assert.match(both, /^Target: 01-demo /m);
  assert.match((await ctx(root, 'plan', '--area', 'src/other.ts')).stdout, /^Areas for src\/other\.ts: none$/m);
});

test('ctx plan without selectors shows the index only; over the cap areas become Read pointers', async () => {
  const root = repo();
  withAreas(root, 60);
  const plain = (await ctx(root, 'plan', '01')).stdout;
  assert.match(plain, /^## Areas\n- web — web · `src\/web\/`$/m);
  assert.doesNotMatch(plain, /secret-|Areas for/);
  const r = await ctx(root, 'plan', '01', '--area', 'src/');
  assert.equal(r.code, 0);
  assert.ok(r.stdout.length <= CAP + 1, String(r.stdout.length));
  assert.doesNotMatch(r.stdout, /truncated by telos ctx/);
  assert.match(r.stdout, /^Areas for src: api, db, web$/m);
  assert.match(r.stdout, /^--- area api /m);
  assert.match(r.stdout, /^Read \.telos\/areas\/web\.md$/m);
  assert.match(r.stdout, /^Roadmap:/m);
  for (const args of [['--area'], ['--area', '--area', 'x'], ['--area', '/elsewhere/x.ts']]) {
    assert.equal((await ctx(root, 'plan', ...args)).code, 2, args.join(' '));
  }
});

test('selected areas outrank the roadmap: a long roadmap keeps the rows nearest the target', async () => {
  const root = repo();
  withAreas(root, 60);
  const file = join(root, '.telos', 'ROADMAP.md');
  const rows = Array.from({ length: 40 }, (_, i) => `- ${String(i + 3).padStart(2, '0')}-later [planned] ${'goal text '.repeat(14)}· done when: it works`);
  writeFileSync(file, `${readFileSync(file, 'utf8').trimEnd()}\n${rows.join('\n')}\n`);
  const plain = (await ctx(root, 'plan', '01')).stdout;
  assert.doesNotMatch(plain, /truncated by telos ctx/, 'without --area the roadmap keeps the rows that fit');
  assert.ok(plain.length <= CAP + 1, String(plain.length));
  assert.match(plain, /^Roadmap:\n- 01-demo \[active\] demo phase\n- 02-next /m);
  assert.match(plain, /^\(\d+ more in \.telos\/ROADMAP\.md\)$/m);
  const r = await ctx(root, 'plan', '01', '--area', 'src/api/x.ts');
  assert.ok(r.stdout.length <= CAP + 1, String(r.stdout.length));
  assert.doesNotMatch(r.stdout, /truncated by telos ctx/);
  assert.match(r.stdout, /^--- area api /m);
  assert.match(r.stdout, /^--- end api\nRoadmap:\n- 01-demo \[active\] demo phase\n- 02-next /m);
  assert.doesNotMatch(r.stdout, /^- 42-later /m);
  assert.match(r.stdout, /^\(\d+ more in \.telos\/ROADMAP\.md\)$/m);
  // A later target keeps its own neighbourhood instead of the head of the list.
  const late = (await ctx(root, 'plan', '30', '--area', 'src/api/x.ts')).stdout;
  assert.match(late, /^--- area api /m);
  assert.match(late, /^- 30-later /m);
  assert.doesNotMatch(late, /^- 01-demo /m);
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

