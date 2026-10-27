import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { requireMessage } from '../lib/config.mjs';
import { CAP } from '../lib/ctx/index.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const DEMO = join('.telos', 'phases', '01-demo');
const CONTEXT = '# 01 · demo\n## Goal\nShip the demo.\n\n## Decisions\n'
  + '- D-01: Keep greet pure.\n- D-02 [proposed]: Cache greetings.\n\n## Constraints\n- none\n\n'
  + '## Open questions\n- Q-01: Who reads the greeting?\n\n## Carried over\n- none\n\n## Links\n- none\n';

function repo(t, profile = 'standard') {
  const root = mkdtempSync(join(tmpdir(), 'telos-ctx-discuss-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(FIXTURE, root, { recursive: true });
  mkdirSync(join(root, '.git'));
  const cfg = join(root, '.telos', 'config.json');
  writeFileSync(cfg, JSON.stringify({ ...JSON.parse(readFileSync(cfg, 'utf8')), profile }, null, 2));
  return root;
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

async function ctx(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(['ctx', ...args], { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

const setRoadmap = (root, from, to) => {
  const path = join(root, '.telos', 'ROADMAP.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace(from, to));
};

test('minimal profile gets the exact profile requirement', async (t) => {
  const r = await ctx(repo(t, 'minimal'), 'discuss');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, `${requireMessage('standard')}\n`);
});

test('without an argument discuss targets the STATUS phase and writes nothing', async (t) => {
  const root = repo(t);
  const before = snapshot(root);
  const r = await ctx(root, 'discuss');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^Profile: standard$/m);
  assert.match(r.stdout, /^Target: 01-demo \[active\] demo phase · done when: demo works$/m);
  assert.match(r.stdout, /^Context: \.telos\/phases\/01-demo\/01-CONTEXT\.md \(missing/m);
  assert.match(r.stdout, /^Next IDs: D-01 · Q-01$/m);
  assert.match(r.stdout, /^## Open questions$/m);
  assert.deepEqual(snapshot(root), before);
  assert.ok(r.stdout.length <= CAP);
});

test('an explicit planned phase is selected; deep works too; no phase directory is created', async (t) => {
  const root = repo(t, 'deep');
  const before = snapshot(root);
  const r = await ctx(root, 'discuss', '02');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^Profile: deep$/m);
  assert.match(r.stdout, /^Target: 02-next \[planned\]/m);
  assert.match(r.stdout, /^Mode: write\b/m);
  assert.match(r.stdout, /^Context: \.telos\/phases\/02-next\/02-CONTEXT\.md \(missing/m);
  assert.match(r.stdout, /^# 02 · next$/m);
  assert.deepEqual(snapshot(root), before);
});

test('unknown, done or dropped targets refuse; a malformed argument is a usage error', async (t) => {
  const root = repo(t);
  assert.match((await ctx(root, 'discuss', '07')).stdout, /^REFUSED: no phase 07 in ROADMAP/);
  setRoadmap(root, '02-next [planned]', '02-next [done]');
  assert.match((await ctx(root, 'discuss', '02')).stdout, /^REFUSED: phase 02-next is done/);
  setRoadmap(root, '02-next [done]', '02-next [dropped]');
  assert.match((await ctx(root, 'discuss', '02')).stdout, /^REFUSED: phase 02-next is dropped/);
  assert.equal((await ctx(root, 'discuss', 'abc')).code, 2);
  assert.equal((await ctx(root, 'discuss', '01', '02')).code, 2);
});

test('no STATUS phase and no argument refuses', async (t) => {
  const root = repo(t);
  const status = join(root, '.telos', 'STATUS.md');
  writeFileSync(status, readFileSync(status, 'utf8').replace('Phase: 01-demo', 'Phase: none'));
  assert.match((await ctx(root, 'discuss')).stdout, /^REFUSED: no phase in STATUS; pass NN/);
});

test('an active phase keeps its decisions and directs plan changes through revise', async (t) => {
  const root = repo(t);
  writeFileSync(join(root, DEMO, '01-CONTEXT.md'), CONTEXT);
  const r = await ctx(root, 'discuss', '01');
  assert.match(r.stdout, /^Mode: active\b/m);
  assert.match(r.stdout, /\/telos:revise/);
  assert.match(r.stdout, /never (?:rewrite|replace)/i);
});

test('existing decisions and questions are shown verbatim with the next free IDs and their tasks', async (t) => {
  const root = repo(t);
  writeFileSync(join(root, DEMO, '01-CONTEXT.md'), CONTEXT);
  const task = join(root, DEMO, '01-02-second-task.md');
  writeFileSync(task, readFileSync(task, 'utf8').replace('decisions: []', 'decisions: [D-02]'));
  const status = join(root, '.telos', 'STATUS.md');
  writeFileSync(status, readFileSync(status, 'utf8').replace('Awaiting user: none', 'Awaiting user: 01:D-02, 01:Q-01'));

  const r = await ctx(root, 'discuss');
  assert.match(r.stdout, /^Context: \.telos\/phases\/01-demo\/01-CONTEXT\.md \(\d+ lines\)$/m);
  assert.match(r.stdout, /^- D-01: Keep greet pure\.$/m);
  assert.match(r.stdout, /^- D-02 \[proposed\]: Cache greetings\.$/m);
  assert.match(r.stdout, /^- Q-01: Who reads the greeting\?$/m);
  assert.match(r.stdout, /^Next IDs: D-03 · Q-02$/m);
  assert.match(r.stdout, /^Referenced: D-02 ← 01-02$/m);
  assert.match(r.stdout, /^Awaiting user: 01:D-02, 01:Q-01$/m);

  // The existing gates still hold for the referenced proposed decision.
  assert.match((await ctx(root, 'approve')).stdout, /^- 01-02: D-02 is proposed$/m);
  assert.match((await ctx(root, 'do', '01-02')).stdout, /^REFUSED: .*D-02/m);
  // And plan/revise see the same CONTEXT unchanged.
  assert.match((await ctx(root, 'plan')).stdout, /^- D-02 \[proposed\]: Cache greetings\.$/m);
});
