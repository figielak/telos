import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';
import { CAP, contextOf } from '../lib/ctx/index.mjs';
import { areasRepo, commitAll, setAnchor, write } from './areas-repo.mjs';

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

async function ok(root, ...args) {
  const r = await telos(root, ...args);
  assert.equal(r.code, 0, `${args.join(' ')}: ${r.stderr}`);
  return args[0] === 'ctx' ? contextOf(r.stdout) : r.stdout;
}

/** Initialized repo with phases 01-demo [active] and 02-next [planned]; checks test=npm test. */
async function repo(t, { checks = { test: 'npm test' } } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-ctx-close-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.git'));
  await ok(root, 'init', '--checks', JSON.stringify(checks), '--stack', 'javascript');
  await ok(root, 'roadmap', 'add', 'demo', 'demo phase', 'demo works');
  await ok(root, 'roadmap', 'add', 'next', 'next phase', 'next works');
  await ok(root, 'roadmap', 'set', '01', 'active');
  await ok(root, 'status', 'set', 'phase=01-demo', 'task=none');
  return root;
}

/** Phase 01 plan with `[id, done]` checklist items. */
function work(root, items) {
  mkdirSync(join(root, '.telos', 'phases'), { recursive: true });
  writeFileSync(join(root, '.telos', 'phases', '01-demo.md'), '# 01-demo\n\n## Goal\ndemo phase\n\n## Tasks\n'
    + items.map(([id, done]) => `- [${done ? 'x' : ' '}] **${id} Item ${id}**\n  - detail\n`).join('') + '\n## Notes\n- none\n');
}

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

test('a ready phase lists the checks, the commit policy and the exact closing commands', async (t) => {
  const root = await repo(t);
  work(root, [['01-01', true], ['01-02', true]]);
  const before = snapshot(root);
  const out = await ok(root, 'ctx', 'close');
  assert.equal(out, [
    'Target: 01-demo [active] demo phase · done when: demo works',
    'Plan: .telos/phases/01-demo.md (2/2 done)',
    'Unfinished:\n- none',
    'Checks (run each from the repo root; all must exit 0): test=npm test',
    'History: phase entry missing',
    'Auto-commit: yes · subject "docs(telos): close 01-demo"',
    'Close: ready',
    'Closing commands (in order, after the checks pass):',
    '- `telos history add phase 01 "closed 01-demo: <evidence for done when>"`',
    '- `telos roadmap set 01 done`',
    '- `telos status set phase=02-next task=none "next=/telos:plan 02"`',
    '- `telos status add recent "01 closed: <one line>"`',
  ].join('\n') + '\n');
  assert.deepEqual(snapshot(root), before, 'the bundle never writes');
});

test('an unchecked item blocks the close and is listed', async (t) => {
  const root = await repo(t);
  work(root, [['01-01', true], ['01-02', false]]);
  const out = await ok(root, 'ctx', 'close');
  assert.match(out, /^Plan: \.telos\/phases\/01-demo\.md \(1\/2 done\)$/m);
  assert.match(out, /^Unfinished:\n- \[ \] 01-02 Item 01-02$/m);
  assert.match(out, /^Close: blocked\n- \[ \] 01-02 Item 01-02$/m);
});

test('a non-active, done or unknown phase refuses; a malformed argument is a usage error', async (t) => {
  const root = await repo(t);
  assert.equal(await ok(root, 'ctx', 'close', '02'), 'REFUSED: phase 02-next is planned, not active\n');
  assert.equal(await ok(root, 'ctx', 'close', '07'), 'REFUSED: no phase 07 in ROADMAP\n');
  await ok(root, 'roadmap', 'set', '01', 'done');
  assert.equal(await ok(root, 'ctx', 'close'), 'REFUSED: phase 01-demo is already done; nothing to close\n');
  await ok(root, 'status', 'set', 'phase=none');
  assert.equal(await ok(root, 'ctx', 'close'), 'REFUSED: no phase in STATUS; pass NN\n');
  assert.equal((await telos(root, 'ctx', 'close', '1')).code, 2);
});

test('a recorded phase entry drops its command; the last phase points to a new plan; no checks says so', async (t) => {
  const root = await repo(t, { checks: {} });
  await ok(root, 'roadmap', 'set', '02', 'dropped');
  await ok(root, 'history', 'add', 'phase', '01', 'closed 01-demo: demo works');
  const out = await ok(root, 'ctx', 'close');
  assert.match(out, /^Plan: \.telos\/phases\/01-demo\.md \(missing\)$/m);
  assert.match(out, /^Close: ready$/m);
  assert.match(out, /^Checks \(run each from the repo root; all must exit 0\): none configured — verify the done-when by hand$/m);
  assert.match(out, /^History: phase entry recorded$/m);
  assert.doesNotMatch(out, /telos history add/);
  assert.match(out, /^- `telos status set phase=none task=none "next=\/telos:plan"`$/m);
});

test('stale areas add one line to the close bundle and never block it (12:D-05)', async (t) => {
  const { root } = areasRepo(t);
  await ok(root, 'roadmap', 'add', 'demo', 'demo phase', 'demo works');
  await ok(root, 'roadmap', 'set', '01', 'active');
  await ok(root, 'status', 'set', 'phase=01-demo', 'task=none');
  assert.doesNotMatch(await ok(root, 'ctx', 'close'), /Stale areas/);
  writeFileSync(join(root, 'src/web/app.mjs'), 'export const title = String;\n');
  const out = await ok(root, 'ctx', 'close');
  assert.match(out, /^Auto-commit: [^\n]*\nStale areas: 1; update them from the Delta below, they do not block the close\nClose: ready$/m);
  assert.doesNotMatch(out, /telos area anchor/);
  assert.match(out, /^- not anchored, covered files are uncommitted: web; /m);
});

/** areasRepo with phase 01-demo active and its plan; @returns {string} root */
async function areasPhase(t, items = [['01-01', true]]) {
  const { root } = areasRepo(t);
  await ok(root, 'roadmap', 'add', 'demo', 'demo phase', 'demo works');
  await ok(root, 'roadmap', 'set', '01', 'active');
  await ok(root, 'status', 'set', 'phase=01-demo', 'task=none');
  work(root, items);
  commitAll(root, 'phase 01');
  return root;
}

test('ready with a delta: anchor command first, delta per area after the closing commands', async (t) => {
  const root = await areasPhase(t);
  write(root, 'src/api/routes.mjs', 'export const routes = {};\n');
  write(root, 'docs/guide.md', '# Guide v2\n');
  commitAll(root, 'feat(api): new routes "now"');
  const before = snapshot(root);
  const out = await ok(root, 'ctx', 'close');
  assert.ok(out.length <= CAP);
  assert.match(out, /^Close: ready\nClosing commands \(in order, after the checks pass\):\n- `telos area anchor api util web`\n- `telos history add phase 01 /m);
  assert.match(out, /^- `telos status add recent "01 closed: <one line>"`\nDelta: 1 area to review · fresh: util, web · unmapped: 1 file$/m);
  assert.match(out, /^Area api: stale since \w{7} · 1 file \(\+1 -3\) · 1 commit$/m);
  assert.match(out, /^ {2}- \w{7} "feat\(api\): new routes \\"now\\""$/m);
  assert.match(out, /^ {2}- src\/api\/routes\.mjs · modified \+1 -3$/m);
  assert.match(out, /^Unmapped .*: 1 file\n {2}- docs\/guide\.md$/m);
  assert.deepEqual(snapshot(root), before, 'the bundle never writes');
});

test('blocked by unchecked items: still lists the delta; a fresh repo adds no anchor command', async (t) => {
  const root = await areasPhase(t, [['01-01', true], ['01-02', false]]);
  let out = await ok(root, 'ctx', 'close');
  assert.match(out, /^Close: blocked\n- \[ \] 01-02 Item 01-02$/m);
  assert.doesNotMatch(out, /telos area anchor/);
  assert.match(out, /^Delta: 0 areas to review · fresh: api, util, web · unmapped: 0 files$/m);
  write(root, 'lib/util.mjs', 'export const slug = String;\n');
  out = await ok(root, 'ctx', 'close');
  assert.match(out, /^Close: blocked$/m);
  assert.doesNotMatch(out, /telos area anchor/);
  assert.match(out, /^- not anchored, covered files are uncommitted: util; /m);
  assert.match(out, /^ {2}- lib\/util\.mjs · uncommitted$/m);
});

/** `count` extra areas x0..xN over dirs x0/..xN/, anchored at HEAD. */
function addAreas(root, count) {
  for (let i = 0; i < count; i++) {
    mkdirSync(join(root, `x${i}`));
    write(root, `x${i}/seed.mjs`, 'export {};\n');
    write(root, `.telos/areas/x${i}.md`, `<!-- telos-area: commit ${'0'.repeat(40)} · 2026-01-01 · paths: x${i}/ -->\n# x${i}\n`);
  }
  setAnchor(root, commitAll(root, 'extra areas'));
  commitAll(root, 'anchor extra areas');
}

test('overflow: file rows shrink to counts first, commit subjects stay', async (t) => {
  const root = await areasPhase(t);
  addAreas(root, 4);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 12; j++) write(root, `x${i}/${'long-module-name-'.repeat(6)}${j}.mjs`, 'export {};\n');
  }
  commitAll(root, 'feat: many files');
  const out = await ok(root, 'ctx', 'close');
  assert.ok(out.length <= CAP, `${out.length} chars`);
  assert.doesNotMatch(out, /truncated by telos ctx/);
  assert.doesNotMatch(out, /Files:/);
  assert.match(out, /^- `telos area anchor x0 x1 x2 x3`$/m);
  for (let i = 0; i < 4; i++) assert.match(out, new RegExp(`^Area x${i}: stale since \\w{7} · 12 files \\(\\+12 -0\\) · 1 commit · 12 added$`, 'm'));
  assert.match(out, /^ {2}- \w{7} "feat: many files"$/m);
});

test('overflow: subjects go next; every area and closing command survives', async (t) => {
  const root = await areasPhase(t);
  addAreas(root, 8);
  for (let c = 0; c < 10; c++) {
    for (let i = 0; i < 8; i++) write(root, `x${i}/f${c}.mjs`, 'export {};\n');
    commitAll(root, `feat: commit ${c} ${'with a long subject line '.repeat(4)}`);
  }
  const out = await ok(root, 'ctx', 'close');
  assert.ok(out.length <= CAP, `${out.length} chars`);
  assert.doesNotMatch(out, /truncated by telos ctx|Commits \(newest first\)|quoted data|Files:/);
  for (let i = 0; i < 8; i++) assert.match(out, new RegExp(`^Area x${i}: stale since \\w{7} · 10 files \\(\\+10 -0\\) · 10 commits · 10 added$`, 'm'));
  assert.match(out, /^- `telos status add recent "01 closed: <one line>"`$/m);
});
