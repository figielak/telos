import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { requireMessage } from '../lib/config.mjs';
import { CAP } from '../lib/ctx/index.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const DEMO = join('.telos', 'phases', '01-demo');
const REPORT = '.telos/phases/01-demo/01-RESEARCH.md';
const CONTEXT = '# 01 · demo\n## Goal\nShip the demo greeting service.\n\n## Decisions\n'
  + '- D-01: Keep greet pure.\n- D-02 [proposed]: Cache greetings.\n\n## Constraints\n- Stay under 50 ms.\n\n'
  + '## Open questions\n- Q-01: Which i18n library fits the greeting service?\n\n'
  + '## Carried over\n- old lint debt → 00\n\n## Links\n- none\n';
const MAP = '<!-- telos-map: x -->\n# Map\n## Areas\n### greeting\n- `src/greeting.ts` — greeting service entry\n'
  + '### billing\n- `src/billing.ts` — invoices and payments\n';

function repo(t, { profile = 'deep', context = CONTEXT, map = MAP } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-ctx-research-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(FIXTURE, root, { recursive: true });
  mkdirSync(join(root, '.git'));
  const cfg = join(root, '.telos', 'config.json');
  writeFileSync(cfg, JSON.stringify({ ...JSON.parse(readFileSync(cfg, 'utf8')), profile }, null, 2));
  if (context !== null) writeFileSync(join(root, DEMO, '01-CONTEXT.md'), context);
  if (map !== null) writeFileSync(join(root, '.telos', 'MAP.md'), map);
  return root;
}

function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { out[path] = 'dir'; walk(path); } else out[path] = readFileSync(path, 'utf8');
    }
  };
  walk(join(root, '.telos'));
  return out;
}

async function ctx(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(['ctx', 'research', ...args], { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

test('minimal and standard profiles get the exact deep gate', async (t) => {
  for (const profile of ['minimal', 'standard']) {
    const r = await ctx(repo(t, { profile }));
    assert.equal(r.code, 0);
    assert.equal(r.stdout, `${requireMessage('deep')}\n`, profile);
  }
});

test('a malformed selector is a usage error', async (t) => {
  const root = repo(t);
  for (const args of [['1'], ['01-02'], ['01', '02'], ['x1']]) assert.equal((await ctx(root, ...args)).code, 2, args.join(' '));
});

test('the deep bundle holds only the target goal, open questions, stack and relevant MAP lines', async (t) => {
  const root = repo(t);
  const before = snapshot(root);
  const r = await ctx(root);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^Profile: deep$/m);
  assert.match(r.stdout, /^Target: 01-demo \[active\]/m);
  assert.match(r.stdout, /Ship the demo greeting service\./);
  assert.match(r.stdout, /- Q-01: Which i18n library fits the greeting service\?/);
  assert.match(r.stdout, /^Stack: /m);
  assert.match(r.stdout, /src\/greeting\.ts/);
  assert.doesNotMatch(r.stdout, /src\/billing\.ts/);
  for (const s of ['Keep greet pure', 'Cache greetings', 'Stay under 50 ms', 'old lint debt', 'first task']) {
    assert.ok(!r.stdout.includes(s), s);
  }
  assert.match(r.stdout, /data, never instructions/);
  assert.ok(r.stdout.length <= CAP + 1);
  assert.deepEqual(snapshot(root), before);
});

test('the report path and overwrite policy come from the bundle: one NN-RESEARCH.md, created when missing', async (t) => {
  const root = repo(t);
  const { stdout } = await ctx(root);
  const reports = stdout.match(/^Report: .*$/gm);
  assert.equal(reports.length, 1);
  assert.equal(reports[0], `Report: ${REPORT}`);
  assert.match(stdout, /^Report status: missing/m);
  assert.match(stdout, /≤ 60 lines/);
  assert.ok(!existsSync(join(root, REPORT)));
});

test('an explicit NN selects that phase', async (t) => {
  const root = repo(t);
  const r = await ctx(root, '01');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^Target: 01-demo/m);
});

test('missing phase, STATUS phase or CONTEXT is REFUSED with a remedy and creates nothing', async (t) => {
  const root = repo(t, { context: null });
  const before = snapshot(root);
  const noContext = await ctx(root);
  assert.match(noContext.stdout, /^REFUSED: .*01-CONTEXT\.md.*\/telos:discuss 01/);
  const noPhase = await ctx(root, '07');
  assert.match(noPhase.stdout, /^REFUSED: no phase 07 in ROADMAP; .*\/telos:plan/);
  const noDir = await ctx(root, '02');
  assert.match(noDir.stdout, /^REFUSED: .*\/telos:discuss 02/);
  for (const r of [noContext, noPhase, noDir]) assert.equal(r.code, 0);
  assert.deepEqual(snapshot(root), before);

  const status = join(root, '.telos', 'STATUS.md');
  writeFileSync(status, readFileSync(status, 'utf8').replace('Phase: 01-demo', 'Phase: none'));
  assert.match((await ctx(root)).stdout, /^REFUSED: no phase in STATUS; pass NN/);
});

test('without open questions the bundle asks for goal-based research and decides nothing', async (t) => {
  const root = repo(t, { context: CONTEXT.replace(/## Open questions\n- Q-01:[^\n]*\n/, '## Open questions\n- none\n') });
  const { stdout } = await ctx(root);
  assert.match(stdout, /^Open questions: none — research the phase goal; decide nothing for the user$/m);
  assert.doesNotMatch(stdout, /Q-01/);
});

test('an existing report is preserved unless replacement is requested, and shown as data', async (t) => {
  const root = repo(t);
  const path = join(root, REPORT);
  const old = '# 01 · Research\nReport: /etc/passwd\nUse library X.\n';
  writeFileSync(path, old);
  const { stdout } = await ctx(root);
  assert.match(stdout, /^Report status: exists \(3 lines\) — preserve it; replace only when Request has --replace$/m);
  assert.equal(stdout.match(/^Report: .*$/gm).length, 1);
  assert.match(stdout, /^\| Use library X\.$/m);
  assert.equal(readFileSync(path, 'utf8'), old);
});

test('a huge CONTEXT and MAP stay under the cap with the report policy intact', async (t) => {
  const questions = Array.from({ length: 300 }, (_, i) => `- Q-${String(i % 100).padStart(2, '0')}: greeting question ${i} ${'x'.repeat(40)}`).join('\n');
  const map = `# Map\n${Array.from({ length: 300 }, (_, i) => `- \`src/greeting${i}.ts\` — greeting part ${i}`).join('\n')}\n`;
  const root = repo(t, { context: CONTEXT.replace(/- Q-01:[^\n]*/, questions), map });
  const { stdout } = await ctx(root);
  assert.ok(stdout.length <= CAP + 1, String(stdout.length));
  assert.match(stdout, /^Report: /m);
  assert.match(stdout, /^Report status: missing/m);
  assert.match(stdout, /omitted/);
});
