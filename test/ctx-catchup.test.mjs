import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';
import { CAP, contextOf } from '../lib/ctx/index.mjs';
import { areasRepo, commitAll, write } from './areas-repo.mjs';

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

test('an empty delta prints only Nothing to catch up (13:D-05)', async (t) => {
  const { root } = areasRepo(t);
  assert.equal(await ok(root, 'ctx', 'catchup'), 'Nothing to catch up\n');
});

test('a populated delta: anchor and quick-history commands, then the areas and unmapped paths', async (t) => {
  const { root } = areasRepo(t);
  write(root, 'src/api/routes.mjs', 'export const routes = {};\n');
  commitAll(root, 'feat: routes without telos');
  write(root, 'src/web/extra.mjs', 'export {};\n');
  mkdirSync(join(root, 'tools'));
  write(root, 'tools/gen.mjs', 'export {};\n');
  commitAll(root, 'feat: web extra and tools');
  const before = snapshot(root);
  const out = await ok(root, 'ctx', 'catchup');
  assert.ok(out.length <= CAP);
  const [head] = out.split('\nDelta:');
  assert.equal(head, [
    'Target: catch up the area notes with changes made without Telos',
    'Auto-commit: yes · subject "docs(telos): catch up"',
    'Closing commands (in order, after the area notes are updated):',
    '- `telos area anchor api util web`',
    '- only when you recorded a decision: `telos history add quick quick "<decision: reason>"`',
  ].join('\n'));
  assert.match(out, /^Delta: 2 areas to review · fresh: util · unmapped: 1 file$/m);
  assert.match(out, /^Area api: stale since \w{7} · 1 file \(\+1 -3\) · 1 commit$/m);
  assert.match(out, /^Area web: stale since \w{7} · 1 file \(\+1 -0\) · 1 commit$/m);
  assert.match(out, /^ {2}- \w{7} "feat: web extra and tools"$/m);
  assert.match(out, /^ {2}- tools\/gen\.mjs$/m);
  assert.doesNotMatch(out, /roadmap|status set|history add phase/);
  assert.deepEqual(snapshot(root), before, 'the bundle never writes');
});

test('unmapped files alone still need a catch-up; auto_commit false drops the subject', async (t) => {
  const { root } = areasRepo(t);
  const cfg = join(root, '.telos', 'config.json');
  write(root, '.telos/config.json', readFileSync(cfg, 'utf8').replace('"auto_commit": true', '"auto_commit": false'));
  write(root, 'docs/guide.md', '# Guide v2\n');
  commitAll(root, 'docs only');
  const out = await ok(root, 'ctx', 'catchup');
  assert.match(out, /^Auto-commit: no$/m);
  assert.match(out, /^Delta: 0 areas to review · fresh: api, util, web · unmapped: 1 file$/m);
  // The fresh areas are behind HEAD: anchoring them ends the catch-up, so the file is listed once.
  assert.match(out, /^- `telos area anchor api util web`$/m);
  await ok(root, 'area', 'anchor', 'api', 'util', 'web');
  assert.equal(await ok(root, 'ctx', 'catchup'), 'Nothing to catch up\n');
});

test('an area with uncommitted files stays out of the anchor command and is named', async (t) => {
  const { root } = areasRepo(t);
  write(root, 'src/api/routes.mjs', 'export const routes = {};\n');
  commitAll(root, 'feat: routes');
  write(root, 'src/web/app.mjs', 'export const title = "dirty";\n');
  const out = await ok(root, 'ctx', 'catchup');
  assert.match(out, /^- `telos area anchor api`\n- not anchored, covered files are uncommitted: web; [^\n]+\n- only when/m);
  await ok(root, 'area', 'anchor', 'api');
});

test('no area files refuses; arguments are a usage error', async (t) => {
  const { root } = areasRepo(t);
  assert.equal((await telos(root, 'ctx', 'catchup', 'x')).code, 2);
  rmSync(join(root, '.telos', 'areas'), { recursive: true });
  assert.equal(await ok(root, 'ctx', 'catchup'), 'REFUSED: no area files; run /telos:map first\n');
});
