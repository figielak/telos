import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { CAP } from '../lib/ctx/index.mjs';
import { render } from '../lib/template.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

function repo(checks = { test: 'npm test', test_related: 'node --test {files}', build: 'npm run build' }) {
  const root = mkdtempSync(join(tmpdir(), 'telos-ctx-quick-'));
  cpSync(FIXTURE, root, { recursive: true });
  writeFileSync(join(root, '.telos', 'PROJECT.md'), render('PROJECT.md', { name: 'demo' })
    .replace(/## Rules\n[\s\S]*?- none/, '## Rules\n- no runtime dependencies'));
  const config = join(root, '.telos', 'config.json');
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), checks }, null, 2));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'chore: init');
  return root;
}

async function ctxQuick(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const code = await main(['ctx', 'quick', ...args], { cwd: root, stdout: out, stderr: { write() {} } });
  assert.equal(code, 0);
  return out.text;
}

test('the bundle has rules, stack and only the configured quick checks, never the description', async () => {
  const out = await ctxQuick(repo());
  assert.doesNotMatch(out, /^(Change|REFUSED):/m);
  assert.match(out, /^Rules:\n- no runtime dependencies$/m);
  assert.match(out, /^Stack: /m);
  assert.match(out, /^Checks: test_related=node --test \{files\} · test=npm test$/m);
  assert.doesNotMatch(out, /build/);
  assert.match(out, /^Size: ≤ ~5 files and < 1 hour; larger → stop and suggest \/telos:plan$/m);
});

test('a dirty tree lists its files, a clean tree says clean', async () => {
  const root = repo();
  assert.match(await ctxQuick(root), /^Working tree: clean$/m);
  writeFileSync(join(root, 'src', 'a.ts'), 'changed\n');
  writeFileSync(join(root, 'notes.md'), 'new\n');
  assert.match(await ctxQuick(root), /^Working tree:\n- notes\.md\n- src\/a\.ts$/m);
});

test('more than 20 changed files are summarized', async () => {
  const root = repo();
  for (let i = 0; i < 25; i++) writeFileSync(join(root, `f${String(i).padStart(2, '0')}.txt`), 'x\n');
  const out = await ctxQuick(root);
  assert.match(out, /^- f19\.txt\n- … 5 more$/m);
});

test('the current task is named with its state', async () => {
  const root = repo();
  const task = join(root, '.telos', 'phases', '01-demo', '01-02-second-task.md');
  writeFileSync(task, readFileSync(task, 'utf8').replace('status: approved', 'status: in-progress'));
  assert.match(await ctxQuick(root), /^Current: phase 01-demo · task 01-02 \[in-progress\] — keep quick changes out of its files$/m);
});

test('no checks configured', async () => {
  assert.match(await ctxQuick(repo({})), /^Checks: none$/m);
});

test('the bundle stays under the cap without comments', async () => {
  const out = await ctxQuick(repo());
  assert.ok(out.length <= CAP + 1);
  assert.doesNotMatch(out, /<!--/);
});
