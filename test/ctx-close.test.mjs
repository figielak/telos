import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { requireMessage } from '../lib/config.mjs';
import { CAP } from '../lib/ctx/index.mjs';
import { readHistory } from '../lib/history.mjs';
import { reviewEvidence } from '../lib/review.mjs';
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
  setTask(root, '01-03-third-task.md', '## Result\n', EVIDENCE); // 05-12: deep critical close also needs RED/GREEN
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

// 05-12 (D-01–D-03): deep close adds critical evidence, one review and doc-sync before recording.
const E2E = { test: 'npm test', e2e: 'npm run e2e' };
const EVIDENCE = '## Result\nAdded greet.\nRED: npm test → exit 1: greet is not defined\nGREEN: telos check --level full --task 01-03 → exit 0 · e2e PASS\n'
  + 'Review: PASS · EvidenceId abc123 · fixed none\nDeviations: none\n';
const critical = (root, result = EVIDENCE) => {
  setTask(root, '01-03-third-task.md', 'critical: false', 'critical: true');
  setTask(root, '01-03-third-task.md', '## Result\n', result);
  return root;
};

test('deep close lists critical evidence, the review route and exact doc-sync commands before the verdict', async (t) => {
  const root = critical(allDone(repo(t, { profile: 'deep', checks: E2E })));
  const before = snapshot(root);
  const r = await telos(root, 'ctx', 'done');
  assert.equal(r.code, 0, r.stderr);
  const order = [
    'Deep close: targeted full/e2e checks + acceptance → review → doc-sync → reverify → promote/record',
    'Critical evidence (from Result; accept PASS proves none of it):',
    '- 01-03: RED recorded · GREEN recorded · review PASS EvidenceId abc123 — stale or unavailable',
    'Review: one phase review — run `telos ctx review 01` and `telos ctx shared review`, then the agent telos:reviewer-hard once with both outputs',
    'Doc-sync: `telos docs-scan 01` · `telos changelog 01` · docs readme=README.md, paths=docs/ · changelog=CHANGELOG.md (≤ 10 entry lines under a version or date heading)',
    'Close: ready',
  ];
  let at = -1;
  for (const part of order) {
    const i = r.stdout.indexOf(part);
    assert.ok(i > at, `${part} missing or out of order\n${r.stdout}`);
    at = i;
  }
  assert.ok(r.stdout.length <= CAP + 1);
  assert.deepEqual(snapshot(root), before);
  const check = await telos(root, 'ctx', 'check');
  assert.match(check.stdout, /^Critical evidence/m);
  assert.match(check.stdout, /^Doc-sync: /m);
  assert.doesNotMatch(check.stdout, /^Close:/m);
});

test('missing RED or GREEN evidence blocks the close although accept would pass', async (t) => {
  const root = critical(allDone(repo(t, { profile: 'deep', checks: E2E })), '## Result\nAdded greet.\nDeviations: none\n');
  const r = await telos(root, 'ctx', 'done');
  assert.match(r.stdout, /^- 01-03: RED missing · GREEN missing · review missing$/m);
  assert.match(r.stdout, /^Close: blocked\n- 01-03: no recorded RED evidence in Result \(UNVERIFIED; accept PASS does not prove it\)\n- 01-03: no recorded GREEN\/e2e evidence in Result \(UNVERIFIED\)$/m);
});

test('current task review evidence is reused; a later change or a CHANGES REQUESTED verdict needs the phase review', async (t) => {
  const root = allDone(repo(t, { profile: 'deep', checks: E2E }));
  rmSync(join(root, '.git'), { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('init', '-q');
  for (const [k, v] of [['user.email', 't@example.com'], ['user.name', 'T'], ['commit.gpgsign', 'false']]) git('config', k, v);
  setTask(root, '01-03-third-task.md', 'critical: false', 'critical: true');
  git('add', '.');
  git('commit', '-q', '-m', 'docs(telos): plan');
  git('tag', 'telos/01-start');
  writeFileSync(join(root, 'src', 'a.ts'), `${readFileSync(join(root, 'src', 'a.ts'), 'utf8')}export const x = 1;\n`);
  git('add', 'src/a.ts');
  git('commit', '-q', '-m', 'feat(01-03): add x');
  const id = reviewEvidence(root, '01-03').evidenceId;
  setTask(root, '01-03-third-task.md', '## Result\n', EVIDENCE.replace('abc123', id));
  let r = await telos(root, 'ctx', 'done');
  assert.match(r.stdout, new RegExp(`^- 01-03: RED recorded · GREEN recorded · review PASS EvidenceId ${id} — current$`, 'm'));
  assert.match(r.stdout, /^Review: reuse — every critical code task has current complete review evidence; no new review$/m);

  setTask(root, '01-03-third-task.md', 'Review: PASS ·', 'Review: CHANGES REQUESTED ·');
  r = await telos(root, 'ctx', 'done');
  assert.match(r.stdout, /review CHANGES REQUESTED EvidenceId \S+ — not reusable/);
  assert.match(r.stdout, /^Review: one phase review/m);

  setTask(root, '01-03-third-task.md', 'Review: CHANGES REQUESTED ·', 'Review: PASS ·');
  writeFileSync(join(root, 'src', 'a.ts'), `${readFileSync(join(root, 'src', 'a.ts'), 'utf8')}export const y = 2;\n`);
  r = await telos(root, 'ctx', 'done');
  assert.match(r.stdout, /— stale or unavailable$/m);
  assert.match(r.stdout, /^Review: one phase review/m);
});

test('deep without critical code needs no review but still doc-syncs; standard close is unchanged', async (t) => {
  const deep = allDone(repo(t, { profile: 'deep' }));
  const r = await telos(deep, 'ctx', 'done');
  assert.match(r.stdout, /^Review: none required \(no critical code tasks\)$/m);
  assert.match(r.stdout, /^Doc-sync: `telos docs-scan 01`/m);
  assert.doesNotMatch(r.stdout, /Critical evidence/);
  const standard = critical(allDone(repo(t)), '## Result\nDeviations: none\n');
  const s = await telos(standard, 'ctx', 'done');
  assert.doesNotMatch(s.stdout, /Deep close|Critical evidence|Doc-sync|^Review:/m);
  assert.match(s.stdout, /^Close: ready$/m);
});

test('a huge phase keeps the deep obligations and every blocker within the cap', async (t) => {
  const root = critical(repo(t, { profile: 'deep', checks: E2E }), '## Result\nDeviations: none\n');
  const t3 = readFileSync(join(root, DEMO, '01-03-third-task.md'), 'utf8');
  for (let i = 10; i < 90; i++) {
    writeFileSync(join(root, DEMO, `01-${i}-filler-task-with-a-long-name.md`),
      t3.replace('id: 01-03', `id: 01-${i}`).replace('critical: true', 'critical: false')
        .replace('title: Third task', `title: Filler task number ${i} with a deliberately long title`));
  }
  const r = await telos(root, 'ctx', 'done');
  assert.ok(r.stdout.length <= CAP + 1, String(r.stdout.length));
  for (const part of ['Deep close:', 'Review: one phase review', 'Doc-sync: ', 'Close: blocked', '- 01-89 is draft, not done',
    '- 01-03: no recorded RED evidence', '- 01-03: no recorded GREEN/e2e evidence', 'Tasks: 83 (compacted for the cap)']) {
    assert.ok(r.stdout.includes(part), part);
  }
});

// 05-13 (D-04, D-05): deep promotion goes adr new → bounded body → HISTORY link → CONTEXT marker.
const CONTEXT_PATH = join(DEMO, '01-CONTEXT.md');
const decisionLine = (out, id) => new RegExp(`^- ${id}: .*$`, 'm').exec(out)?.[0];
const fillBody = (root, file, extra = '') => edit(root, join('.telos', 'decisions', file), (t) => t
  .replace('## Context\n', '## Context\nGreetings must survive restarts.\n')
  .replace('## Decision\n', '## Decision\nUse SQLite.\n')
  .replace(/## Alternatives\n(<!--.*-->\n)?- \n/, '## Alternatives\n$1- JSON file — no concurrent writes\n')
  .replace(/## Consequences\n(<!--.*-->\n)?- \n/, `## Consequences\n$1- one more dependency\n${extra}`)
  .replace(/^Reverse by: .*$/m, 'Reverse by: export rows and switch the store module')
  .replace(/^Links: .*$/m, 'Links: HISTORY 01 decision'));

test('deep promotion walks adr new, body, HISTORY link and CONTEXT marker, and each retry resumes', async (t) => {
  const root = allDone(repo(t, { profile: 'deep' }));
  let out = (await telos(root, 'ctx', 'done')).stdout;
  assert.equal(decisionLine(out, 'D-01'), '- D-01: Store greetings in SQLite. [candidate → if hard to reverse: telos adr new "<title>" --source 01:D-01]');
  assert.match(out, /^Promotion \(deep\): adr new → body ≤ 30 lines incl\. Reverse by and Links → telos history add decision "ADR NNN" → CONTEXT marker → ADR NNN$/m);
  assert.match(out, /^Retro: one clause in the phase entry text \(…; retro: …\) and the reply; propose lessons via \/telos:lesson, never edit LESSONS\.md or PROJECT\.md$/m);

  assert.equal((await telos(root, 'adr', 'new', 'Store greetings in SQLite', '--source', '01:D-01')).code, 0);
  out = (await telos(root, 'ctx', 'done')).stdout;
  assert.equal(decisionLine(out, 'D-01'), '- D-01: Store greetings in SQLite. [ADR 001; body needed: Context, Decision, Alternatives, Consequences, Reverse by, Links]');
  assert.match(out, /^Close: ready$/m);

  fillBody(root, '001-store-greetings-in-sqlite.md');
  out = (await telos(root, 'ctx', 'done')).stdout;
  assert.equal(decisionLine(out, 'D-01'), '- D-01: Store greetings in SQLite. [ADR 001; history link needed: telos history add decision "ADR 001" "01:D-01: Store greetings in SQLite."]');

  assert.equal((await telos(root, 'history', 'add', 'decision', 'ADR 001', '01:D-01: Store greetings in SQLite.')).code, 0);
  out = (await telos(root, 'ctx', 'done')).stdout;
  assert.equal(decisionLine(out, 'D-01'), '- D-01: Store greetings in SQLite. [ADR 001 linked; marker needed: end the CONTEXT line with → ADR 001]');

  edit(root, CONTEXT_PATH, (s) => s.replace('in SQLite.', 'in SQLite. → ADR 001'));
  out = (await telos(root, 'ctx', 'done')).stdout;
  assert.equal(decisionLine(out, 'D-01'), '- D-01: Store greetings in SQLite. → ADR 001 [promoted → ADR 001]');
  assert.match(out, /^Close: ready$/m);
  // A retried adr new reuses the ADR; nothing duplicates.
  assert.match((await telos(root, 'adr', 'new', 'Store greetings in SQLite', '--source', '01:D-01')).stdout, / · reused\n$/);
  assert.equal(readHistory(root).log.filter((e) => e.kind === 'decision').length, 1);
  assert.deepEqual(readdirSync(join(root, '.telos', 'decisions')), ['001-store-greetings-in-sqlite.md']);
});

test('markers without ADRs, mismatched markers, non-accepted ADRs and oversized bodies block the close', async (t) => {
  const root = allDone(repo(t, { profile: 'deep' }));
  edit(root, CONTEXT_PATH, (s) => s.replace('in SQLite.', 'in SQLite. → ADR 004'));
  let out = (await telos(root, 'ctx', 'done')).stdout;
  assert.match(out, /^- D-01: marker → ADR 004 but no ADR has source 01:D-01; fix the CONTEXT marker or the ADR$/m);
  assert.match(out, /^Close: blocked$/m);

  edit(root, CONTEXT_PATH, (s) => s.replace(' → ADR 004', ''));
  assert.equal((await telos(root, 'adr', 'new', 'Store greetings in SQLite', '--source', '01:D-01')).code, 0);
  edit(root, CONTEXT_PATH, (s) => s.replace('in SQLite.', 'in SQLite. → HISTORY'));
  out = (await telos(root, 'ctx', 'done')).stdout;
  assert.match(out, /^- D-01: marker → HISTORY but ADR 001 has source 01:D-01; fix the CONTEXT marker or the ADR$/m);

  edit(root, CONTEXT_PATH, (s) => s.replace(' → HISTORY', ''));
  fillBody(root, '001-store-greetings-in-sqlite.md', '- x\n'.repeat(12));
  out = (await telos(root, 'ctx', 'done')).stdout;
  assert.match(out, /^- D-01: ADR 001 has \d+ lines, over 30; shorten its body$/m);
  assert.match(decisionLine(out, 'D-01'), /\[inconsistent\]$/);

  edit(root, join('.telos', 'decisions', '001-store-greetings-in-sqlite.md'), (s) => s.replace('Status: accepted', 'Status: reverted (2026-01-03, 01-02)'));
  out = (await telos(root, 'ctx', 'done')).stdout;
  assert.match(out, /^- D-01: ADR 001 is reverted \(2026-01-03, 01-02\), not binding; decide an explicit follow-up \(new decision or revise\), never promote it as accepted$/m);
  assert.match(decisionLine(out, 'D-01'), /\[conflict\]$/);
  assert.match(out, /^Close: blocked$/m);
});

test('a malformed ADR file blocks a deep close; standard keeps HISTORY-only promotion and ignores decisions/', async (t) => {
  const root = allDone(repo(t, { profile: 'deep' }));
  mkdirSync(join(root, '.telos', 'decisions'));
  writeFileSync(join(root, '.telos', 'decisions', '001-bad.md'), '# 001 · Bad\n');
  const out = (await telos(root, 'ctx', 'done')).stdout;
  assert.match(out, /^- ADRs unreadable: 001-bad\.md: malformed ADR header/m);
  assert.match(out, /^Close: blocked$/m);
  const standard = allDone(repo(t));
  mkdirSync(join(standard, '.telos', 'decisions'));
  writeFileSync(join(standard, '.telos', 'decisions', '001-bad.md'), '# 001 · Bad\n');
  const s = (await telos(standard, 'ctx', 'done')).stdout;
  assert.match(s, /^- D-01: Store greetings in SQLite\. \[candidate\]$/m);
  assert.doesNotMatch(s, /ADR|Promotion|Retro/);
  assert.match(s, /^Close: ready$/m);
});

test('only the deep close bundle emits accept --close NN; check and standard keep plain accept', async (t) => {
  const root = allDone(repo(t, { profile: 'deep' }));
  assert.match((await telos(root, 'ctx', 'done')).stdout, /^Accept: telos accept 01-01 --close 01 · telos accept 01-02 --close 01 · telos accept 01-03 --close 01$/m);
  assert.match((await telos(root, 'ctx', 'check')).stdout, /^Accept: telos accept 01-01 · telos accept 01-02 · telos accept 01-03$/m);
});
