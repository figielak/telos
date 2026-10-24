import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';
import { phaseLine } from '../lib/roadmap.mjs';
import { render } from '../lib/template.mjs';

const ROADMAP = `# Roadmap
<!-- comment -->
## M1 · Basics
- 01-skeleton [done] plugin skeleton · done when: init works
- 02-core-loop [planned] core loop · done when: a phase runs end to end
<!-- trailing comment -->
`;

function repo(text = ROADMAP) {
  const root = mkdtempSync(join(tmpdir(), 'telos-roadmap-'));
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, '.telos'));
  writeFileSync(join(root, '.telos', 'ROADMAP.md'), text);
  return root;
}

const roadmap = (root) => readFileSync(join(root, '.telos', 'ROADMAP.md'), 'utf8');

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

test('set changes only the status token of the phase line', async () => {
  const root = repo();
  const r = await telos(root, 'roadmap', 'set', '02', 'active');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, '02-core-loop [active]\n');
  assert.equal(roadmap(root), ROADMAP.replace('[planned]', '[active]'));
});

test('set fails for a missing phase and rejects unknown statuses', async () => {
  const root = repo();
  const missing = await telos(root, 'roadmap', 'set', '07', 'done');
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /no phase 07/);
  const bad = await telos(root, 'roadmap', 'set', '02', 'finished');
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /planned, drafted, active, done, dropped/);
  assert.equal((await telos(root, 'roadmap', 'set', '2', 'done')).code, 2);
  assert.equal(roadmap(root), ROADMAP);
});

test('add appends the next phase after the last phase line', async () => {
  const root = repo();
  const r = await telos(root, 'roadmap', 'add', 'auth', 'login', 'users can log in');
  assert.equal(r.code, 0, r.stderr);
  const line = '- 03-auth [planned] login · done when: users can log in';
  assert.equal(r.stdout, `${line}\n`);
  assert.equal(roadmap(root), ROADMAP.replace('end to end\n', `end to end\n${line}\n`));
});

test('add counts dropped phases and replaces the empty template marker', async () => {
  const dropped = repo(ROADMAP.replace('[planned]', '[dropped]'));
  await telos(dropped, 'roadmap', 'add', 'auth', 'login', 'done');
  assert.match(roadmap(dropped), /^- 03-auth \[planned\]/m);

  const fresh = repo(render('ROADMAP.md', {}));
  const r = await telos(fresh, 'roadmap', 'add', 'first', 'start', 'it runs');
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(roadmap(fresh), /^- none$/m);
  assert.match(roadmap(fresh), /-->\n- 01-first \[planned\] start · done when: it runs\n$/);
});

test('add validates name, goal and criterion', async () => {
  const root = repo();
  assert.equal((await telos(root, 'roadmap', 'add', 'Auth_X', 'g', 'd')).code, 2);
  assert.equal((await telos(root, 'roadmap', 'add', 'auth', 'g')).code, 2);
  assert.equal((await telos(root, 'roadmap', 'add', 'auth', 'g · done when: x', 'd')).code, 2);
  assert.equal(roadmap(root), ROADMAP);
});

test('phaseLine parses goal and criterion, null for a missing phase', () => {
  const root = repo();
  assert.deepEqual(phaseLine(root, '02'),
    { nn: '02', name: '02-core-loop', status: 'planned', goal: 'core loop', done: 'a phase runs end to end' });
  assert.equal(phaseLine(root, '05'), null);
});

test('a missing ROADMAP.md exits 1 as not initialized', async () => {
  const root = repo();
  rmSync(join(root, '.telos', 'ROADMAP.md'));
  const r = await telos(root, 'roadmap', 'set', '02', 'active');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /not initialized/);
  assert.equal(phaseLine(root, '02'), null);
});
