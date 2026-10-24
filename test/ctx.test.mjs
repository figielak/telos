import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { DEFAULTS, write as writeConfig } from '../lib/config.mjs';
import { CAP, MARKER, cap, excerpt } from '../lib/ctx/index.mjs';
import { stackLine } from '../lib/ctx/stack.mjs';
import { render } from '../lib/template.mjs';

const fixture = (name) => fileURLToPath(new URL(`fixtures/${name}/`, import.meta.url));

/** Copy a fixture into a fresh git repo, so findRoot() stops there. */
function repo(name = 'empty') {
  const root = mkdtempSync(join(tmpdir(), 'telos-ctx-'));
  cpSync(fixture(name), root, { recursive: true });
  mkdirSync(join(root, '.git'));
  return root;
}

function initialize(root, cfg = {}) {
  writeConfig(root, { ...DEFAULTS, ...cfg });
  writeFileSync(join(root, '.telos', 'STATUS.md'), render('STATUS.md', { next: 'run /telos:map' }));
  writeFileSync(join(root, '.telos', 'PROJECT.md'), render('PROJECT.md', { name: 'demo' }));
}

async function ctx(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(['ctx', ...args], { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

test('ctx init on astro-ts lists stack, checks and evidence', async () => {
  const r = await ctx(repo('astro-ts'), 'init', 'standard');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^Requested profile: standard$/m);
  assert.match(r.stdout, /^Telos: not initialized$/m);
  assert.match(r.stdout, /^Stack: astro 5 · typescript 5\.6 · node >=22$/m);
  assert.match(r.stdout, /^- lint: `pnpm run lint` \(package\.json scripts\.lint\)$/m);
  assert.match(r.stdout, /^Package manager: pnpm \(pnpm-lock\.yaml\)$/m);
});

test('ctx init flags an invalid profile instead of failing', async () => {
  const r = await ctx(repo(), 'init', 'huge');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^Requested profile: huge \(invalid; use minimal, standard or deep\)$/m);
});

test('ctx init in an initialized repo reports existing files', async () => {
  const root = repo();
  initialize(root);
  const r = await ctx(root, 'init');
  assert.match(r.stdout, /^Requested profile: not given$/m);
  assert.match(r.stdout, /^Telos: initialized, profile standard \(PROJECT\.md, STATUS\.md, config\.json\)$/m);
});

test('ctx init reports the CLAUDE.md block as present, outdated or absent', async () => {
  const cases = [
    [render('claude-block.md', {}), 'present v1'],
    ['# Mine\n<!-- telos:start -->\nold\n<!-- telos:end -->\n', 'outdated'],
    ['# Mine\n', 'absent'],
  ];
  for (const [text, state] of cases) {
    const root = repo();
    writeFileSync(join(root, 'CLAUDE.md'), text);
    const r = await ctx(root, 'init');
    assert.match(r.stdout, new RegExp(`^CLAUDE\\.md block: ${state}$`, 'm'));
  }
});

test('oversized bundles are truncated with the marker', () => {
  const out = cap('x'.repeat(CAP * 2));
  assert.ok(out.length <= CAP, `${out.length} > ${CAP}`);
  assert.ok(out.endsWith(MARKER));
  assert.equal(cap('short'), 'short');
});

test('unknown bundle prints one line and exits 0', async () => {
  const r = await ctx(repo(), 'nope');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "telos ctx: 'nope' not available yet\n");
});

test('ctx without a bundle name is a usage error', async () => {
  assert.equal((await ctx(repo())).code, 2);
});

test('excerpts carry no HTML or frontmatter comments', () => {
  const root = repo();
  const task = join(root, 'task.md');
  writeFileSync(task, render('task.md', { id: '01-02', title: 'Check' }));
  const status = join(root, 'STATUS.md');
  writeFileSync(status, render('STATUS.md', { next: 'x' }));
  for (const file of [task, status]) assert.doesNotMatch(excerpt(file), /<!--|-->/);
  const fm = excerpt(task).split('---')[1];
  assert.doesNotMatch(fm, /#/);
  assert.match(fm, /^type: code$/m);
  assert.match(excerpt(task), /^## Goal$/m, 'Markdown headings survive');
  assert.doesNotMatch(excerpt(status), /\n\n\n/, 'no blank-line runs left behind');
});

test('stackLine formats detected versions; empty stack is unknown', () => {
  const root = repo('astro-ts');
  assert.equal(stackLine(root, { stack: ['astro', 'typescript'] }), 'Stack: astro 5 · typescript 5.6 · node >=22');
  assert.equal(stackLine(repo(), { stack: [] }), 'Stack: unknown');
});

test('ctx status: view, stack line and file pointers; uninitialized is one line', async () => {
  const root = repo('python-uv');
  initialize(root, { stack: ['python'] });
  const r = await ctx(root, 'status');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^Phase: none · Task: none$/m);
  assert.match(r.stdout, /^Stack: python >=3\.12$/m);
  assert.match(r.stdout, /^Files: \.telos\/STATUS\.md/m);

  const bare = await ctx(repo(), 'status');
  assert.equal(bare.code, 0);
  assert.equal(bare.stdout, 'Telos not initialized. Run /telos:init.\n');
});
