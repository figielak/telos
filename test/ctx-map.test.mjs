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
function repo({ commit = true, initialize = true, files = {} } = {}) {
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
  if (initialize) init(root);
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

const HEADINGS = '## Structure\n\n## Areas\n\n## Find\n';

async function addArea(root, name, paths) {
  const sink = { write() {} };
  assert.equal(await main(['area', 'new', name, '--paths', paths], { cwd: root, stdout: sink, stderr: sink }), 0);
}

test('a fresh init yields a full-mode bundle with the exact header to write', async () => {
  {
    const root = repo();
    const head = git(root, 'rev-parse', 'HEAD').trim();
    const files = scanRepo(root).files.length;
    const { code, text } = await ctxMap(root);
    assert.equal(code, 0);
    const lines = text.split('\n');
    assert.equal(lines[0], 'Map validation: NOT BUILT');
    assert.equal(lines[1], 'Mode: full');
    assert.match(text, new RegExp(`^Header to write: <!-- telos-map: commit ${head} · \\d{4}-\\d{2}-\\d{2} · files ${files} -->$`, 'm'));
    assert.match(text, /^Map limit: 600 estimated tokens/m);
    assert.match(text, /^Headings: # Map · ## Structure \(≤ 10 lines\) · ## Areas \(one row per area file: .*\) · ## Find \(task → area or file\)$/m);
    assert.match(text, /^Areas: none yet · each ≤ 800 estimated tokens$/m);
    assert.match(text, new RegExp(`^Area header: <!-- telos-area: commit ${head} · \\d{4}-\\d{2}-\\d{2} · paths: <a/, b\\.mjs> --> on line 1`, 'm'));
    assert.match(text, /^Area files: \.telos\/areas\/<name>\.md, created by `telos area new <name> --paths a\/,b\.mjs`; sections Purpose · Entry points · Invariants · Decisions · Rejected · Pitfalls; /m);
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
  assert.match(r.text, /^REFUSED: .*telos init/);

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
  assert.match(text, /^Map validation: FAIL .*Missing section heading: Areas\./m);
  assert.match(text, /^Existing MAP: \.telos\/MAP\.md/m);

  writeFileSync(map, `${header}${HEADINGS}${'- x → `src/main.js:1-1`\n'.repeat(400)}`);
  ({ text } = await ctxMap(root));
  assert.match(text, /^Map validation: FAIL .*token budget exceeded/m);

  const good = `${header}## Structure\n- \`src/\` — app code\n\n## Areas\n- core — util · \`src/lib/\`\n\n## Find\n- util → \`src/lib/util.js:1-1\`\n`;
  writeFileSync(map, good);
  ({ text } = await ctxMap(root));
  assert.match(text, /^Map validation: FAIL Areas row core has no file \.telos\/areas\/core\.md/m);
  await addArea(root, 'core', 'src/lib/');
  ({ text } = await ctxMap(root));
  assert.match(text, new RegExp(`^Map validation: PASS ${estimateTokens(good)}/600$`, 'm'));
  assert.match(text, /^Areas: core · each ≤ 800 estimated tokens$/m);
  const area = join(root, '.telos', 'areas', 'core.md');
  writeFileSync(area, readFileSync(area, 'utf8').replace('## Rejected\n', ''));
  await addArea(root, 'extra', 'src/main.js');
  ({ text } = await ctxMap(root));
  assert.match(text, /^Map validation: FAIL .*Area file \.telos\/areas\/extra\.md has no row in ## Areas\. \| \.telos\/areas\/core\.md: missing section "## Rejected"/m);
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

// Refresh (03-07, 11-03): a MAP index and area files built at the first commit, then committed changes.
const AREA_FILES = { 'src/a/one.js': 'export const one = 1;\n', 'src/b/two.js': 'export const two = 2;\n', 'src/c/three.js': 'export const three = 3;\n', 'src/d/four.js': 'export const four = 4;\n', 'README.md': '# demo\n' };

function builtMap(commit, { find = '- four → `src/d/four.js:1-1`\n' } = {}) {
  return `<!-- telos-map: commit ${commit} · 2026-10-26 · files 9 -->\n# Map\n\n## Structure\n- \`README.md\` — readme\n\n`
    + '## Areas\n- a — one · `src/a/`\n- b — two · `src/b/`\n- c — three · `src/c/`\n\n'
    + `## Find\n${find}`;
}

async function mappedRepo(opts = {}) {
  const root = repo({ files: { ...AREA_FILES, ...(opts.files ?? {}) } });
  if (opts.limit) setLimit(root, opts.limit);
  const text = builtMap(git(root, 'rev-parse', 'HEAD').trim(), opts);
  writeFileSync(join(root, '.telos', 'MAP.md'), text);
  for (const name of ['a', 'b', 'c']) await addArea(root, name, `src/${name}/`);
  return { root, text };
}

function commitChange(root, file, text) {
  write(root, file, text);
  git(root, 'add', file);
  git(root, 'commit', '-q', '-m', `chore: change ${file}`);
}

test('--refresh plans an incremental update with impact, changed paths and affected area pointers', async () => {
  const { root } = await mappedRepo();
  commitChange(root, 'src/a/one.js', 'export const one = 11;\n');
  const head = git(root, 'rev-parse', 'HEAD').trim();
  const { code, text } = await ctxMap(root, '--refresh');
  assert.equal(code, 0);
  assert.match(text, /^Map validation: PASS \d+\/600$/m);
  assert.match(text, /^Mode: incremental$/m);
  assert.match(text, /^Reason: 1\/6 editable units affected/m);
  assert.match(text, /^Impact: 1\/6 editable units · blocks: none · areas: a$/m);
  assert.match(text, new RegExp(`^Header to write: <!-- telos-map: commit ${head} · `, 'm'));
  assert.match(text, new RegExp(`^Area header: <!-- telos-area: commit ${head} · `, 'm'));
  assert.match(text, /^Changed: M src\/a\/one\.js$/m);
  assert.match(text, /^Affected areas: a \(\.telos\/areas\/a\.md\)$/m);
  assert.match(text, /^Affected blocks: none$/m);
  assert.ok(text.indexOf('Affected blocks:') < text.indexOf('Suggestions:'));
  assert.ok(text.indexOf('Suggestions:') < text.indexOf('Scan:'));
  assert.match(text, /^Existing MAP: \.telos\/MAP\.md/m);
});

test('--refresh after an added file inlines the index blocks to update and names the owning area', async () => {
  const { root } = await mappedRepo();
  commitChange(root, 'src/a/extra.js', 'export const extra = 1;\n');
  commitChange(root, 'src/e/five.js', 'export const five = 5;\n');
  const { text } = await ctxMap(root, '--refresh');
  assert.match(text, /^Impact: 3\/6 editable units · blocks: structure, areas · areas: a$/m);
  assert.match(text, /^New Area candidates: src\/e\/five\.js$/m);
  const affected = text.split('Affected blocks:\n')[1];
  assert.ok(affected.startsWith('--- block structure (replace exactly this text)\n## Structure\n- `README.md` — readme\n\n--- end structure\n'), affected.slice(0, 200));
  assert.ok(affected.includes('--- block areas (replace exactly this text)\n## Areas\n- a — one · `src/a/`\n'));
  assert.doesNotMatch(affected.split('Suggestions:')[0], /## Find/);
});

test('empty arguments stay full; unknown or repeated arguments are usage errors', async () => {
  const { root } = await mappedRepo();
  commitChange(root, 'src/a/one.js', 'export const one = 11;\n');
  assert.match((await ctxMap(root)).text, /^Mode: full$/m);
  for (const args of [['--full'], ['--refresh', '--refresh'], ['refresh']]) {
    const r = await ctxMap(root, ...args);
    assert.equal(r.code, 2, args.join(' '));
  }
});

test('an oversized scan shrinks in refresh mode; affected pointers, header and limit stay whole', async () => {
  const files = {};
  for (let i = 0; i < 300; i++) files[`src/very/long/directory/name/module-${String(i).padStart(3, '0')}-${'x'.repeat(40)}.js`] = 'export {};\n';
  const { root } = await mappedRepo({ files });
  commitChange(root, 'src/a/one.js', 'export const one = 11;\n');
  const { text } = await ctxMap(root, '--refresh');
  assert.ok(text.length - 1 <= CAP, `payload ${text.length - 1}`);
  assert.ok(!text.includes(MARKER));
  for (const re of [/^Mode: incremental$/m, /^Header to write: /m, /^Map limit: /m, /^Affected areas: a /m, /^Scan:/m]) assert.match(text, re);
});

test('affected blocks too large for the payload are refused, never clipped', async () => {
  const find = '- four → `src/d/four.js:1-1` — a very long explanatory row for the budget\n'.repeat(110);
  const { root } = await mappedRepo({ find, limit: 6000 });
  commitChange(root, 'src/d/four.js', 'export const four = 44;\n');
  const { code, text } = await ctxMap(root, '--refresh');
  assert.equal(code, 0);
  assert.match(text, /^REFUSED: refresh context needs \d+ chars for the affected blocks \(limit 6000\); run \/telos:map for a full rebuild/);
  assert.ok(text.length <= CAP);
});

test('refresh falls back to full on a stub, is a noop without changes and refuses ambiguous or dirty input', async () => {
  const stub = repo();
  let { text } = await ctxMap(stub, '--refresh');
  assert.match(text, /^Mode: full$/m);
  assert.match(text, /^Reason: refresh fallback: MAP baseline is missing, not built or invalid/m);
  assert.doesNotMatch(text, /^Affected blocks:/m);

  const { root } = await mappedRepo();
  ({ text } = await ctxMap(root, '--refresh'));
  assert.match(text, /^Mode: noop$/m);
  assert.match(text, /^Impact: 0\/6 editable units · blocks: none · areas: none$/m);
  assert.match(text, /^Write: replace only line 1 of \.telos\/MAP\.md with Header to write/m);

  const ambiguous = await mappedRepo({ find: '- four → `src/d/four.js:1-1`\n- a → `src/a/`\n- a file → `src/a`\n' });
  commitChange(ambiguous.root, 'src/a/one.js', 'export const one = 11;\n');
  ({ text } = await ctxMap(ambiguous.root, '--refresh'));
  assert.match(text, /^REFUSED: refresh: Ambiguous file\/directory MAP reference/);

  write(root, 'src/b/two.js', 'export const two = 22;\n');
  ({ text } = await ctxMap(root, '--refresh'));
  assert.match(text, /^REFUSED: uncommitted source changes \(src\/b\/two\.js\)/);
});

test('refresh validates the whole saved MAP and keeps authored PROJECT sections preserved', async () => {
  const { root, text: saved } = await mappedRepo();
  setLimit(root, estimateTokens(saved));
  const project = join(root, '.telos', 'PROJECT.md');
  writeFileSync(project, readFileSync(project, 'utf8').replace(/(## Purpose\n<!--[^\n]*-->\n)/, '$1Ship a tiny demo.\n'));
  commitChange(root, 'src/a/one.js', 'export const one = 11;\n');
  let { text } = await ctxMap(root, '--refresh');
  assert.match(text, new RegExp(`^Map validation: PASS ${estimateTokens(saved)}/${estimateTokens(saved)}$`, 'm'));
  assert.match(text, /preserve: Purpose \("Ship a tiny demo\."\)/);
  writeFileSync(join(root, '.telos', 'MAP.md'), saved.replace('- b — two · `src/b/`', '- b — two, now with a longer unchanged description · `src/b/`'));
  ({ text } = await ctxMap(root, '--refresh'));
  assert.match(text, /^Map validation: FAIL .*token budget exceeded/m);
});

// 05-14: the bundle states the commit policy for the confirmed docs(telos): map commit.
test('the bundle names the map commit policy from git.auto_commit', async () => {
  const root = repo();
  const yes = (await ctxMap(root)).text;
  assert.match(yes, /^Auto-commit: yes$/m);
  assert.match(yes, /^Commit after PASS: ask once; on yes `git add \.telos\/MAP\.md \.telos\/areas\/` \(\+ `\.telos\/PROJECT\.md` when changed\), then `git commit -m "docs\(telos\): map" -- <those paths>`; other staged paths → no commit$/m);
  const path = join(root, '.telos', 'config.json');
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, JSON.stringify({ ...cfg, git: { ...cfg.git, auto_commit: false } }));
  const no = (await ctxMap(root)).text;
  assert.match(no, /^Auto-commit: no$/m);
  assert.match(no, /^Commit: none — git\.auto_commit is false; no git writes, leave docs\(telos\): map to the user$/m);
  assert.doesNotMatch(no, /Commit after PASS/);
});
