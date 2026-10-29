import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';
import { CAP } from '../lib/ctx/index.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
function put(root, path, text) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
}
function fixture(t, { profile = 'deep', files = {}, checks = { test: 'npm test' } } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-ctx-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  put(root, '.telos/config.json', JSON.stringify({ profile, checks }));
  put(root, '.telos/STATUS.md', 'Phase: 05-deep\nTask: none\nNext: none\n');
  put(root, '.telos/MAP.md', '# Map\n## Structure\n- `README.md` — usage and commands\n- `docs/` — module guides\n- `src/` — app code\n');
  put(root, 'README.md', '# Example\n');
  for (const [path, text] of Object.entries(files)) put(root, path, text);
  git(root, 'add', '--', '.telos/config.json', '.telos/STATUS.md', '.telos/MAP.md', 'README.md', ...Object.keys(files));
  git(root, 'commit', '-qm', 'baseline');
  git(root, 'tag', 'telos/05-start');
  return root;
}
async function ctxDocs(root, ...args) {
  let out = '', err = '';
  const code = await main(['ctx', 'docs', ...args], { cwd: root,
    stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } } });
  return { code, out, err };
}

test('deep bundle has target, docs destinations, checks, MAP pointers and scan candidates within the cap', async (t) => {
  const root = fixture(t, { files: { 'src/api.mjs': 'export function fetchItem() {}\n', 'docs/guide.md': 'Call fetchItem.\n', 'README.md': '# Example\nUse `src/api.mjs`.\n' } });
  put(root, 'src/api.mjs', 'export function fetchItem(id) {}\nexport function loadItem() {}\n');
  const { code, out } = await ctxDocs(root);
  assert.equal(code, 0);
  assert.ok(out.length <= CAP + 1, String(out.length));
  const order = ['Profile: deep', 'Target: phase 05', 'Docs: readme=README.md', 'Checks: test=npm test', 'MAP pointers:',
    '- `README.md` — usage and commands', 'Baseline: telos/05-start', 'Doc matches (2):', '"README.md":2-2', '"docs/guide.md":1-1',
    'Omissions (0):', 'Changed paths (1):', '"src/api.mjs"', 'Symbol candidates', 'Sync: UPDATE'];
  let at = -1;
  for (const part of order) {
    const i = out.indexOf(part, at + 1);
    assert.ok(i > at, `${part} missing or out of order`);
    at = i;
  }
  assert.doesNotMatch(out, /\n- `src\/` — app code/, 'MAP pointers keep only documentation lines');
});

test('lower profiles get the exact deep gate and nothing else', async (t) => {
  for (const profile of ['minimal', 'standard']) {
    const { code, out } = await ctxDocs(fixture(t, { profile }));
    assert.equal(code, 0, profile);
    assert.equal(out, 'Requires deep profile. Switch with /telos:profile deep.\n', profile);
  }
});

test('scopes are validated before any scan and unsafe strings never reach the bundle', async (t) => {
  const root = fixture(t);
  for (const bad of [['--scope'], ['--scope', '../etc'], ['--scope', '/etc/passwd'], ['--scope', 'a:b'], ['--scope', 'a\\b'],
    ['--scope', 'src;rm -rf'], ['--scope', 'x$(id)'], ['--scope', ''], ['--scope', '--scope'], ['05'], ['--bogus']]) {
    const { code, out, err } = await ctxDocs(root, ...bad);
    assert.equal(code, 2, JSON.stringify(bad));
    assert.equal(out, '', JSON.stringify(bad));
    assert.match(err, /usage|invalid scope/i, JSON.stringify(bad));
  }
  put(root, 'src/a.mjs', 'export const a = 1;\n');
  const ok = await ctxDocs(root, '--scope', 'src', '--scope', 'docs/guide.md');
  assert.equal(ok.code, 0);
  assert.match(ok.out, /^Target: phase 05 · scope "src", "docs\/guide\.md"$/m);
  assert.match(ok.out, /"src\/a\.mjs"/);
});

test('no scope means the current phase diff', async (t) => {
  const { out } = await ctxDocs(fixture(t));
  assert.match(out, /^Target: phase 05 · scope none \(current phase diff\)$/m);
});

test('empty matches are a no-op and incomplete evidence is never declared synchronized', async (t) => {
  const root = fixture(t);
  const clean = (await ctxDocs(root)).out;
  assert.match(clean, /^Doc matches \(0\):$/m);
  assert.match(clean, /^Sync: NO-OP — no documentation candidates; edit nothing$/m);
  put(root, 'docs/blob.md', 'x\n'.repeat(70000));
  put(root, 'src/a.mjs', 'export const a = 1;\n');
  const out = (await ctxDocs(root)).out;
  assert.match(out, /^Omissions \(1\):\n- "docs\/blob\.md": "file byte limit/m);
  assert.match(out, /^Sync: NOT VERIFIED — .*inspect each omitted path or range with targeted reads before claiming docs are synchronized$/m);
  assert.doesNotMatch(out, /Sync: NO-OP/);
});

test('a missing phase tag refuses with the remedy and never falls back to history', async (t) => {
  const root = fixture(t);
  git(root, 'tag', '-d', 'telos/05-start');
  const { code, out } = await ctxDocs(root);
  assert.equal(code, 0);
  assert.match(out, /^REFUSED: Missing baseline telos\/05-start; restore the phase tag from approval \(\/telos:approve\), then retry\. No history fallback\.\n$/);
});

test('a huge scan keeps the fixed header, omissions and counts within the cap', async (t) => {
  const root = fixture(t);
  for (let i = 0; i < 200; i++) put(root, `src/very/long/module/path/number/${i}/file-${i}.mjs`, `export const value${i} = ${i};\n`);
  put(root, 'docs/blob.md', 'x\n'.repeat(70000));
  const { out } = await ctxDocs(root);
  assert.ok(out.length <= CAP + 1, String(out.length));
  for (const part of ['Profile: deep', 'Checks: test=npm test', 'Omissions (1):', 'docs/blob.md', 'Changed paths (201):', 'Sync: NOT VERIFIED']) {
    assert.ok(out.includes(part), part);
  }
  assert.match(out, /^Report rows omitted for the bundle cap: \d+; run `telos docs-scan` for the full list$/m);
});
