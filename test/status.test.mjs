import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { DEFAULTS, write as writeConfig } from '../lib/config.mjs';
import { render } from '../lib/template.mjs';

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'telos-status-'));
  mkdirSync(join(root, '.git'));
  writeConfig(root, { ...DEFAULTS });
  writeFileSync(join(root, '.telos', 'STATUS.md'), render('STATUS.md', { next: 'run /telos:map' }));
  return root;
}

const statusText = (root) => readFileSync(join(root, '.telos', 'STATUS.md'), 'utf8');

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

const listItems = (text, heading) =>
  text.split(`## ${heading}\n`)[1].split('\n## ')[0].split('\n').filter((l) => l.startsWith('- '));

test('status set changes only the given lines', async () => {
  const root = repo();
  const before = statusText(root);
  const r = await telos(root, 'status', 'set', 'task=01-02', 'next=run tests');
  assert.equal(r.code, 0, r.stderr);
  const after = statusText(root);
  assert.match(after, /^Task: 01-02$/m);
  assert.match(after, /^Next: run tests$/m);
  const diff = after.split('\n').filter((l, i) => l !== before.split('\n')[i]);
  assert.deepEqual(diff, ['Task: 01-02', 'Next: run tests']);
});

test('status set with an empty value writes none', async () => {
  const root = repo();
  await telos(root, 'status', 'set', 'blockers=01-02: tests fail');
  await telos(root, 'status', 'set', 'blockers=');
  assert.match(statusText(root), /^Blockers: none$/m);
});

test('status set with an unknown key exits 2', async () => {
  const r = await telos(repo(), 'status', 'set', 'foo=bar');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /foo/);
});

test('add recent keeps the three newest', async () => {
  const root = repo();
  for (const id of ['01', '02', '03', '04']) await telos(root, 'status', 'add', 'recent', `01-${id} done: x`);
  assert.deepEqual(listItems(statusText(root), 'Recent'), ['- 01-04 done: x', '- 01-03 done: x', '- 01-02 done: x']);
  assert.match(statusText(root), /<!-- max 3, newest first/);
});

test('add carry refuses a sixth item; rm carry empties to none', async () => {
  const root = repo();
  for (let i = 1; i <= 5; i++) assert.equal((await telos(root, 'status', 'add', 'carry', `02: item ${i} → 01-01`)).code, 0);
  const full = await telos(root, 'status', 'add', 'carry', '02: item 6 → 01-01');
  assert.equal(full.code, 1);
  assert.equal(listItems(statusText(root), 'Carry-over').length, 5);
  for (let i = 0; i < 5; i++) await telos(root, 'status', 'rm', 'carry', '1');
  assert.deepEqual(listItems(statusText(root), 'Carry-over'), ['- none']);
  assert.equal((await telos(root, 'status', 'rm', 'carry', '1')).code, 2);
});

test('status view reads live states and shows Awaiting user first', async () => {
  const root = repo();
  writeFileSync(join(root, '.telos', 'ROADMAP.md'), '# Roadmap\n- 01-audit [active] audit · done when: closed\n');
  mkdirSync(join(root, '.telos', 'phases', '01-audit'), { recursive: true });
  const task = render('task.md', { id: '01-02', title: 'Check' }).replace('status: draft', 'status: in-progress');
  writeFileSync(join(root, '.telos', 'phases', '01-audit', '01-02-check.md'), task);
  await telos(root, 'status', 'set', 'phase=01-audit', 'task=01-02', 'awaiting=01:D-03');

  const r = await telos(root, 'status');
  assert.equal(r.code, 0, r.stderr);
  const lines = r.stdout.trimEnd().split('\n');
  assert.equal(lines[0], 'Awaiting user: 01:D-03');
  assert.ok(lines.includes('Phase: 01-audit [active] · Task: 01-02 [in-progress]'), r.stdout);
  assert.ok(lines.length <= 15);
});

test('status view marks missing sources with ?', async () => {
  const root = repo();
  await telos(root, 'status', 'set', 'phase=02-auth', 'task=02-01');
  const r = await telos(root, 'status');
  assert.match(r.stdout, /^Phase: 02-auth \[\?\] · Task: 02-01 \[\?\]$/m);
  assert.doesNotMatch(r.stdout, /Awaiting user/);
});

test('status warns when STATUS exceeds the line limit', async () => {
  const root = repo();
  writeConfig(root, { ...DEFAULTS, limits: { ...DEFAULTS.limits, status_lines: 5 } });
  const r = await telos(root, 'status');
  assert.equal(r.code, 0);
  assert.match(r.stderr, /STATUS\.md has \d+ lines \(limit 5\)/);
});

test('lib/status.mjs can be imported before lib/cli.mjs', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./lib/status.mjs')"], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
});

// Read-time Next after map (06-03): init's exact map hint is replaced once MAP is valid.
const INIT_MAP = 'run /telos:map to map the existing code';
const FIRST_PLAN = 'plan the first phase with /telos:plan';
const BUILT_MAP = '<!-- telos-map: commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa · 2026-10-29 · files 3 -->\n# Map\n\n## Structure\n- `lib/` — code\n\n## Entry points\n- `bin/telos:1-1` — start\n\n## Flows\n- run → `lib/a.mjs:1-2`\n\n## Areas\n### Core\n- `lib/a.mjs:1-2` — core\n\n## Find\n- lookup → `lib/a.mjs:1-2`\n';

function mapRepo({ next = INIT_MAP, map = BUILT_MAP, set = {}, limit } = {}) {
  const root = repo();
  if (limit) writeConfig(root, { ...DEFAULTS, limits: { ...DEFAULTS.limits, map_tokens: limit } });
  const path = join(root, '.telos', 'STATUS.md');
  let text = render('STATUS.md', { next });
  for (const [label, value] of Object.entries(set)) text = text.replace(new RegExp(`^${label}: .*$`, 'm'), `${label}: ${value}`);
  writeFileSync(path, text);
  writeFileSync(join(root, '.telos', 'MAP.md'), map);
  return root;
}

test('status derives the first-plan hint when MAP is built and Next is init\'s map hint', async () => {
  const root = mapRepo();
  const before = statusText(root);
  const r = await telos(root, 'status');
  assert.match(r.stdout, new RegExp(`^Next: ${FIRST_PLAN}$`, 'm'));
  assert.equal(statusText(root), before);
});

test('status keeps the map hint for missing, stub, malformed and over-budget MAP', async () => {
  for (const [map, limit] of [
    ['<!-- telos-map: not built -->\n# Map\n\nNot built yet: run `/telos:map`.\n', undefined],
    ['# Map\n\nhand-written, no header\n', undefined],
    [BUILT_MAP, 10],
  ]) {
    const r = await telos(mapRepo({ map, limit }), 'status');
    assert.match(r.stdout, new RegExp(`^Next: ${INIT_MAP}$`, 'm'));
  }
  const missing = mapRepo();
  rmSync(join(missing, '.telos', 'MAP.md'));
  assert.match((await telos(missing, 'status')).stdout, new RegExp(`^Next: ${INIT_MAP}$`, 'm'));
});

test('status preserves custom Next, active phase/task and blockers', async () => {
  assert.match((await telos(mapRepo({ next: 'run tests' }), 'status')).stdout, /^Next: run tests$/m);
  assert.match((await telos(mapRepo({ set: { Phase: '01-core' } }), 'status')).stdout, new RegExp(`^Next: ${INIT_MAP}$`, 'm'));
  assert.match((await telos(mapRepo({ set: { Task: '01-01' } }), 'status')).stdout, new RegExp(`^Next: ${INIT_MAP}$`, 'm'));
  const blocked = (await telos(mapRepo({ set: { Blockers: '01-01: broken', 'Awaiting user': 'decide' } }), 'status')).stdout;
  assert.match(blocked, /^Blockers: 01-01: broken$/m);
  assert.match(blocked, /^Awaiting user: decide$/m);
});
