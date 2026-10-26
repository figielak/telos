import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';
import { CAP, MARKER } from '../lib/ctx/index.mjs';
import { mapBundle } from '../lib/ctx/map.mjs';
import { init } from '../lib/init.mjs';
import { estimateTokens } from '../lib/map-budget.mjs';
import { scanRepo } from '../lib/map-scan.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
const NOW = new Date('2026-10-26T23:30:00Z');

function write(root, file, text) {
  mkdirSync(join(root, file, '..'), { recursive: true });
  writeFileSync(join(root, file), text);
}

/** A committed repo with a little source, then `telos init` (its output stays uncommitted). */
function repo({ profile = 'minimal', commit = true, initialize = true, files = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-ctx-map-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'package.json', '{"name":"demo","main":"src/main.js","scripts":{"test":"node --test"}}\n');
  write(root, 'src/main.js', 'export const main = () => 1;\n');
  write(root, 'src/lib/util.js', 'export const util = 2;\n');
  for (const [file, text] of Object.entries(files)) write(root, file, text);
  if (commit) {
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'chore: init');
  }
  if (initialize) init(root, { profile });
  return root;
}

async function ctxMap(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(['ctx', 'map', ...args], { cwd: root, stdout: out, stderr: err });
  return { code, text: out.text, err: err.text };
}

const setLimit = (root, n) => {
  const path = join(root, '.telos', 'config.json');
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  cfg.limits.map_tokens = n;
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`);
};

const HEADINGS = '## Structure\n\n## Entry points\n\n## Flows\n\n## Areas\n\n## Find\n';

test('a fresh init in every profile yields a full-mode bundle with the exact header to write', async () => {
  for (const profile of ['minimal', 'standard', 'deep']) {
    const root = repo({ profile });
    const head = git(root, 'rev-parse', 'HEAD').trim();
    const files = scanRepo(root).files.length;
    const { code, text } = await ctxMap(root);
    assert.equal(code, 0);
    const lines = text.split('\n');
    assert.equal(lines[0], 'Map validation: NOT BUILT');
    assert.equal(lines[1], 'Mode: full');
    assert.match(text, new RegExp(`^Header to write: <!-- telos-map: commit ${head} · \\d{4}-\\d{2}-\\d{2} · files ${files} -->$`, 'm'));
    assert.match(text, /^Map limit: 1500 estimated tokens/m);
    assert.match(text, /^Headings: # Map · ## Structure · ## Entry points · ## Flows · ## Areas \(### per area\) · ## Find$/m);
    assert.match(text, /^Write: \.telos\/MAP\.md/m);
    assert.match(text, /^Project: \.telos\/PROJECT\.md · draft: Purpose, Rules, Conventions, Out of scope · preserve: none$/m);
    assert.match(text, /^Suggestions:\n- src\/main\.js:1-1 \(/m);
    assert.match(text, /^Scan:\nHEAD: [0-9a-f]{40}$/m);
    assert.ok(text.indexOf('Project:') < text.indexOf('Suggestions:'));
    assert.ok(text.indexOf('Suggestions:') < text.indexOf('Scan:'));
  }
});

test('the header uses the UTC date and the full eligible inventory count', () => {
  const root = repo();
  const head = git(root, 'rev-parse', 'HEAD').trim();
  const text = mapBundle({ root, args: [], now: NOW });
  assert.match(text, new RegExp(`^Header to write: <!-- telos-map: commit ${head} · 2026-10-26 · files ${scanRepo(root).files.length} -->$`, 'm'));
});

test('missing init, missing HEAD and dirty source are refused with a fix; init output is not', async () => {
  const bare = repo({ initialize: false });
  let r = await ctxMap(bare);
  assert.equal(r.code, 0);
  assert.match(r.text, /^REFUSED: .*\/telos:init/);

  r = await ctxMap(repo({ commit: false }));
  assert.equal(r.code, 0);
  assert.match(r.text, /^REFUSED: no HEAD commit; .*first commit/);

  const root = repo();
  assert.doesNotMatch((await ctxMap(root)).text, /REFUSED/);
  write(root, 'src/main.js', 'export const main = () => 3;\n');
  write(root, 'src/new.js', 'export {};\n');
  r = await ctxMap(root);
  assert.equal(r.code, 0);
  assert.match(r.text, /^REFUSED: uncommitted source changes \(src\/main\.js, src\/new\.js\); commit or stash them/);
});

test('changes to excluded scan content do not refuse', async () => {
  const root = repo();
  write(root, 'package-lock.json', '{}\n');
  write(root, 'logo.png', 'x');
  assert.doesNotMatch((await ctxMap(root)).text, /REFUSED/);
});

test('long scan and PROJECT inputs keep every mandatory field within the payload cap', async () => {
  const files = {};
  for (let i = 0; i < 300; i++) files[`src/very/long/directory/name/for/budget/module-${String(i).padStart(3, '0')}-${'x'.repeat(40)}.js`] = 'export {};\n'.repeat(5);
  const root = repo({ files });
  const project = join(root, '.telos', 'PROJECT.md');
  writeFileSync(project, readFileSync(project, 'utf8')
    .replace(/(## Purpose\n<!--[^\n]*-->\n)/, `$1${'Authored purpose. '.repeat(300)}\n`)
    .replace(/## Conventions\n[\s\S]*?- none/, `## Conventions\n${'- convention line\n'.repeat(200)}`));
  writeFileSync(join(root, '.telos', 'MAP.md'), `<!-- telos-map: commit ${'a'.repeat(40)} · 2026-01-01 · files 1 -->\n# Map\n${'## Bogus\n'.repeat(400)}`);
  const { code, text } = await ctxMap(root);
  assert.equal(code, 0);
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
  assert.ok(text.length - 1 <= CAP, `payload ${text.length - 1} > ${CAP}`);
  assert.ok(!text.includes(MARKER), 'mandatory content was cut by cap()');
  for (const re of [/^Map validation: FAIL /m, /^Mode: full$/m, /^Header to write: <!-- telos-map: commit [0-9a-f]{40} · /m,
    /^Map limit: /m, /^Headings: /m, /^Refs: /m, /^Project: .*preserve: Purpose \(".{1,80}"\), Conventions/m, /^Suggestions:$/m, /^Scan:/m]) {
    assert.match(text, re);
  }
  assert.match(text, /more reasons\)/);
});

test('an invalid or over-limit MAP fails with reasons; the corrected saved MAP passes with measured tokens', async () => {
  const root = repo();
  const head = git(root, 'rev-parse', 'HEAD').trim();
  const map = join(root, '.telos', 'MAP.md');
  const header = `<!-- telos-map: commit ${head} · 2026-10-26 · files 4 -->\n# Map\n\n`;

  writeFileSync(map, `${header}## Structure\n\n## Find\n`);
  let { text } = await ctxMap(root);
  assert.match(text, /^Map validation: FAIL .*Missing section heading: Entry points\./m);
  assert.match(text, /^Existing MAP: \.telos\/MAP\.md/m);

  writeFileSync(map, `${header}${HEADINGS}${'- x → `src/main.js:1-1`\n'.repeat(400)}`);
  ({ text } = await ctxMap(root));
  assert.match(text, /^Map validation: FAIL .*token budget exceeded/m);

  const good = `${header}## Structure\n- \`src/\` — app code\n\n## Entry points\n- \`src/main.js:1-1\` — main\n\n## Flows\n\n## Areas\n### Core\n- \`src/lib/util.js\` — util\n\n## Find\n- util → \`src/lib/util.js:1-1\`\n`;
  writeFileSync(map, good);
  ({ text } = await ctxMap(root));
  assert.match(text, new RegExp(`^Map validation: PASS ${estimateTokens(good)}/1500$`, 'm'));
});

test('authored PROJECT sections are preserved, template-empty and missing ones are draftable', async () => {
  const root = repo();
  const project = join(root, '.telos', 'PROJECT.md');
  writeFileSync(project, readFileSync(project, 'utf8')
    .replace(/(## Purpose\n<!--[^\n]*-->\n)/, '$1Ship a tiny demo.\n')
    .replace(/## Out of scope[\s\S]*$/, ''));
  const { text } = await ctxMap(root);
  assert.match(text, /^Project: \.telos\/PROJECT\.md · draft: Rules, Conventions, Out of scope \(missing\) · preserve: Purpose \("Ship a tiny demo\."\)$/m);
});

test('a MAP limit too small for the skeleton is an explicit refusal', async () => {
  const root = repo();
  setLimit(root, 10);
  const { code, text } = await ctxMap(root);
  assert.equal(code, 0);
  assert.match(text, /^REFUSED: limits\.map_tokens 10 is below the \d+ tokens the MAP skeleton needs; raise it in \.telos\/config\.json/);
});

test('unknown arguments are a usage error', async () => {
  const root = repo();
  const r = await ctxMap(root, '--bogus');
  assert.equal(r.code, 2);
  assert.match(r.err, /ctx map/);
});
