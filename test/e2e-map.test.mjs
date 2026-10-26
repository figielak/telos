import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setField } from '../lib/frontmatter.mjs';
import { loadTask } from '../lib/tasks.mjs';

// Offline CLI proof: known MAP/PROJECT text stands in for model output. Real-repository
// navigation quality and actual headless model runs remain a separate gate (03-09).
const BIN = fileURLToPath(new URL('../bin/telos', import.meta.url));
const SKILL = readFileSync(new URL('../skills/map/SKILL.md', import.meta.url), 'utf8');
const DOMAINS = ['Auth', 'Board', 'Catalog', 'Account', 'Search', 'Help'];
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const read = (root, path) => readFileSync(join(root, path), 'utf8');
function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function files(root, prefix = '') {
  const rows = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (!prefix && entry.name === '.git') continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) rows.push(...files(root, path));
    else if (entry.isFile()) rows.push([path, readFileSync(join(root, path)).toString('base64')]);
  }
  return rows;
}
function snapshot(root) {
  return {
    files: files(root), head: git(root, 'rev-parse', 'HEAD'),
    // Compare staged content/modes, not the stat cache that read-only git status refreshes.
    index: git(root, 'ls-files', '--stage', '-z'),
    refs: git(root, 'for-each-ref', '--format=%(refname) %(objectname)'),
  };
}
function cli(root, ...args) {
  const readonly = args[0] === 'ctx' || args[0] === 'map-scan';
  const before = readonly ? snapshot(root) : null;
  const env = { ...process.env };
  // A spawned CLI is an ordinary program, not a child node:test reporter.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd: root, env, encoding: 'utf8', maxBuffer: 1 << 20 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `telos ${args.join(' ')}:\n${result.stdout}${result.stderr}`);
  assert.equal(result.stderr, '');
  assert.ok(result.stdout.endsWith('\n'));
  if (args[0] === 'ctx') assert.ok(result.stdout.length - 1 <= 6000, `context payload ${result.stdout.length - 1} > 6000`);
  if (args[0] === 'map-scan') assert.ok(result.stdout.length <= 8000, `scan stdout ${result.stdout.length} > 8000`);
  if (readonly) assert.deepEqual(snapshot(root), before, `telos ${args.join(' ')} mutated git or working files`);
  return result.stdout;
}
function commit(root, paths, message = 'fixture source change') {
  git(root, 'add', '--', ...paths);
  git(root, 'commit', '-qm', message);
}
function setup(t, fixture) {
  const root = mkdtempSync(join(tmpdir(), 'telos-e2e-map-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(new URL(`./fixtures/${fixture}/`, import.meta.url), root, { recursive: true });
  const python = fixture === 'python-uv';
  const extension = python ? 'py' : 'ts';
  const entry = python ? 'src/demo/__main__.py' : 'src/pages/index.astro';
  const paths = DOMAINS.map((name, i) => `src/${name.toLowerCase()}/${i === 1 ? 'game state' : 'module'}.${extension}`);
  const flow = `src/flow.${extension}`, find = `src/find.${extension}`;
  const source = (value) => python ? `value = ${value}\n# inert fixture, never executed\n` : `export const value = ${value};\n// inert fixture, never executed\n`;
  write(root, entry, python ? 'raise RuntimeError("fixture source must never run")\n' : '---\nconst title = "Fixture";\n---\n<h1>{title}</h1>\n');
  for (const [i, path] of paths.entries()) write(root, path, source(i + 1));
  write(root, flow, source(20));
  write(root, find, source(30));
  write(root, 'docs/guide.md', '# Navigation guide\n');
  write(root, 'README.md', '# Offline map fixture\n');
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  commit(root, files(root).map(([path]) => path), 'fixture baseline');
  return { root, entry, paths, flow, find, source, extension };
}
function eligibleCount(root) {
  // These fixtures contain text only; independently exclude their two lockfiles and Telos.
  return files(root).filter(([path]) => !path.startsWith('.telos/') && !['uv.lock', 'pnpm-lock.yaml'].includes(path)).length;
}
function headerFrom(bundle, root) {
  const header = /^Header to write: (.+)$/m.exec(bundle)?.[1];
  assert.ok(header, 'complete machine header is present');
  assert.match(header, new RegExp(`^<!-- telos-map: commit ${git(root, 'rev-parse', 'HEAD')} · \\d{4}-\\d{2}-\\d{2} · files ${eligibleCount(root)} -->$`));
  return header;
}
function area(fixture, i, description = 'known fixture location') {
  return `### ${DOMAINS[i]}\n- \`${fixture.paths[i]}:1-2\` — ${description}\n\n`;
}
function knownMap(fixture, header) {
  return `${header}\n# Map\n\n## Structure\n- \`docs/\` — guide\n\n## Entry points\n- \`${fixture.entry}:1-1\` — starts here\n\n## Flows\n- request → \`${fixture.flow}:1-2\`\n\n## Areas\n<!-- Each domain is independently editable. -->\n${DOMAINS.map((_, i) => area(fixture, i)).join('')}## Find\n- lookup → \`${fixture.find}:1-2\`\n`;
}
const body = (map) => map.slice(map.indexOf('\n') + 1);
const withHeader = (map, header) => `${header}\n${body(map)}`;
const projectLine = (bundle) => /^Project: .+$/m.exec(bundle)?.[0];
function assertPass(bundle, map, limit = 1500) {
  assert.match(bundle, new RegExp(`^Map validation: PASS ${Math.ceil(map.length / 4)}/${limit}$`, 'm'));
}

for (const fixtureName of ['astro-ts', 'python-uv']) {
  test(`${fixtureName}: offline init → scan → saved MAP → committed refresh through the CLI`, async (t) => {
    const fixture = setup(t, fixtureName);
    const { root, paths, source } = fixture;
    let map, project, authoredClassification;

    await t.test('init Next reaches the shipped skill/bundle; scan and full context expose real sources', () => {
      const initialized = cli(root, 'init', '--profile', 'minimal');
      assert.match(initialized, /Next: run \/telos:map to map the existing code/);
      assert.match(cli(root, 'status'), /^Next: run \/telos:map to map the existing code$/m);
      assert.match(SKILL, /^name: map$/m);
      assert.ok(SKILL.includes('!`telos ctx map`'));
      const stub = read(root, '.telos/MAP.md');
      assert.ok(stub.startsWith('<!-- telos-map: not built -->\n'));
      assert.match(stub, /Not built yet: run `\/telos:map`/);
      const scan = cli(root, 'map-scan');
      assert.match(scan, new RegExp(`^Files: ${eligibleCount(root)}$`, 'm'));
      assert.ok(scan.includes(fixture.entry));
      assert.match(scan, /^Suggestions:\n/m);
      assert.ok(scan.includes(`${fixture.entry}:1-`));
      assert.ok(Math.ceil(scan.length / 4) <= 2000);
      const bundle = cli(root, 'ctx', 'map');
      assert.match(bundle, /^Map validation: NOT BUILT$/m);
      assert.match(bundle, /^Mode: full$/m);
      assert.match(bundle, /^Map limit: 1500 /m);
      assert.ok(bundle.includes(fixture.entry));
      assert.match(bundle, /preserve: none/);
      if (fixtureName === 'astro-ts') assert.match(scan, /astro build/);
      else assert.match(scan, /uv run pytest/);
      assert.equal(read(root, '.telos/MAP.md'), stub);
      map = knownMap(fixture, headerFrom(bundle, root));
    });

    await t.test('known MAP and PROJECT draft validate; ctx do finds the matching MAP row', () => {
      write(root, '.telos/MAP.md', map);
      project = '# Offline fixture project\n\n## Purpose\nDraft for confirmation: navigate the demo sources.\n\n## Rules\n- none\n\n## Conventions\n- Modules live beside their domain source.\n\n## Out of scope\n- none\n';
      write(root, '.telos/PROJECT.md', project);
      const bundle = cli(root, 'ctx', 'map');
      assertPass(bundle, map);
      assert.deepEqual([...map.matchAll(/^## (.+)$/gm)].map((m) => m[1]), ['Structure', 'Entry points', 'Flows', 'Areas', 'Find']);
      assert.ok(map.startsWith(headerFrom(bundle, root)));
      assert.doesNotMatch(map, /Not built yet/);
      authoredClassification = projectLine(bundle);
      assert.match(authoredClassification, /draft: Rules, Out of scope · preserve: Purpose .*Conventions/);
      cli(root, 'roadmap', 'add', 'navigation', 'Use the authored MAP', 'A source location is found');
      cli(root, 'task', 'new', '01', 'locate-auth', 'Locate auth through MAP');
      const task = loadTask(root, '01-01');
      writeFileSync(task.path, setField(task.text, 'scope', [paths[0]]));
      cli(root, 'task', 'set', '01-01', 'status=approved');
      const context = cli(root, 'ctx', 'do', '01-01');
      assert.match(context, /^Task: 01-01 \[approved\]/m);
      const mapRows = context.split('Map:\n')[1];
      assert.ok(mapRows?.includes(`- \`${paths[0]}:1-2\` — known fixture location`));
      assert.equal(read(root, '.telos/PROJECT.md'), project);
    });

    await t.test('a small committed change selects one Area and preserves all unrelated bytes', () => {
      write(root, paths[0], source(101));
      commit(root, [paths[0]]);
      const bundle = cli(root, 'ctx', 'map', '--refresh');
      assertPass(bundle, map);
      assert.match(bundle, /^Mode: incremental$/m);
      assert.match(bundle, /^Impact: 1\/10 editable units · blocks: area:Auth$/m);
      assert.ok(bundle.includes(`Changed: M ${paths[0]}`));
      const oldArea = area(fixture, 0);
      assert.ok(bundle.includes(`--- block area:Auth (replace exactly this text)\n${oldArea}--- end area:Auth`));
      const mandatory = bundle.split('Affected blocks:\n')[1].split('Suggestions:')[0];
      assert.doesNotMatch(mandatory, /### Board|### Catalog/);
      const previous = map;
      const patched = map.replace(oldArea, area(fixture, 0, 'known fixture location after committed edit'));
      map = withHeader(patched, headerFrom(bundle, root));
      write(root, '.telos/MAP.md', map);
      for (let i = 1; i < DOMAINS.length; i++) assert.ok(map.includes(area(fixture, i)));
      assert.equal(body(map), body(previous).replace(oldArea, area(fixture, 0, 'known fixture location after committed edit')));
      const validated = cli(root, 'ctx', 'map', '--refresh');
      assertPass(validated, map);
      assert.match(validated, /^Mode: noop$/m);
      assert.equal(read(root, '.telos/PROJECT.md'), project);
    });

    await t.test('3/10 stays incremental, 4/10 rebuilds, and a missing baseline falls back to full', () => {
      for (let i = 0; i < 3; i++) write(root, paths[i], source(200 + i));
      commit(root, paths.slice(0, 3));
      const exact = cli(root, 'ctx', 'map', '--refresh');
      assert.match(exact, /^Mode: incremental$/m);
      assert.match(exact, /^Impact: 3\/10 editable units · blocks: area:Auth, area:Board, area:Catalog$/m);
      write(root, paths[3], source(204));
      commit(root, [paths[3]]);
      const above = cli(root, 'ctx', 'map', '--refresh');
      assert.match(above, /^Mode: full$/m);
      assert.match(above, /^Reason: refresh fallback: 4\/10 editable units affected: strictly more than 30%/m);
      map = withHeader(map, headerFrom(above, root));
      write(root, '.telos/MAP.md', map.replace(/^<!-- telos-map: commit [a-f0-9]+ /, `<!-- telos-map: commit ${'0'.repeat(40)} `));
      const missing = cli(root, 'ctx', 'map', '--refresh');
      assert.match(missing, /^Mode: full$/m);
      assert.match(missing, /^Reason: refresh fallback: MAP baseline commit is unavailable/m);
      write(root, '.telos/MAP.md', map);
    });

    await t.test('irrelevant commits change provenance only, and dirty sources refuse refresh', () => {
      write(root, 'README.md', '# Offline map fixture\nAn unrelated committed note.\n');
      commit(root, ['README.md']);
      const previousBody = body(map);
      const noop = cli(root, 'ctx', 'map', '--refresh');
      assert.match(noop, /^Mode: noop$/m);
      assert.match(noop, /^Impact: 0\/10 editable units · blocks: none$/m);
      assert.match(noop, /^Write: replace only line 1/m);
      map = withHeader(map, headerFrom(noop, root));
      write(root, '.telos/MAP.md', map);
      assert.equal(body(read(root, '.telos/MAP.md')), previousBody);
      assertPass(cli(root, 'ctx', 'map', '--refresh'), map);
      const savedSource = read(root, fixture.entry);
      write(root, fixture.entry, `${savedSource}\n# uncommitted fixture edit\n`);
      const dirty = cli(root, 'ctx', 'map', '--refresh');
      assert.match(dirty, /^REFUSED: uncommitted source changes/);
      assert.ok(dirty.includes(fixture.entry));
      write(root, fixture.entry, savedSource);
      assert.match(cli(root, 'ctx', 'map', '--refresh'), /^Mode: noop$/m);
    });

    await t.test('large inventory stays bounded; exact configured MAP budget passes, one extra unit fails, repair passes', () => {
      const added = [];
      for (let i = 0; i < 140; i++) {
        const path = `src/generated-inventory/${String(i).padStart(3, '0')}-${'navigation-'.repeat(4)}.${fixture.extension}`;
        added.push(path);
        write(root, path, source(i));
      }
      commit(root, added);
      const scan = cli(root, 'map-scan');
      assert.match(scan, /rows omitted/);
      const bundle = cli(root, 'ctx', 'map');
      assert.doesNotMatch(bundle, /…\[truncated by telos ctx\]/);
      map = withHeader(map, headerFrom(bundle, root));
      const open = '<!-- 😀界', close = ' -->\n';
      const limit = Math.ceil((map.length + open.length + close.length) / 4) + 4;
      map += `${open}${'x'.repeat(limit * 4 - map.length - open.length - close.length)}${close}`;
      assert.equal(map.length, limit * 4);
      const config = JSON.parse(read(root, '.telos/config.json'));
      config.limits.map_tokens = limit;
      write(root, '.telos/config.json', `${JSON.stringify(config, null, 2)}\n`);
      write(root, '.telos/MAP.md', map);
      const exact = cli(root, 'ctx', 'map');
      assertPass(exact, map, limit);
      assert.match(exact, new RegExp(`^Map limit: ${limit} `, 'm'));
      write(root, '.telos/MAP.md', `${map}\n`);
      const oversized = cli(root, 'ctx', 'map');
      assert.match(oversized, /^Map validation: FAIL .*token budget exceeded/m);
      assert.ok(oversized.includes(`${limit + 1} estimated tokens > limit ${limit}`));
      assert.equal(read(root, '.telos/MAP.md'), `${map}\n`);
      write(root, '.telos/MAP.md', map);
      assertPass(cli(root, 'ctx', 'map'), map, limit);
    });

    await t.test('reruns preserve PROJECT authorship and draftability without network, model or source execution', () => {
      const before = snapshot(root);
      const first = cli(root, 'ctx', 'map');
      assert.equal(projectLine(first), authoredClassification);
      cli(root, 'init', '--profile', 'minimal');
      const rerun = cli(root, 'ctx', 'map');
      assert.equal(projectLine(rerun), authoredClassification);
      assert.equal(read(root, '.telos/PROJECT.md'), project);
      assert.equal(read(root, '.telos/MAP.md'), map);
      assert.deepEqual(snapshot(root), before);
      assert.ok(existsSync(join(root, '.telos/config.json')));
    });
  });
}
