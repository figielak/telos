import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';
import { areasRepo } from './areas-repo.mjs';

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

async function ok(root, ...args) {
  const r = await telos(root, ...args);
  assert.equal(r.code, 0, `${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
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
    'Auto-commit: yes',
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
  assert.match(out, /^Auto-commit: (yes|no)\nStale areas: 1 \(run telos stale\); review them, they do not block the close\nClose: ready$/m);
});
