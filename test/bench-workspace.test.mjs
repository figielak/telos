import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, chownSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setupKey } from '../bench/lib/matrix.mjs';
import { exportPlugin, grantSession, handBack, revokeSession, sessionEnv } from '../bench/lib/sandbox.mjs';
import { ensureSnapshot, prepareCopy, WorkspaceError } from '../bench/lib/workspace.mjs';
import { UsageError } from '../lib/errors.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const tryGit = (root, ...args) => { try { git(root, ...args); return true; } catch { return false; } };

function tmp(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function commitAll(root, subject) {
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', subject);
  return git(root, 'rev-parse', 'HEAD').trim();
}
function initRepo(root) {
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  git(root, 'config', 'commit.gpgsign', 'false');
}

/** Source repo: two starts, a later reference (solution) commit, a tag and a branch on it, plus side commits. */
function world(t) {
  const base = tmp(t, 'telos-bench-ws-');
  const src = join(base, 'src-repo');
  mkdirSync(src);
  initRepo(src);
  put(src, 'src/a.txt', 'zero\n');
  commitAll(src, 'c0');
  put(src, 'src/a.txt', 'one\n');
  symlinkSync('a.txt', join(src, 'src/inner-link'));
  const start1 = commitAll(src, 'start one');
  put(src, 'src/a.txt', 'two\n');
  const start2 = commitAll(src, 'start two');
  put(src, 'src/solution.txt', 'SECRET SOLUTION\n');
  const reference = commitAll(src, 'reference');
  git(src, 'tag', 'v-solution');
  git(src, 'branch', 'feature-solution');
  git(src, 'checkout', '-q', '-b', 'native', start1);
  put(src, 'docs/CLAUDE.md', 'native instructions\n');
  const nativeMd = commitAll(src, 'native claude md');
  git(src, 'checkout', '-q', '-b', 'native-dir', start1);
  put(src, '.claude/settings.json', '{}\n');
  const nativeDir = commitAll(src, 'native claude dir');
  git(src, 'checkout', '-q', '-b', 'escape', start1);
  symlinkSync('/etc/passwd', join(src, 'src/escape'));
  const escape = commitAll(src, 'escaping symlink');
  git(src, 'checkout', '-q', 'main');

  const corpus = join(base, 'corpus');
  put(corpus, `r1/${start1}/CLAUDE.md`, '# B for start one\nRun the tests.\n');
  put(corpus, 'acceptance/t.mjs', '// hidden\n');
  const task = (id, start, extra = {}) => ({ id, repo: 'r1', start, reference, type: 'single', prompt: 'p',
    expectedPaths: ['src/'], acceptance: 'acceptance/t.mjs', b: `r1/${start}/CLAUDE.md`, ...extra });
  const manifest = {
    dir: corpus,
    repos: [{ id: 'r1', url: src }],
    repetitions: 5,
    tasks: [task('t1', start1), task('t2', start2), task('leak', reference, { reference: start2 }),
      task('native-md', nativeMd), task('native-dir', nativeDir), task('escape', escape)],
  };
  const workDir = join(base, 'work');
  return { base, src, corpus, manifest, workDir, start1, start2, reference };
}

const cell = (task, variant, start, rep = 1) => ({ id: `${task}.${variant}.${rep}`, task, repo: 'r1', variant, rep,
  setup: variant === 'C' ? setupKey('r1', start, 'deep') : variant === 'D' ? setupKey('r1', start, 'standard') : null });

/** A small Telos-like plugin checkout with runtime, non-runtime and untracked files. */
function plugin(t) {
  const dir = tmp(t, 'telos-bench-plugin-');
  initRepo(dir);
  put(dir, '.claude-plugin/plugin.json', '{"name":"telos"}\n');
  put(dir, 'skills/map/SKILL.md', 'map v1\n');
  put(dir, 'skills/do/SKILL.md', 'do\n');
  put(dir, 'shared/map.md', 'shared map\n');
  put(dir, 'lib/cli.mjs', 'export {};\n');
  put(dir, 'bin/telos', '#!/usr/bin/env node\n');
  chmodSync(join(dir, 'bin/telos'), 0o755);
  put(dir, 'hooks/hooks.json', '{}\n');
  put(dir, 'agents/reviewer.md', 'agent\n');
  put(dir, 'templates/task.md', 'tpl\n');
  put(dir, 'bench/corpus/acceptance/secret.mjs', 'SECRET\n');
  put(dir, 'test/x.test.mjs', 'test\n');
  put(dir, '.telos/STATUS.md', 'status\n');
  put(dir, 'README.md', 'readme\n');
  commitAll(dir, 'plugin');
  put(dir, 'skills/untracked.md', 'stray\n');
  return dir;
}

/** Stub setup build: what init + map would leave behind, with a per-build marker. */
function stubBuild(calls) {
  return ({ key, profile, dir }) => {
    calls.push(key);
    put(dir, '.telos/config.json', `${JSON.stringify({ version: 1, profile })}\n`);
    put(dir, '.telos/MAP.md', `# Map for ${key}\n`);
    put(dir, `.telos/build-${calls.length}`, 'marker\n');
    put(dir, 'CLAUDE.md', '<!-- telos:start -->\nTelos block\n<!-- telos:end -->\n');
  };
}

test('the copy is at start with no later history, refs, tags or remote', (t) => {
  const w = world(t);
  const out = prepareCopy(cell('t1', 'A', w.start1), w.manifest, { workDir: w.workDir });
  assert.equal(out.start, w.start1);
  assert.equal(out.refsChecked, true);
  assert.equal(git(out.dir, 'rev-parse', 'HEAD').trim(), w.start1);
  assert.equal(git(out.dir, 'status', '--porcelain').trim(), '');
  assert.equal(tryGit(out.dir, 'cat-file', '-e', w.reference), false);
  assert.equal(tryGit(out.dir, 'cat-file', '-e', w.start2), false);
  const all = git(out.dir, 'log', '--all', '--reflog', '--format=%H').split('\n');
  assert.ok(!all.includes(w.reference) && !all.includes(w.start2));
  assert.equal(git(out.dir, 'remote').trim(), '');
  assert.deepEqual(git(out.dir, 'for-each-ref', '--format=%(refname)').trim().split('\n'), ['refs/heads/bench']);
  assert.equal(git(out.dir, 'tag').trim(), '');
  assert.ok(!existsSync(join(out.dir, 'src/solution.txt')));
  assert.equal(readFileSync(join(w.src, 'src/a.txt'), 'utf8'), 'two\n', 'source work tree untouched');
  assert.ok(git(w.src, 'tag').includes('v-solution'), 'source refs untouched');
});

test('a reachable reference commit is refused as a solution leak', (t) => {
  const w = world(t);
  assert.throws(() => prepareCopy(cell('leak', 'A', w.reference), w.manifest, { workDir: w.workDir }), /REFUSED:.*reference.*reachable/);
});

test('repo-native CLAUDE.md or .claude/ at start is refused', (t) => {
  const w = world(t);
  assert.throws(() => prepareCopy(cell('native-md', 'A', null), w.manifest, { workDir: w.workDir }), /REFUSED:.*docs\/CLAUDE\.md/);
  assert.throws(() => prepareCopy(cell('native-dir', 'A', null), w.manifest, { workDir: w.workDir }), /REFUSED:.*\.claude/);
});

test('A has no CLAUDE.md, B has exactly its (repo, start) file, C/D get .telos from their own key', (t) => {
  const w = world(t);
  const telosDir = plugin(t);
  const a = prepareCopy(cell('t1', 'A', w.start1), w.manifest, { workDir: w.workDir });
  assert.ok(!existsSync(join(a.dir, 'CLAUDE.md')) && !existsSync(join(a.dir, '.telos')));
  const b = prepareCopy(cell('t1', 'B', w.start1), w.manifest, { workDir: w.workDir });
  assert.equal(readFileSync(join(b.dir, 'CLAUDE.md'), 'utf8'), readFileSync(join(w.corpus, `r1/${w.start1}/CLAUDE.md`), 'utf8'));
  assert.ok(!existsSync(join(b.dir, '.telos')));
  const calls = [];
  const build = stubBuild(calls);
  for (const [variant, profile] of [['C', 'deep'], ['D', 'standard']]) {
    const c = cell('t1', variant, w.start1);
    const snap = ensureSnapshot(c.setup, { workDir: w.workDir, telosDir, build });
    const copy = prepareCopy(c, w.manifest, { workDir: w.workDir, snapshot: snap.dir });
    assert.equal(JSON.parse(readFileSync(join(copy.dir, '.telos/config.json'), 'utf8')).profile, profile);
    assert.match(readFileSync(join(copy.dir, '.telos/MAP.md'), 'utf8'), new RegExp(c.setup.replaceAll('.', '\\.')));
  }
  const deep = ensureSnapshot(setupKey('r1', w.start1, 'deep'), { workDir: w.workDir, telosDir, build });
  assert.throws(() => prepareCopy(cell('t1', 'D', w.start1), w.manifest, { workDir: w.workDir, snapshot: deep.dir }), /REFUSED:.*snapshot/);
  assert.throws(() => prepareCopy(cell('t1', 'C', w.start1), w.manifest, { workDir: w.workDir }), /REFUSED:.*snapshot/);
  for (const [i, [path, why]] of [['src/a.txt', /overwrite tracked src\/a\.txt/], ['.git/HEAD', /contains \.git/]].entries()) {
    const key = setupKey('r1', w.start1, 'deep');
    const bad = ensureSnapshot(key, { workDir: join(w.base, `work-bad-${i}`), telosDir, build: (ctx) => { stubBuild([])(ctx); put(ctx.dir, path, 'x\n'); } });
    assert.throws(() => prepareCopy(cell('t1', 'C', w.start1), w.manifest, { workDir: w.workDir, snapshot: bad.dir }), why);
  }
});

test('snapshots: one per (repo, start, profile); reused when current; Telos change or stale hash rebuilds and removes the old one', (t) => {
  const w = world(t);
  const telosDir = plugin(t);
  const calls = [];
  const build = stubBuild(calls);
  const opts = { workDir: w.workDir, telosDir, build };
  const keys = [setupKey('r1', w.start1, 'deep'), setupKey('r1', w.start2, 'deep'),
    setupKey('r1', w.start1, 'standard'), setupKey('r1', w.start2, 'standard')];
  const snaps = keys.map((k) => ensureSnapshot(k, opts));
  assert.equal(new Set(snaps.map((s) => s.dir)).size, 4);
  assert.equal(new Set(snaps.map((s) => s.hash)).size, 4, 'hash covers start and profile');
  assert.ok(snaps.every((s) => s.rebuilt));
  assert.equal(calls.length, 4);
  const again = ensureSnapshot(keys[0], opts);
  assert.equal(again.rebuilt, false);
  assert.equal(again.hash, snaps[0].hash);
  assert.equal(calls.length, 4);
  put(telosDir, 'skills/do/SKILL.md', 'do v2\n');
  commitAll(telosDir, 'telos change');
  const afterCommit = ensureSnapshot(keys[0], opts);
  assert.equal(afterCommit.rebuilt, true);
  assert.notEqual(afterCommit.hash, snaps[0].hash);
  assert.ok(!existsSync(join(afterCommit.dir, '.telos/build-1')), 'old snapshot removed');
  put(telosDir, 'skills/map/SKILL.md', 'map v2 uncommitted\n');
  assert.equal(ensureSnapshot(keys[0], opts).rebuilt, true, 'map skill content is part of the hash');
  const meta = join(afterCommit.dir, '..', `${keys[0]}.json`);
  writeFileSync(meta, JSON.stringify({ ...JSON.parse(readFileSync(meta, 'utf8')), hash: 'stale' }));
  assert.equal(ensureSnapshot(keys[0], opts).rebuilt, true);
  assert.throws(() => ensureSnapshot('r1.nothex.deep', opts), UsageError);
  assert.throws(() => ensureSnapshot(setupKey('r1', w.start1, 'minimal'), opts), UsageError);
});

test('a failing setup build leaves no snapshot behind', (t) => {
  const w = world(t);
  const telosDir = plugin(t);
  const key = setupKey('r1', w.start1, 'deep');
  assert.throws(() => ensureSnapshot(key, { workDir: w.workDir, telosDir, build: () => { throw new Error('map failed'); } }), /map failed/);
  const calls = [];
  assert.equal(ensureSnapshot(key, { workDir: w.workDir, telosDir, build: stubBuild(calls) }).rebuilt, true);
  assert.equal(calls.length, 1);
});

test('plugin export holds only tracked runtime paths, never bench/, test/ or .telos/', (t) => {
  const telosDir = plugin(t);
  const out = join(tmp(t, 'telos-bench-export-'), 'plugin');
  const paths = exportPlugin(telosDir, out);
  assert.ok(paths.includes('skills/map/SKILL.md') && paths.includes('bin/telos') && paths.includes('.claude-plugin/plugin.json'));
  for (const p of paths) assert.doesNotMatch(p, /^(bench|test|\.telos)\/|README|untracked/);
  assert.ok(!existsSync(join(out, 'bench')) && !existsSync(join(out, 'test')) && !existsSync(join(out, '.telos')));
  assert.ok(statSync(join(out, 'bin/telos')).mode & 0o100, 'bin stays executable');
  const real = exportPlugin(repoRoot, join(tmp(t, 'telos-bench-export-'), 'plugin'));
  assert.ok(real.length > 10 && real.some((p) => p.startsWith('skills/')));
  for (const p of real) assert.doesNotMatch(p, /^(bench|test|\.telos)\//);
});

test('symlinks escaping the copy or the plugin export are refused; inner links are kept', (t) => {
  const w = world(t);
  const ok = prepareCopy(cell('t1', 'A', w.start1), w.manifest, { workDir: w.workDir });
  assert.ok(existsSync(join(ok.dir, 'src/inner-link')));
  assert.throws(() => prepareCopy(cell('escape', 'A', null), w.manifest, { workDir: w.workDir }), /REFUSED:.*symlink.*src\/escape/);
  const telosDir = plugin(t);
  symlinkSync('/etc/passwd', join(telosDir, 'lib/escape'));
  commitAll(telosDir, 'escape');
  assert.throws(() => exportPlugin(telosDir, join(tmp(t, 'telos-bench-export-'), 'plugin')), /REFUSED:.*symlink.*lib\/escape/);
});

test('a B cell whose (repo, start) has no B file is refused', (t) => {
  const w = world(t);
  assert.throws(() => prepareCopy(cell('t2', 'B', w.start2), w.manifest, { workDir: w.workDir }), /REFUSED:.*B file.*r1\/[a-f0-9]{40}\/CLAUDE\.md/);
  const other = { ...w.manifest, tasks: w.manifest.tasks.map((x) => x.id === 't1' ? { ...x, b: 'elsewhere/CLAUDE.md' } : x) };
  assert.throws(() => prepareCopy(cell('t1', 'B', w.start1), other, { workDir: w.workDir }), /REFUSED:.*B file/);
});

test('per-run config dir is fresh, holds only settings and credentials, and disables memory, web tools and open network', (t) => {
  const w = world(t);
  const creds = join(w.base, 'creds.json');
  writeFileSync(creds, '{"token":"x"}\n');
  const configTemplate = { credentials: creds, settings: { permissions: { allow: ['Bash(npm test)'], deny: ['Bash(rm -rf *)'] } } };
  const stale = join(w.workDir, 'config', 't1.A.1');
  mkdirSync(stale, { recursive: true });
  writeFileSync(join(stale, 'CLAUDE.md'), 'planted memory canary\n');
  process.env.TELOS_BENCH_CANARY_SECRET = 'leak';
  t.after(() => { delete process.env.TELOS_BENCH_CANARY_SECRET; });
  const a = sessionEnv(cell('t1', 'A', w.start1), { configTemplate, workDir: w.workDir });
  const dir = a.env.CLAUDE_CONFIG_DIR;
  assert.deepEqual(readdirSync(dir).sort(), ['.credentials.json', 'settings.json']);
  assert.equal(a.settingsPath, join(dir, 'settings.json'));
  const s = JSON.parse(readFileSync(a.settingsPath, 'utf8'));
  assert.equal(s.autoMemoryEnabled, false);
  assert.equal(a.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
  assert.equal(a.env.HOME, dir);
  const copy = join(w.workDir, 'copies', 't1.A.1');
  // git refuses a repo owned by the host for the benchmark user; tool caches must live where the sandbox lets it write
  assert.deepEqual([a.env.GIT_CONFIG_COUNT, a.env.GIT_CONFIG_KEY_0, a.env.GIT_CONFIG_VALUE_0], ['1', 'safe.directory', copy]);
  assert.equal(a.env.GOCACHE, join(copy, '.git', 'bench-home', 'go-build'));
  assert.equal(a.env.XDG_CACHE_HOME, join(copy, '.git', 'bench-home', 'cache'));
  assert.equal(a.env.GOTOOLCHAIN, 'local');
  assert.equal(s.sandbox.enabled, true);
  assert.equal(s.sandbox.allowUnsandboxedCommands, false);
  assert.deepEqual(s.sandbox.network.allowedDomains, ['api.anthropic.com']);
  assert.ok(s.permissions.deny.includes('WebFetch') && s.permissions.deny.includes('WebSearch') && s.permissions.deny.includes('Bash(rm -rf *)'));
  assert.deepEqual(s.permissions.allow, ['Bash(npm test)']);
  assert.equal(a.env.TELOS_BENCH_CANARY_SECRET, undefined, 'host environment is not inherited');
  assert.deepEqual(a.readable, [join(w.workDir, 'copies', 't1.A.1'), dir]);
  const c = sessionEnv(cell('t1', 'C', w.start1), { configTemplate, workDir: w.workDir });
  assert.deepEqual(c.readable, [join(w.workDir, 'copies', 't1.C.1'), join(w.workDir, 'plugin'), c.env.CLAUDE_CONFIG_DIR]);
  for (const p of [...a.readable, ...c.readable]) {
    assert.ok(!p.startsWith(w.corpus) && !p.startsWith(repoRoot), p);
  }
  const bare = sessionEnv(cell('t1', 'A', w.start1), { configTemplate: {}, workDir: w.workDir });
  assert.deepEqual(readdirSync(bare.env.CLAUDE_CONFIG_DIR), ['settings.json']);
});

test('session access: only the running cell is group-writable, its parents are readable (bwrap mounts), revoke closes it', (t) => {
  const w = world(t);
  const mode = (p) => statSync(p).mode & 0o7777;
  const a = prepareCopy(cell('t1', 'A', w.start1), w.manifest, { workDir: w.workDir }).dir;
  const other = prepareCopy(cell('t2', 'A', w.start2), w.manifest, { workDir: w.workDir }).dir;
  const env = sessionEnv(cell('t1', 'A', w.start1), { configTemplate: {}, workDir: w.workDir });
  const config = env.env.CLAUDE_CONFIG_DIR;
  grantSession([a, config], { workDir: w.workDir });
  for (const dir of [a, config, join(a, '.git')]) assert.equal(mode(dir) & 0o070, 0o070, `${dir} group rwx`);
  for (const file of [join(a, 'src', 'a.txt'), join(config, 'settings.json')]) assert.equal(mode(file) & 0o060, 0o060, `${file} group rw`);
  for (const dir of [w.workDir, join(w.workDir, 'copies'), join(w.workDir, 'config')]) {
    assert.equal(mode(dir) & 0o077, 0o050, `${dir} group read and traverse only (bwrap reads every parent of a mount), closed to others`);
  }
  assert.equal(mode(other) & 0o077, 0, 'another cell stays closed');
  revokeSession([a, config]);
  for (const dir of [a, config]) assert.equal(mode(dir) & 0o077, 0, `${dir} closed after the cell`);
  assert.throws(() => grantSession([join(w.base, 'elsewhere')], { workDir: w.workDir }), UsageError);
});

test('a granted copy belongs to the work dir group throughout, even when checked out under another group', (t) => {
  const group = process.getgroups().find((g) => g !== process.getgid());
  if (group === undefined) return t.skip('needs a supplementary group');
  const w = world(t);
  mkdirSync(w.workDir, { recursive: true });
  chownSync(w.workDir, process.getuid(), group);
  chmodSync(w.workDir, 0o2710);
  const a = prepareCopy(cell('t1', 'A', w.start1), w.manifest, { workDir: w.workDir }).dir;
  grantSession([a], { workDir: w.workDir });
  const wrong = [];
  const walk = (p) => {
    const st = lstatSync(p);
    if (st.gid !== group) wrong.push(p);
    if (st.isDirectory()) for (const name of readdirSync(p)) walk(join(p, name));
  };
  walk(a);
  assert.deepEqual(wrong.slice(0, 5), [], 'every path of the copy is in the benchmark group');
});

test('the plugin export is closed until a C/D session opens it read-only; snapshots stay closed', async (t) => {
  const w = world(t);
  const mode = (p) => statSync(p).mode & 0o7777;
  const out = join(w.workDir, 'plugin');
  exportPlugin(plugin(t), out);
  assert.equal(mode(out) & 0o077, 0, 'export closed to the group after export');
  await ensureSnapshot(setupKey('r1', w.start1, 'deep'), { workDir: w.workDir, telosDir: plugin(t), build: stubBuild([]) });
  assert.equal(mode(join(w.workDir, 'snapshots')) & 0o077, 0, 'snapshots closed to every session');
  const c = prepareCopy(cell('t1', 'A', w.start1), w.manifest, { workDir: w.workDir }).dir;
  grantSession([c], { workDir: w.workDir, readOnly: [out] });
  for (const dir of [out, join(out, 'skills', 'map')]) assert.equal(mode(dir) & 0o070, 0o050, `${dir} group r-x, not writable`);
  assert.equal(mode(join(out, 'skills', 'map', 'SKILL.md')) & 0o070, 0o040, 'file group read-only');
  assert.equal(mode(join(out, 'bin', 'telos')) & 0o070, 0o050, 'executable stays executable, read-only');
  revokeSession([c, out]);
  assert.equal(mode(out) & 0o077, 0, 'export closed again after the cell');
});

test('instruction files above a session path are refused, never loaded (canary, PROTOCOL §5.2)', (t) => {
  for (const planted of ['copies/CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md']) {
    const w = world(t);
    const a = prepareCopy(cell('t1', 'A', w.start1), w.manifest, { workDir: w.workDir }).dir;
    put(w.workDir, planted, 'CANARY\n');
    assert.throws(() => grantSession([a], { workDir: w.workDir }), (err) => err instanceof WorkspaceError
      && /REFUSED:.*instruction/.test(err.message) && err.message.includes(join(w.workDir, planted.split('/')[0] === 'copies' ? planted : planted.split('/')[0])), planted);
  }
});

test('handBack opens what the session user wrote with private modes to the group, symlink targets untouched', (t) => {
  const w = world(t);
  const mode = (p) => statSync(p).mode & 0o7777;
  const a = prepareCopy(cell('t1', 'A', w.start1), w.manifest, { workDir: w.workDir }).dir;
  grantSession([a], { workDir: w.workDir });
  put(a, 'projects/s/t.jsonl', '{}\n');
  chmodSync(join(a, 'projects/s/t.jsonl'), 0o600);
  chmodSync(join(a, 'projects/s'), 0o700);
  const outside = join(w.base, 'outside.txt');
  writeFileSync(outside, 'x');
  chmodSync(outside, 0o600);
  symlinkSync(outside, join(a, 'link'));
  // the runner's cwd is closed to the benchmark user; find must not depend on it
  const closed = join(w.base, 'closed-cwd');
  mkdirSync(closed);
  const cwd = process.cwd();
  process.chdir(closed);
  chmodSync(closed, 0);
  let status;
  try { status = handBack([a], ['env']); } finally { chmodSync(closed, 0o700); process.chdir(cwd); }
  assert.equal(status, 0);
  assert.equal(mode(join(a, 'projects/s')) & 0o070, 0o070, 'private dir group rwx');
  assert.equal(mode(join(a, 'projects/s/t.jsonl')) & 0o070, 0o060, 'private file group rw');
  assert.equal(mode(outside), 0o600, 'a symlink target outside is never changed');
});

test('a work dir inside this repository or a source repository is a usage error (exit 2)', (t) => {
  const w = world(t);
  const telosDir = plugin(t);
  const inside = join(repoRoot, 'bench', '.work-should-not-exist');
  const c = cell('t1', 'A', w.start1);
  assert.throws(() => prepareCopy(c, w.manifest, { workDir: inside }), UsageError);
  assert.throws(() => prepareCopy(c, w.manifest, { workDir: repoRoot }), UsageError);
  assert.throws(() => prepareCopy(c, w.manifest, { workDir: w.src }), UsageError);
  assert.throws(() => prepareCopy(c, w.manifest, { workDir: join(w.src, 'work') }), UsageError);
  assert.throws(() => ensureSnapshot(setupKey('r1', w.start1, 'deep'), { workDir: inside, telosDir, build: () => {} }), UsageError);
  assert.throws(() => sessionEnv(c, { configTemplate: {}, workDir: inside }), UsageError);
  assert.throws(() => exportPlugin(telosDir, join(telosDir, 'out')), UsageError);
  assert.throws(() => exportPlugin(telosDir, dirname(telosDir)), UsageError, 'export dir containing the source');
  assert.throws(() => exportPlugin(repoRoot, dirname(repoRoot)), UsageError, 'export dir containing the checkout');
  assert.throws(() => prepareCopy(c, w.manifest, { workDir: dirname(repoRoot) }), UsageError, 'work dir containing the checkout');
  assert.ok(existsSync(telosDir) && existsSync(join(repoRoot, 'package.json')));
  assert.ok(!existsSync(inside));
});
