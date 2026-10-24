import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { lintPhase } from '../lib/lint-plan.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const DEMO = join('.telos', 'phases', '01-demo');
const SECOND = '01-02-second-task.md';

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'telos-lint-'));
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

/** Lint phase 01 after rewriting task 01-02 with `edit`; returns the problems of 01-02 only. */
function lintEdited(edit, root = repo()) {
  const path = join(root, DEMO, SECOND);
  writeFileSync(path, edit(readFileSync(path, 'utf8')));
  return lintPhase(root, '01').problems.filter((p) => p.startsWith('01-02: ')).map((p) => p.slice(7));
}

const DETAILED = (t) => t.replace('effort: normal', 'effort: hard')
  .replace('## Steps', '## Interface\nexport function greet(name)\n\n## Edge cases\n- empty name → "hello"\n\n## Steps');

test('the fixture phase is clean', async () => {
  const r = await telos(repo(), 'lint-plan', '01');
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.stdout, 'ok: 3 tasks\n');
});

test('without an argument the phase comes from STATUS', async () => {
  const r = await telos(repo(), 'lint-plan');
  assert.equal(r.stdout, 'ok: 3 tasks\n');
});

test('problems print one line each with a count and exit 1', async () => {
  const root = repo();
  const r = await telos(root, 'lint-plan', '09');
  assert.equal(r.code, 1);
  assert.match(r.stdout, /^09-01: scope empty$/m);
  assert.match(r.stdout, /^09-02: missing section: Tests$/m);
  assert.match(r.stdout, /^\d+ problems$/m);
});

test('a phase without tasks or an unknown argument', async () => {
  const root = repo();
  const r = await telos(root, 'lint-plan', '05');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no tasks in phase 05/);
  assert.equal((await telos(root, 'lint-plan', 'x')).code, 2);
});

test('empty or missing scope', () => {
  assert.deepEqual(lintEdited((t) => t.replace('scope: [src/]', 'scope: []')),
    ['scope empty', 'file outside scope: src/a.ts']);
  assert.deepEqual(lintEdited((t) => t.replace('scope: [src/]\n', '')),
    ['scope empty', 'file outside scope: src/a.ts']);
});

test('a Files item outside scope', () => {
  assert.deepEqual(lintEdited((t) => t.replace('- src/a.ts (modify)', '- src/a.ts (modify)\n- lib/b.ts (create)')),
    ['file outside scope: lib/b.ts']);
});

test('a Files item may list several paths', () => {
  assert.deepEqual(lintEdited((t) => t.replace('- src/a.ts (modify)', '- src/a.ts, `src/b.ts`, lib/c.ts (modify)')),
    ['file outside scope: lib/c.ts']);
});

test('missing required sections', () => {
  assert.deepEqual(lintEdited((t) => t.replace('## Goal\n', '').replace('## Result', '')),
    ['missing section: Goal', 'missing section: Result']);
});

test('Tests are required for code and forbidden for doc and audit', () => {
  assert.deepEqual(lintEdited((t) => t.replace('- greets by name', '<!-- none yet -->')), ['missing section: Tests']);
  assert.deepEqual(lintEdited((t) => t.replace('type: code ', 'type: doc  ')), ['Tests only for type code']);
});

test('detailed tasks need Interface and non-empty Edge cases', () => {
  assert.deepEqual(lintEdited((t) => t.replace('effort: normal', 'effort: hard')),
    ['detailed task needs: Interface, Edge cases']);
  assert.deepEqual(lintEdited((t) => t.replace('critical: false', 'critical: true')),
    ['detailed task needs: Interface, Edge cases']);
  assert.deepEqual(lintEdited(DETAILED), []);
  assert.deepEqual(lintEdited((t) => DETAILED(t).replace('- empty name → "hello"', '<!-- todo -->')),
    ['empty section: Edge cases']);
});

test('line limits are 80 for normal and 140 for detailed tasks', () => {
  const pad = (n) => (t) => t.replace('## Steps\n', `## Steps\n${'1. step\n'.repeat(n)}`);
  assert.deepEqual(lintEdited(pad(60)), ['too long: 94 > 80 lines']);
  assert.deepEqual(lintEdited((t) => pad(60)(DETAILED(t))), []);
  assert.deepEqual(lintEdited((t) => pad(120)(DETAILED(t))), ['too long: 160 > 140 lines']);
});

test('acceptance needs a machine-checkable item, code also the tests item', () => {
  assert.deepEqual(lintEdited((t) => t.replace('- [ ] `true` → exit 0', '- [ ] works')),
    ['no machine-checkable acceptance']);
  assert.deepEqual(lintEdited((t) => t.replace('- [ ] all listed tests pass\n', '')),
    ['missing: all listed tests pass']);
});

test('unknown depends and depend cycles', () => {
  assert.deepEqual(lintEdited((t) => t.replace('depends: [01-01]', 'depends: [01-09]')), ['unknown depend: 01-09']);
  assert.deepEqual(lintEdited((t) => t.replace('depends: [01-01]', 'depends: [01-03]')),
    ['depend cycle: 01-02 → 01-03 → 01-02']);
  // a depend on an existing task of another phase is fine; a missing one is not
  assert.deepEqual(lintEdited((t) => t.replace('depends: [01-01]', 'depends: [09-01]')), []);
  assert.deepEqual(lintEdited((t) => t.replace('depends: [01-01]', 'depends: [08-01]')), ['unknown depend: 08-01']);
});

test('decisions must exist in CONTEXT when it exists', () => {
  const root = repo();
  const withD04 = (t) => t.replace('decisions: []', 'decisions: [D-01, D-04]');
  assert.deepEqual(lintEdited(withD04, root), []);
  writeFileSync(join(root, DEMO, '01-CONTEXT.md'),
    '# 01 · Demo\n## Decisions\n- D-01: keep it small\n- D-02 [proposed]: maybe\n');
  assert.deepEqual(lintEdited(withD04, root), ['unknown decision: D-04']);
});

test('frontmatter id must match the file name', () => {
  assert.deepEqual(lintEdited((t) => t.replace('id: 01-02', 'id: 01-05')), ['id mismatch: file 01-02, id 01-05']);
});

test('audit tasks are limited to .telos/', () => {
  const audit = (t) => t.replace('type: code ', 'type: audit').replace(/## Tests[^\n]*\n- greets by name\n/, '')
    .replace('- src/a.ts (modify)', '- none').replace('- [ ] all listed tests pass\n', '');
  assert.deepEqual(lintEdited(audit), ['audit scope must be [".telos/"]']);
  assert.deepEqual(lintEdited((t) => audit(t).replace('scope: [src/]', 'scope: [".telos/"]')), []);
});

test('invalid enum values are reported', () => {
  assert.deepEqual(lintEdited((t) => t.replace('status: approved', 'status: ready')), ['invalid status: ready']);
});
