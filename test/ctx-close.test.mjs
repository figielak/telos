import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { requireMessage } from '../lib/config.mjs';
import { CAP } from '../lib/ctx/index.mjs';
import { readHistory } from '../lib/history.mjs';
import { render } from '../lib/template.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const DEMO = join('.telos', 'phases', '01-demo');
const CONTEXT = '# 01 · demo\n## Goal\nShip the demo.\n\n## Decisions\n'
  + '- D-01: Store greetings in SQLite.\n- D-02: Name the helper greet.\n\n## Constraints\n- none\n\n'
  + '## Open questions\n- none\n\n## Carried over\n- none\n\n## Links\n- none\n';

function repo(t, { profile = 'standard', checks = { test: 'npm test', lint: 'npm run lint' }, git } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-ctx-close-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(FIXTURE, root, { recursive: true });
  rmSync(join(root, '.telos', 'phases', '09-bad'), { recursive: true });
  mkdirSync(join(root, '.git'));
  const cfg = join(root, '.telos', 'config.json');
  const base = JSON.parse(readFileSync(cfg, 'utf8'));
  writeFileSync(cfg, JSON.stringify({ ...base, profile, checks, ...(git ? { git } : {}) }, null, 2));
  writeFileSync(join(root, '.telos', 'HISTORY.md'), render('HISTORY.md', { date: '2026-01-01', profile }));
  writeFileSync(join(root, DEMO, '01-CONTEXT.md'), CONTEXT);
  return root;
}

function setTask(root, file, from, to) {
  const path = join(root, DEMO, file);
  writeFileSync(path, readFileSync(path, 'utf8').replace(from, to));
}

function allDone(root) {
  setTask(root, '01-02-second-task.md', 'status: approved', 'status: done');
  setTask(root, '01-03-third-task.md', /status: \w+/, 'status: done');
  return root;
}

const edit = (root, rel, fn) => writeFileSync(join(root, rel), fn(readFileSync(join(root, rel), 'utf8')));

function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else out[path] = readFileSync(path, 'utf8');
    }
  };
  walk(join(root, '.telos'));
  return out;
}

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

test('minimal gets the exact requirement from both bundles', async (t) => {
  const root = repo(t, { profile: 'minimal' });
  for (const name of ['check', 'done']) {
    assert.equal((await telos(root, 'ctx', name)).stdout, `${requireMessage('standard')}\n`, name);
  }
});

test('unknown, empty, not-yet-active phases refuse; a malformed argument is a usage error', async (t) => {
  const root = repo(t);
  for (const name of ['check', 'done']) {
    assert.match((await telos(root, 'ctx', name, '07')).stdout, /^REFUSED: no phase 07 in ROADMAP/, name);
    assert.equal((await telos(root, 'ctx', name, 'x')).code, 2, name);
    assert.equal((await telos(root, 'ctx', name, '01', '02')).code, 2, name);
  }
  edit(root, '.telos/ROADMAP.md', (s) => s.replace('02-next [planned]', '02-next [active]'));
  assert.match((await telos(root, 'ctx', 'done', '02')).stdout, /^REFUSED: phase 02 has no task files/);
  edit(root, '.telos/ROADMAP.md', (s) => s.replace('02-next [active]', '02-next [drafted]'));
  mkdirSync(join(root, '.telos', 'phases', '02-next'));
  writeFileSync(join(root, '.telos', 'phases', '02-next', '02-01-x.md'),
    readFileSync(join(root, DEMO, '01-02-second-task.md'), 'utf8').replace('id: 01-02', 'id: 02-01'));
  assert.match((await telos(root, 'ctx', 'done', '02')).stdout, /^REFUSED: phase 02-next is drafted, not active/);
});

test('unfinished tasks and unresolved decisions block the close, listed one per reason', async (t) => {
  const root = repo(t);
  edit(root, join(DEMO, '01-CONTEXT.md'), (s) => s
    .replace('- D-02: Name', '- D-02 [proposed]: Name')
    .replace('## Open questions\n- none', '## Open questions\n- Q-01: Who reads it?'));
  edit(root, '.telos/STATUS.md', (s) => s.replace('Awaiting user: none', 'Awaiting user: 01:D-02, 02:Q-04'));
  const before = snapshot(root);
  const r = await telos(root, 'ctx', 'done');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^Target: 01-demo \[active\]/m);
  assert.match(r.stdout, /^Close: blocked$/m);
  assert.match(r.stdout, /^- 01-02 is approved, not done$/m);
  assert.match(r.stdout, /^- 01-03 is draft, not done$/m);
  assert.match(r.stdout, /^- D-02 is proposed$/m);
  assert.match(r.stdout, /^- Q-01 is open$/m);
  assert.match(r.stdout, /^- 01:D-02 awaits the user$/m);
  assert.doesNotMatch(r.stdout, /02:Q-04/);
  assert.deepEqual(snapshot(root), before);
});

test('a ready phase lists tasks to accept, full checks and promotion candidates', async (t) => {
  const root = allDone(repo(t));
  const before = snapshot(root);
  for (const name of ['check', 'done']) {
    const r = await telos(root, 'ctx', name);
    assert.match(r.stdout, /^Profile: standard$/m, name);
    assert.match(r.stdout, /^- 01-01 \[done\] First task · normal · depends: none · acceptance: 1 command, 1 manual$/m, name);
    assert.match(r.stdout, /^Accept: telos accept 01-01 · telos accept 01-02 · telos accept 01-03$/m, name);
    assert.match(r.stdout, /^Full checks \(telos check --level full --phase 01\): lint=npm run lint · test=npm test$/m, name);
    assert.doesNotMatch(r.stdout, /^E2E:/m, name);
    assert.match(r.stdout, /^Unresolved: none$/m, name);
    assert.ok(r.stdout.length <= CAP + 1, name);
  }
  const done = await telos(root, 'ctx', 'done');
  assert.match(done.stdout, /^Close: ready$/m);
  assert.match(done.stdout, /^History: phase entry missing$/m);
  assert.match(done.stdout, /^Decisions:\n- D-01: Store greetings in SQLite\. \[candidate\]\n- D-02: Name the helper greet\. \[candidate\]$/m);
  assert.match(done.stdout, /^Auto-commit: yes$/m);
  assert.deepEqual(snapshot(root), before);
});

test('check verifies an unfinished phase without a close verdict; no checks means UNVERIFIED and blocks close', async (t) => {
  const root = repo(t, { checks: {} });
  const check = await telos(root, 'ctx', 'check');
  assert.match(check.stdout, /^Accept: telos accept 01-01$/m);
  assert.match(check.stdout, /^Not done \(skipped\): 01-02, 01-03$/m);
  assert.doesNotMatch(check.stdout, /^Close:/m);
  assert.match(check.stdout, /^Full checks \(telos check --level full --phase 01\): none configured — UNVERIFIED$/m);
  allDone(root);
  const done = await telos(root, 'ctx', 'done');
  assert.match(done.stdout, /^Close: blocked$/m);
  assert.match(done.stdout, /^- no full checks configured \(UNVERIFIED\)$/m);
});

test('an interrupted close shows what is already recorded, so a retry skips it', async (t) => {
  const root = allDone(repo(t));
  assert.equal((await telos(root, 'history', 'add', 'decision', '01', 'D-01: Store greetings in SQLite.')).code, 0);
  let r = await telos(root, 'ctx', 'done');
  assert.match(r.stdout, /^- D-01: Store greetings in SQLite\. \[in HISTORY; add → HISTORY to CONTEXT\]$/m);
  edit(root, join(DEMO, '01-CONTEXT.md'), (s) => s.replace('in SQLite.', 'in SQLite. → HISTORY'));
  assert.equal((await telos(root, 'history', 'add', 'phase', '01', 'closed 01-demo: demo works')).code, 0);
  r = await telos(root, 'ctx', 'done');
  assert.match(r.stdout, /^- D-01: Store greetings in SQLite\. → HISTORY \[promoted\]$/m);
  assert.match(r.stdout, /^History: phase entry recorded \(\d{4}-\d{2}-\d{2}\)$/m);
  assert.match(r.stdout, /^Close: ready$/m);
});

test('a completed close refuses on rerun and leaves history without duplicates', async (t) => {
  const root = allDone(repo(t, { git: { auto_commit: false, phase_tags: true } }));
  assert.match((await telos(root, 'ctx', 'done')).stdout, /^Auto-commit: no$/m);
  // The skill's ordered state changes, via the CLI only.
  for (const args of [
    ['history', 'add', 'decision', '01', 'D-01: Store greetings in SQLite.'],
    ['history', 'add', 'phase', '01', 'closed 01-demo: demo works'],
    ['roadmap', 'set', '01', 'done'],
    ['status', 'set', 'task=none', 'next=/telos:plan'],
  ]) assert.equal((await telos(root, ...args)).code, 0, args.join(' '));
  const before = snapshot(root);
  const r = await telos(root, 'ctx', 'done', '01');
  assert.match(r.stdout, /^REFUSED: phase 01-demo is already done \(phase entry recorded\)/);
  assert.deepEqual(snapshot(root), before);
  const log = readHistory(root).log;
  assert.equal(log.filter((e) => e.kind === 'phase').length, 1);
  assert.equal(log.filter((e) => e.kind === 'decision').length, 1);
});

test('an unreadable HISTORY blocks the close instead of failing the bundle', async (t) => {
  const root = allDone(repo(t));
  writeFileSync(join(root, '.telos', 'HISTORY.md'), '# History\nbroken\n');
  const r = await telos(root, 'ctx', 'done');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^History: unavailable \(/m);
  assert.match(r.stdout, /^Close: blocked$/m);
  assert.match(r.stdout, /^- HISTORY\.md is unreadable/m);
});

// 05-05 (D-02): deep critical code needs a configured e2e; the bundle names the exact full check.
test('deep critical code requires e2e: missing blocks the close, configured joins the full checks', async (t) => {
  const root = allDone(repo(t, { profile: 'deep' }));
  setTask(root, '01-03-third-task.md', 'critical: false', 'critical: true');
  const before = snapshot(root);
  const check = await telos(root, 'ctx', 'check');
  assert.match(check.stdout, /^Full checks \(telos check --level full --phase 01\): lint=npm run lint · test=npm test$/m);
  assert.match(check.stdout, /^E2E: required for critical code 01-03 — checks\.e2e not configured \(UNVERIFIED\)$/m);
  const done = await telos(root, 'ctx', 'done');
  assert.match(done.stdout, /^Close: blocked\n- e2e required for critical code 01-03 but checks\.e2e is not configured \(UNVERIFIED\)$/m);
  assert.deepEqual(snapshot(root), before);

  const cfg = join(root, '.telos', 'config.json');
  writeFileSync(cfg, JSON.stringify({ ...JSON.parse(readFileSync(cfg, 'utf8')), checks: { test: 'npm test', e2e: 'npm run e2e' } }, null, 2));
  const ready = await telos(root, 'ctx', 'done');
  assert.match(ready.stdout, /^E2E: required for critical code 01-03: e2e=npm run e2e$/m);
  assert.match(ready.stdout, /^Close: ready$/m);
});

test('standard, noncritical and doc/audit critical work show no e2e requirement', async (t) => {
  const standard = allDone(repo(t));
  setTask(standard, '01-03-third-task.md', 'critical: false', 'critical: true');
  assert.doesNotMatch((await telos(standard, 'ctx', 'done')).stdout, /E2E|e2e required/);
  const docs = allDone(repo(t, { profile: 'deep' }));
  setTask(docs, '01-03-third-task.md', 'critical: false', 'critical: true');
  setTask(docs, '01-03-third-task.md', /type: code/, 'type: doc');
  const r = await telos(docs, 'ctx', 'done');
  assert.doesNotMatch(r.stdout, /^E2E:/m);
  assert.doesNotMatch(r.stdout, /e2e required/);
});

test('ctx check for another phase names that phase in the full-check command', async (t) => {
  const root = repo(t, { profile: 'deep' });
  const status = join(root, '.telos', 'STATUS.md');
  writeFileSync(status, readFileSync(status, 'utf8').replace('Phase: 01-demo', 'Phase: 02-next'));
  const r = await telos(root, 'ctx', 'check', '01');
  assert.match(r.stdout, /^Full checks \(telos check --level full --phase 01\):/m);
});
