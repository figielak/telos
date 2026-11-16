import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measure } from '../lib/budget.mjs';
import { main } from '../lib/cli.mjs';
import { BUNDLE_CAP, CAP, INSTRUCTIONS, INSTRUCTIONS_CAP, INSTRUCTIONS_HEADING, contextOf, stripComments } from '../lib/ctx/index.mjs';
import { areasRepo, commitAll, write } from './areas-repo.mjs';

// 14-02: `telos ctx <name>` is a self-contained step for any agent: context, then instructions.

const SHARED = fileURLToPath(new URL('../shared/', import.meta.url));
const instructions = (name) => stripComments(readFileSync(`${SHARED}${name}.md`, 'utf8')).trim();

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  assert.equal(code, 0, `telos ${args.join(' ')}: ${err.text}`);
  return out.text;
}

/** The areas fixture with phase 01 active, all tasks done, and one commit in area api. */
async function workedRepo(t) {
  const { root } = areasRepo(t);
  await telos(root, 'roadmap', 'add', 'demo', 'demo phase', 'demo works');
  await telos(root, 'roadmap', 'set', '01', 'active');
  await telos(root, 'status', 'set', 'phase=01-demo', 'task=none');
  mkdirSync(join(root, '.telos', 'phases'));
  write(root, '.telos/phases/01-demo.md', '# 01-demo\n\n## Goal\ndemo\n\n## Tasks\n- [x] **01-01 Route**\n\n## Notes\n- none\n');
  write(root, 'src/api/routes.mjs', 'export const routes = { "/": "home", "/health": "ok" };\n');
  commitAll(root, 'feat: health route');
  return root;
}

const CASES = [['status'], ['plan'], ['plan', '01'], ['close'], ['catchup'], ['map']];

test('every step prints its context first, then its instructions', async (t) => {
  const root = await workedRepo(t);
  for (const args of CASES) {
    const [name] = args;
    const out = await telos(root, 'ctx', ...args);
    const label = args.join(' ');
    const context = contextOf(out);
    assert.ok(context.length < out.length, `${label}: no instructions`);
    assert.doesNotMatch(context, /^REFUSED:/, label);
    assert.ok(context.length - 1 <= CAP, `${label}: context ${context.length - 1} > ${CAP}`);
    assert.equal(out, `${context}\n${INSTRUCTIONS_HEADING}\n${instructions(INSTRUCTIONS[name])}\n`, label);
  }
});

test('a refusal or an empty catch-up ends the step without instructions', async (t) => {
  const { root } = areasRepo(t);
  assert.equal(await telos(root, 'ctx', 'catchup'), 'Nothing to catch up\n');
  assert.equal(await telos(root, 'ctx', 'close'), 'REFUSED: no phase in STATUS; pass NN\n');
  write(root, 'src/api/routes.mjs', 'dirty\n');
  assert.match(await telos(root, 'ctx', 'map'), /^REFUSED: [^\n]*\n$/);
});

test('instruction files stay within their own cap', () => {
  for (const name of new Set(Object.values(INSTRUCTIONS))) {
    const text = instructions(name);
    assert.ok(text.length <= INSTRUCTIONS_CAP, `shared/${name}.md: ${text.length} > ${INSTRUCTIONS_CAP}`);
  }
});

test('telos budget --ctx measures every step within the bundle cap', async (t) => {
  const root = await workedRepo(t);
  for (const args of CASES) {
    const [row] = measure(root, { ctx: args }).rendered.filter((r) => r.label.startsWith('ctx '));
    assert.equal(row.label, `ctx ${args.join(' ')}`);
    assert.ok(row.chars <= BUNDLE_CAP, `${row.label}: ${row.chars} > ${BUNDLE_CAP}`);
    assert.ok(!row.truncated, `${row.label} truncated`);
  }
});
