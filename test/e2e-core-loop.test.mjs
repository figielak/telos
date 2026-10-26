import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { check } from '../lib/git-guard.mjs';

// End to end at CLI level (02:D-11): the test plays the skills — plan, approve, do ×2 — using only
// `telos` and `git` in a temp copy of the fixture. Tests run in order and share `root`.

const FIXTURE = fileURLToPath(new URL('fixtures/minimal-loop/', import.meta.url));
const PHASE = '.telos/phases/01-greeting';
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
const write = (path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
const read = (path) => readFileSync(join(root, path), 'utf8');

let root;

async function telos(...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  // `accept` runs the fixture's `node --test`, which must report normally, not as a child of this runner.
  const context = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const code = await main(args, { cwd: root, stdout: out, stderr: err });
    return { code, stdout: out.text, stderr: err.text };
  } finally {
    if (context !== undefined) process.env.NODE_TEST_CONTEXT = context;
  }
}

async function ok(...args) {
  const r = await telos(...args);
  assert.equal(r.code, 0, `telos ${args.join(' ')}: ${r.stdout}${r.stderr}`);
  return r.stdout;
}

const taskBody = ({ goal, file, test }) => `## Goal
${goal}

## Read first
- src/index.mjs (exports)

## Files
- ${file} (create)
- ${test} (create)

## Constraints
- no dependencies

## Tests (write first)
- ${goal}

## Steps
1. Write ${test}.
2. Implement ${file}.

## Acceptance
- [ ] all listed tests pass
- [ ] \`node --test\` → exit 0

## Result
`;

/** Fill a draft task file the way /telos:plan does: frontmatter fields and body. */
function fillTask(id, { depends = '[]', ...body }) {
  const path = `${PHASE}/${readdirName(id)}`;
  const [head] = read(path).split('\n---\n');
  write(path, `${head.replace(/^depends: .*$/m, `depends: ${depends}`).replace(/^scope: .*$/m, 'scope: [src/, test/]')}\n---\n${taskBody(body)}`);
}

function readdirName(id) {
  return readdirSync(join(root, PHASE)).find((f) => f.startsWith(`${id}-`));
}

/** Fill Result the way /telos:do step 4 does. */
function fillResult(id, lines) {
  const path = `${PHASE}/${readdirName(id)}`;
  write(path, read(path).replace(/## Result\n[\s\S]*$/, `## Result\n${lines.join('\n')}\n`).replaceAll('- [ ] ', '- [x] '));
}

test('setup: init minimal in a fresh repo', async () => {
  root = mkdtempSync(join(tmpdir(), 'telos-e2e-'));
  cpSync(FIXTURE, root, { recursive: true });
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  git('config', 'commit.gpgsign', 'false');
  git('add', 'package.json', 'README.md', 'src/index.mjs');
  git('commit', '-q', '-m', 'chore: init');
  await ok('init', '--profile', 'minimal', '--checks', '{"test":"node --test"}');
  git('add', '.telos', 'CLAUDE.md', '.gitignore');
  git('commit', '-q', '-m', 'docs(telos): initialize telos');
});

test('plan: roadmap add, two task files, lint-plan passes', async () => {
  assert.match(await ok('roadmap', 'add', 'greeting', 'greet and farewell helpers', 'both helpers tested'), /01/);
  await ok('task', 'new', '01', 'greet', 'Add greet');
  await ok('task', 'new', '01', 'farewell', 'Add farewell');
  fillTask('01-01', { goal: 'greet(name) returns "Hello, <name>!"', file: 'src/greet.mjs', test: 'test/greet.test.mjs' });
  fillTask('01-02', { goal: 'farewell(name) returns "Bye, <name>."', file: 'src/farewell.mjs', test: 'test/farewell.test.mjs', depends: '[01-01]' });
  assert.match(await ok('lint-plan', '01'), /^ok: 2 tasks/);
  await ok('roadmap', 'set', '01', 'drafted');
  await ok('status', 'set', 'phase=01-greeting', 'task=none', 'next=/telos:approve');
});

test('approve: tasks approved, phase active, plan commit and phase tag', async () => {
  await ok('task', 'set', '01-01', '01-02', 'status=approved');
  await ok('roadmap', 'set', '01', 'active');
  await ok('status', 'set', 'task=01-01', 'next=/telos:do');
  git('add', `${PHASE}/`, '.telos/ROADMAP.md', '.telos/STATUS.md');
  git('commit', '-q', '-m', 'docs(telos): plan phase 01-greeting', '-m', '- greet and farewell helpers, 2 tasks');
  git('tag', 'telos/01-start');
  assert.match(read('.telos/ROADMAP.md'), /^- 01-greeting \[active\]/m);
  assert.equal(git('status', '--porcelain'), '');
});

test('do 01-01: picked first, accepted, one feat commit', async () => {
  assert.match(await ok('ctx', 'do'), /^Task: 01-01 \[approved\]/);
  assert.match(await ok('ctx', 'do', '01-02'), /^REFUSED: 01-02 depends on 01-01 \[approved\]/);
  await ok('task', 'set', '01-01', 'status=in-progress');
  write('test/greet.test.mjs', "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { greet } from '../src/greet.mjs';\n\ntest('greet', () => assert.equal(greet('Ada'), 'Hello, Ada!'));\n");
  assert.equal((await telos('accept', '01-01')).code, 1, 'RED before the implementation');
  write('src/greet.mjs', 'export const greet = (name) => `Hello, ${name}!`;\n');
  assert.match(await ok('accept', '01-01'), /accept 01-01: PASS/);
  fillResult('01-01', ['- src/greet.mjs + 1 test.', 'Deviations: none']);
  await ok('task', 'set', '01-01', 'status=done');
  await ok('status', 'add', 'recent', '01-01 done: greet');
  await ok('status', 'set', 'task=01-02', 'next=/telos:do');
  assert.equal(check('git add .', { headPushed: () => false })?.rule, 'add-all');
  git('add', 'src/greet.mjs', 'test/greet.test.mjs', `${PHASE}/${readdirName('01-01')}`, '.telos/STATUS.md');
  git('commit', '-q', '-m', 'feat(01-01): add greet helper', '-m', '- greet(name) returns a greeting');
  assert.equal(git('status', '--porcelain'), '');
});

test('do 01-02: picked after 01-01, out-of-scope file fails until listed in Deviations', async () => {
  assert.match(await ok('ctx', 'do'), /^Task: 01-02 \[approved\]/);
  await ok('task', 'set', '01-02', 'status=in-progress');
  write('test/farewell.test.mjs', "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { farewell } from '../src/farewell.mjs';\n\ntest('farewell', () => assert.equal(farewell('Ada'), 'Bye, Ada.'));\n");
  write('src/farewell.mjs', 'export const farewell = (name) => `Bye, ${name}.`;\n');
  write('README.md', `${read('README.md')}\nExports greet and farewell.\n`);
  const failed = await telos('accept', '01-02');
  assert.equal(failed.code, 1);
  assert.match(failed.stdout, /SCOPE {2}FAIL README\.md/);
  fillResult('01-02', ['- src/farewell.mjs + 1 test.', 'Deviations: README.md — documents the new exports']);
  assert.match(await ok('accept', '01-02'), /accept 01-02: PASS/);
  await ok('task', 'set', '01-02', 'status=done');
  await ok('status', 'add', 'recent', '01-02 done: farewell');
  await ok('roadmap', 'set', '01', 'done');
  await ok('status', 'set', 'task=none', 'next=/telos:plan');
  git('add', 'src/farewell.mjs', 'test/farewell.test.mjs', 'README.md', `${PHASE}/${readdirName('01-02')}`, '.telos/STATUS.md', '.telos/ROADMAP.md');
  git('commit', '-q', '-m', 'feat(01-02): add farewell helper', '-m', '- farewell(name) returns a goodbye');
});

test('phase end: ROADMAP done, one commit per task, clean tree, nothing left to do', async () => {
  assert.match(read('.telos/ROADMAP.md'), /^- 01-greeting \[done\]/m);
  const commits = git('log', '--format=%s', '--grep', '^[a-z]*(01-0[12]):').trim().split('\n');
  assert.deepEqual(commits, ['feat(01-02): add farewell helper', 'feat(01-01): add greet helper']);
  assert.equal(git('rev-list', '--count', 'telos/01-start..HEAD').trim(), '2');
  assert.equal(git('status', '--porcelain'), '');
  assert.match(await ok('ctx', 'do'), /^REFUSED: no approved task \(phase complete\)/);
});
