import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';
import { requireMessage } from '../lib/config.mjs';
import { CAP } from '../lib/ctx/index.mjs';
import { init } from '../lib/init.mjs';
import { LIMIT, formatLesson, parseLessons, readLessons, sameArea } from '../lib/lessons.mjs';
import { render } from '../lib/template.mjs';

function repo(t, profile = 'standard') {
  const root = mkdtempSync(join(tmpdir(), 'telos-lessons-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.git'));
  init(root, { profile, stack: [], checks: {} });
  return root;
}

const lessonsPath = (root) => join(root, '.telos', 'LESSONS.md');
const setStatus = (root, from, to) => {
  const path = join(root, '.telos', 'STATUS.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace(from, to));
};

async function ctx(root) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(['ctx', 'lesson'], { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

test('the parser returns canonical entries and skips the title, comments and none', () => {
  const text = '# Lessons\n<!-- - [tests] commented out (01-01) -->\n'
    + '- [src/game/] Keep  board pure (01-02)\n-  [tests] Run node --test per file (quick)  \n';
  const { entries, problems } = parseLessons(text);
  assert.deepEqual(problems, []);
  assert.deepEqual(entries.map(({ area, text: t, ref, line }) => ({ area, text: t, ref, line })), [
    { area: 'src/game/', text: 'Keep board pure', ref: '01-02', line: 3 },
    { area: 'tests', text: 'Run node --test per file', ref: 'quick', line: 4 },
  ]);
  assert.equal(formatLesson(entries[0]), '- [src/game/] Keep board pure (01-02)');
  assert.deepEqual(parseLessons(render('LESSONS.md', {})), { entries: [], problems: [] });
});

test('malformed entries are flagged with their line, never dropped silently', () => {
  const { entries, problems } = parseLessons('# Lessons\n- no area (01-01)\n- [git] no ref\n- [git] bad ref (v1)\nloose text\n- [] empty (quick)\n');
  assert.equal(entries.length, 0);
  assert.deepEqual(problems.map((p) => p.line), [2, 3, 4, 5, 6]);
  for (const p of problems) assert.ok(p.reason, p.raw);
});

test('areas match when equal or nested path prefixes, never across distinct topics', () => {
  assert.ok(sameArea('tests', 'Tests'));
  assert.ok(sameArea('src/game/', 'src/game/board/'));
  assert.ok(sameArea('src/game', 'src/game/'));
  assert.ok(!sameArea('src/game/', 'src/gameplay/'));
  assert.ok(!sameArea('tests', 'git'));
});

test('readLessons reports a missing file explicitly', (t) => {
  const root = repo(t);
  assert.equal(readLessons(root).exists, true);
  rmSync(lessonsPath(root));
  assert.equal(readLessons(root).exists, false);
});

test('minimal gets the exact profile requirement', async (t) => {
  const r = await ctx(repo(t, 'minimal'));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, `${requireMessage('standard')}\n`);
});

test('missing LESSONS refuses with the repair; an empty one shows 0/20 and the quick ref', async (t) => {
  const root = repo(t);
  const empty = await ctx(root);
  assert.match(empty.stdout, /^Lessons: 0\/20$/m);
  assert.match(empty.stdout, /^Ref: quick\b/m);
  rmSync(lessonsPath(root));
  const missing = await ctx(root);
  assert.match(missing.stdout, /^REFUSED: \.telos\/LESSONS\.md is missing; restore it with `telos profile standard`/);
});

test('the current STATUS task is the default ref, numbered entries and malformed lines are shown', async (t) => {
  const root = repo(t);
  setStatus(root, 'Task: none', 'Task: 03-02');
  writeFileSync(lessonsPath(root), '# Lessons\n- [tests] Keep fixtures tiny (01-01)\n- broken line\n');
  const r = await ctx(root);
  assert.match(r.stdout, /^Ref: 03-02\b/m);
  assert.match(r.stdout, /^Lessons: 1\/20$/m);
  assert.match(r.stdout, /^L1 \(line 2\) \[tests\] Keep fixtures tiny \(01-01\)$/m);
  assert.match(r.stdout, /^Malformed:\n- line 3: /m);
});

test('a full list shows all 20 entries within the cap and says no 21st is added', async (t) => {
  const root = repo(t, 'deep');
  const lines = Array.from({ length: LIMIT }, (_, i) =>
    `- [src/area${i}/] ${'long lesson text '.repeat(12).trim()} ${i} (01-${String(i + 1).padStart(2, '0')})`);
  writeFileSync(lessonsPath(root), `# Lessons\n${lines.join('\n')}\n`);
  const project = join(root, '.telos', 'PROJECT.md');
  writeFileSync(project, readFileSync(project, 'utf8')
    .replace('## Conventions\n', `## Conventions\n${'- a convention line that is fairly long\n'.repeat(80)}`));
  const r = await ctx(root);
  assert.ok(r.stdout.trimEnd().length <= CAP, String(r.stdout.length));
  assert.match(r.stdout, /^Lessons: 20\/20 \(full\b/m);
  for (let i = 1; i <= LIMIT; i++) assert.match(r.stdout, new RegExp(`^L${i} \\(line ${i + 1}\\) `, 'm'));
  assert.match(r.stdout, /promot/i);
});
