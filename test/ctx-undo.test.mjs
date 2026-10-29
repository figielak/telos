import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AdrError, readAdrs, revertAdr } from '../lib/adr.mjs';
import { main } from '../lib/cli.mjs';
import { requireMessage } from '../lib/config.mjs';
import { CAP } from '../lib/ctx/index.mjs';
import { taskCommits } from '../lib/git.mjs';
import { readHistory } from '../lib/history.mjs';
import { loadTask } from '../lib/tasks.mjs';
import { render } from '../lib/template.mjs';

const FIXTURE = fileURLToPath(new URL('fixtures/telos-phase/', import.meta.url));
const DEMO = '.telos/phases/01-demo';
const T1 = `${DEMO}/01-01-first-task.md`;
const T2 = `${DEMO}/01-02-second-task.md`;
const T3 = `${DEMO}/01-03-third-task.md`;
const STATUS = '.telos/STATUS.md';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
const write = (root, rel, text) => writeFileSync(join(root, rel), text);
const edit = (root, rel, from, to) => write(root, rel, read(root, rel).replace(from, to));
const head = (root) => git(root, 'rev-parse', 'HEAD').trim();

function commit(root, message, paths) {
  git(root, 'add', '--', ...paths);
  git(root, 'commit', '-q', '-m', message);
  return head(root);
}

/** Phase 01 with two 01-01 commits (both carrying STATUS/task metadata) around a 01-02 commit. */
function repo(t, { profile = 'standard' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-ctx-undo-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(FIXTURE, root, { recursive: true });
  rmSync(join(root, '.telos/phases/09-bad'), { recursive: true });
  const cfg = join(root, '.telos/config.json');
  writeFileSync(cfg, JSON.stringify({ ...JSON.parse(readFileSync(cfg, 'utf8')), profile, checks: { test: 'true' } }, null, 2));
  write(root, '.telos/HISTORY.md', render('HISTORY.md', { date: '2026-01-01', profile }));
  git(root, 'init', '-q');
  for (const [k, v] of [['user.email', 't@example.com'], ['user.name', 'T'], ['commit.gpgsign', 'false']]) git(root, 'config', k, v);
  git(root, 'add', '--', '.telos', 'src');
  git(root, 'commit', '-q', '-m', 'docs(telos): plan phase 01-demo');
  git(root, 'tag', 'telos/01-start');

  edit(root, 'src/a.ts', 'export function bye', 'export const a2 = 2;\n\nexport function bye');
  edit(root, T1, '## Result\n', '## Result\n- added a2\nDeviations: none\n');
  edit(root, STATUS, 'Next: run /telos:do', 'Next: /telos:do 01-02');
  const feat = commit(root, 'feat(01-01): add a2', ['src/a.ts', T1, STATUS]);

  write(root, 'src/b.ts', 'export const b = 1;\n');
  edit(root, T2, 'status: approved', 'status: done');
  edit(root, T2, '## Result\n', '## Result\n- added b\nDeviations: none\n');
  edit(root, STATUS, 'Task: 01-02', 'Task: 01-03');
  edit(root, STATUS, '## Recent\n', '## Recent\n- 01-02 done: added b\n');
  commit(root, 'feat(01-02): add b', ['src/b.ts', T2, STATUS]);

  write(root, 'src/c.ts', 'export const c = 3;\n');
  edit(root, STATUS, 'Next: /telos:do 01-02', 'Next: /telos:do 01-03');
  const fix = commit(root, 'fix(01-01): add c', ['src/c.ts', STATUS]);

  edit(root, T3, '## Goal\n', '## Goal\nKeep this planning note.\n');
  commit(root, 'docs(telos): refine 01-03', [T3]);
  return { root, feat, fix };
}

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

const state = (root) => ({ head: head(root), porcelain: git(root, 'status', '--porcelain'), status: read(root, STATUS),
  tasks: [T1, T2, T3].map((p) => read(root, p)) });

test('taskCommits finds all and only the scoped commits after the tag, newest first, with stats', (t) => {
  const { root, feat, fix } = repo(t);
  const { commits, reverts } = taskCommits(root, '01-01', 'telos/01-start');
  assert.deepEqual(commits.map((c) => c.hash), [fix, feat]);
  assert.deepEqual(commits.map((c) => c.subject), ['fix(01-01): add c', 'feat(01-01): add a2']);
  assert.ok(commits.every((c) => c.parents === 1));
  assert.ok(commits[0].stat.some((l) => l.startsWith('src/c.ts')));
  assert.match(commits[1].stat.at(-1), /3 files changed/);
  assert.deepEqual(reverts, []);
  assert.deepEqual(taskCommits(root, '01-1', 'telos/01-start').commits, []);
});

test('ctx undo previews exact hashes, stats, metadata paths and transitive dependents without mutating', async (t) => {
  const { root, feat, fix } = repo(t);
  const before = state(root);
  const r = await telos(root, 'ctx', 'undo', '01-01');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^Target: 01-01 \[done\] First task · phase 01-demo \[active\]$/m);
  assert.match(r.stdout, new RegExp(`^- ${fix} fix\\(01-01\\): add c$`, 'm'));
  assert.ok(r.stdout.indexOf(fix) < r.stdout.indexOf(feat));
  assert.match(r.stdout, /^ {2}src\/c\.ts +\| 1 \+$/m);
  assert.match(r.stdout, new RegExp(`^Revert order: ${fix} ${feat}$`, 'm'));
  assert.match(r.stdout, /^Telos files in these commits: \.telos\/STATUS\.md, \.telos\/phases\/01-demo\/01-01-first-task\.md$/m);
  assert.match(r.stdout, /^Dependents \(transitive, never reverted\): 01-02 \[done\], 01-03 \[draft\]$/m);
  assert.match(r.stdout, /^Block after undo: 01-02$/m);
  assert.match(r.stdout, /^Phase after undo: stays active$/m);
  assert.doesNotMatch(r.stdout, /ADR/);
  assert.ok(r.stdout.length <= CAP + 1);
  assert.deepEqual(state(root), before);
});

test('without an id the bundle lists candidates; a malformed id is a usage error; minimal is gated', async (t) => {
  const { root } = repo(t);
  const r = await telos(root, 'ctx', 'undo');
  assert.match(r.stdout, /^Target: none \(pass a task id\)$/m);
  assert.match(r.stdout, /^Candidates in 01: 01-01 \[done\], 01-02 \[done\]$/m);
  assert.equal((await telos(root, 'ctx', 'undo', '1-1')).code, 2);
  assert.equal((await telos(root, 'ctx', 'undo', '01-01', 'x')).code, 2);
  edit(root, '.telos/config.json', '"standard"', '"minimal"');
  assert.equal((await telos(root, 'ctx', 'undo', '01-01')).stdout, `${requireMessage('standard')}\n`);
});

test('dirty tree, missing tag, missing commits, merge commits and reverted tasks refuse without mutation', async (t) => {
  const { root } = repo(t);
  const refuse = async (id, re) => {
    const before = state(root);
    const r = await telos(root, 'ctx', 'undo', id);
    assert.match(r.stdout, re);
    assert.deepEqual(state(root), before);
  };
  write(root, 'src/dirty.ts', 'x\n');
  await refuse('01-01', /^REFUSED: uncommitted changes \(src\/dirty\.ts\); commit or discard them yourself, then rerun/);
  rmSync(join(root, 'src/dirty.ts'));
  await refuse('01-03', /^REFUSED: no commits of 01-03 after telos\/01-start/);
  await refuse('09-01', /^REFUSED: no task 09-01/);

  git(root, 'checkout', '-q', '-b', 'side', 'HEAD~1');
  write(root, 'src/side.ts', 's\n');
  commit(root, 'feat(01-02): side work', ['src/side.ts']);
  git(root, 'checkout', '-q', '-');
  git(root, 'merge', '-q', '--no-ff', '-m', 'feat(01-02): merge side', 'side');
  await refuse('01-02', /^REFUSED: [0-9a-f]{40} is a merge commit; revert it by hand \(git revert -m 1 [0-9a-f]{40}\)/);

  git(root, 'tag', '-d', 'telos/01-start');
  await refuse('01-01', /^REFUSED: tag telos\/01-start is missing/);
});

test('an existing revert(id) commit or a reverted status refuses a second undo', async (t) => {
  const { root } = repo(t);
  edit(root, T1, 'status: done', 'status: reverted');
  commit(root, 'revert(01-01): undo first task', [T1]);
  assert.match((await telos(root, 'ctx', 'undo', '01-01')).stdout, /^REFUSED: 01-01 is already reverted/);
  edit(root, T1, 'status: reverted', 'status: done');
  commit(root, 'docs(telos): restore status', [T1]);
  assert.match((await telos(root, 'ctx', 'undo', '01-01')).stdout, /^REFUSED: 01-01 was already reverted by [0-9a-f]{40}/);
});

/** The skill's confirmed flow: revert newest first, keep current Telos files, state via CLI. */
async function undo(root, id, hashes, telosPaths) {
  for (const hash of hashes) {
    const r = spawnSync('git', ['-C', root, 'revert', '--no-commit', hash], { encoding: 'utf8' });
    const conflicts = git(root, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    if (r.status !== 0 && conflicts.some((p) => !p.startsWith('.telos/'))) return { conflict: conflicts };
    if (conflicts.length) git(root, 'restore', '--source=HEAD', '--staged', '--worktree', '--', ...conflicts);
    if (existsSync(join(root, '.git/REVERT_HEAD'))) git(root, 'revert', '--quit');
  }
  git(root, 'restore', '--source=HEAD', '--staged', '--worktree', '--', ...telosPaths);
  for (const args of [
    ['task', 'set', id, 'status=reverted'],
    ['task', 'set', '01-02', 'status=blocked'],
    ['status', 'set', 'blockers=01-02: depends on reverted 01-01'],
    ['history', 'add', 'revert', id, `reverted ${id}: First task (2 commits)`],
  ]) assert.equal((await telos(root, ...args)).code, 0, args.join(' '));
  return { conflict: [] };
}

test('a confirmed undo reverts code, keeps unrelated Telos metadata and changes state only via the CLI', async (t) => {
  const { root, feat, fix } = repo(t);
  const statusBefore = read(root, STATUS);
  const t2Before = read(root, T2);
  const t3Before = read(root, T3);
  const result = await undo(root, '01-01', [fix, feat], [STATUS, T1]);
  assert.deepEqual(result.conflict, []);
  assert.ok(!existsSync(join(root, 'src/c.ts')));
  assert.doesNotMatch(read(root, 'src/a.ts'), /a2/);
  assert.equal(read(root, 'src/b.ts'), 'export const b = 1;\n');
  // Unrelated metadata stays; only the CLI changed state.
  assert.equal(read(root, T3), t3Before);
  assert.equal(read(root, T2).replace(/^status: \w+ +#/m, 'status: #'), t2Before.replace(/^status: \w+ +#/m, 'status: #'));
  assert.equal(loadTask(root, '01-02').meta.status, 'blocked');
  assert.match(read(root, T1), /^status: reverted/m);
  assert.match(read(root, T1), /- added a2/);
  assert.equal(read(root, STATUS), statusBefore.replace('Blockers: none', 'Blockers: 01-02: depends on reverted 01-01'));
  assert.equal(readHistory(root).log.filter((e) => e.kind === 'revert').length, 1);
  assert.equal(readHistory(root).log.filter((e) => e.kind === 'init').length, 1);
  assert.equal(loadTask(root, '01-03').meta.status, 'draft');

  // git revert already staged the code; only the CLI-changed Telos files are added explicitly.
  const staged = git(root, 'diff', '--cached', '--name-only').split('\n').filter(Boolean);
  assert.deepEqual(staged, ['src/a.ts', 'src/c.ts']);
  const files = git(root, 'diff', '--name-only').split('\n').filter(Boolean);
  assert.ok(files.every((f) => f.startsWith('.telos/')), files.join(' '));
  commit(root, 'revert(01-01): undo first task', files);
  assert.equal(git(root, 'status', '--porcelain'), '');
  const again = await telos(root, 'ctx', 'undo', '01-01');
  assert.match(again.stdout, /^REFUSED: 01-01 is already reverted/);
  assert.equal(readHistory(root).log.filter((e) => e.kind === 'revert').length, 1);
});

test('no confirmation means nothing changes; a code conflict stops without a revert history entry', async (t) => {
  const { root, feat, fix } = repo(t);
  const before = state(root);
  await telos(root, 'ctx', 'undo', '01-01');
  assert.deepEqual(state(root), before);

  write(root, 'src/a.ts', read(root, 'src/a.ts').replace('export const a2 = 2;', 'export const a2 = 22;'));
  commit(root, 'fix(quick): change a2', ['src/a.ts']);
  const r = spawnSync('git', ['-C', root, 'revert', '--no-commit', feat], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.ok(git(root, 'diff', '--name-only', '--diff-filter=U').includes('src/a.ts'));
  assert.equal(readHistory(root).log.filter((e) => e.kind === 'revert').length, 0);
  git(root, 'revert', '--abort');
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.ok(fix);
});

test('undoing a task of a closed phase says the phase reopens', async (t) => {
  const { root } = repo(t);
  edit(root, '.telos/ROADMAP.md', '01-demo [active]', '01-demo [done]');
  commit(root, 'docs(telos): close phase 01-demo', ['.telos/ROADMAP.md']);
  const r = await telos(root, 'ctx', 'undo', '01-01');
  assert.match(r.stdout, /^Phase after undo: reopen with `telos roadmap set 01 active`$/m);
});

// Deep: ADRs whose Source is one of the task's decisions (05-11, D-04).
function withAdrs(root) {
  edit(root, T1, 'decisions: []', 'decisions: [D-01, D-02, D-03]');
  edit(root, T2, 'decisions: []', 'decisions: [D-02]');
  mkdirSync(join(root, '.telos/decisions'));
  const adr = (file, title, status, source, supersedes = 'none') => write(root, `.telos/decisions/${file}`,
    `# ${file.slice(0, 3)} · ${title}\nDate: 2026-01-02 · Status: ${status} · Source: ${source}\nSupersedes: ${supersedes}\n\n## Context\nprose ${file}\n`);
  adr('001-old-store.md', 'Old store', 'superseded by 002', '00:D-09');
  adr('002-use-sqlite.md', 'Use SQLite', 'accepted', '01:D-01', '001');
  adr('003-shared-cache.md', 'Shared cache', 'accepted', '01:D-02');
  adr('004-dropped-idea.md', 'Dropped idea', 'reverted (2026-01-01, 01-09)', '01:D-03');
  commit(root, 'docs(telos): record adrs', [T1, T2, '.telos/decisions']);
}
const statuses = (root) => Object.fromEntries(readAdrs(root).map((a) => [a.number, a.status]));
const adrTexts = (root) => readAdrs(root).map((a) => readFileSync(a.path, 'utf8'));

test('deep undo preview lists unique candidates, shared sources needing selection and nonbinding ADRs', async (t) => {
  const { root } = repo(t, { profile: 'deep' });
  withAdrs(root);
  const before = { ...state(root), adrs: adrTexts(root) };
  const r = await telos(root, 'ctx', 'undo', '01-01');
  assert.equal(r.code, 0, r.stderr);
  const lines = [
    'ADRs linked to 01-01 decisions (D-01, D-02, D-03):',
    '- ADR 002 [accepted] 01:D-01 "Use SQLite" → revert on confirm: `telos adr revert 002 --task 01-01`',
    '- ADR 003 [accepted] 01:D-02 "Shared cache" · shared with 01-02 → only if explicitly selected: `telos adr revert 003 --task 01-01`',
    '- ADR 004 [reverted (2026-01-01, 01-09)] 01:D-03 "Dropped idea" → no change',
    '- Chain: ADR 002 supersedes 001; 001 stays superseded after undo (never reactivated), decide explicitly',
    'ADR selection: proposed 002 · explicit only 003',
  ];
  assert.ok(r.stdout.includes(lines.join('\n')), r.stdout);
  assert.ok(r.stdout.indexOf('Block after undo') < r.stdout.indexOf('ADRs linked'));
  assert.ok(r.stdout.length <= CAP + 1);
  assert.deepEqual({ ...state(root), adrs: adrTexts(root) }, before);
});

test('a deep task without linked ADRs says so; malformed ADR files refuse the preview', async (t) => {
  const { root } = repo(t, { profile: 'deep' });
  assert.match((await telos(root, 'ctx', 'undo', '01-01')).stdout, /^ADRs linked to 01-01: none$/m);
  withAdrs(root);
  write(root, '.telos/decisions/005-bad.md', '# 005 · Bad\nStatus: ?\n');
  commit(root, 'docs(telos): bad adr', ['.telos/decisions/005-bad.md']);
  assert.match((await telos(root, 'ctx', 'undo', '01-01')).stdout, /^REFUSED: 005-bad\.md: malformed ADR header.*; fix the ADR file, then rerun/m);
});

async function revertCode(root, hashes, telosPaths) {
  for (const hash of hashes) {
    const r = spawnSync('git', ['-C', root, 'revert', '--no-commit', hash], { encoding: 'utf8' });
    const conflicts = git(root, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    assert.ok(r.status === 0 || conflicts.every((c) => c.startsWith('.telos/')), r.stderr);
    if (conflicts.length) git(root, 'restore', '--source=HEAD', '--staged', '--worktree', '--', ...conflicts);
    if (existsSync(join(root, '.git/REVERT_HEAD'))) git(root, 'revert', '--quit');
  }
  git(root, 'restore', '--source=HEAD', '--staged', '--worktree', '--', ...telosPaths);
  assert.equal((await telos(root, 'check', '--level', 'full')).code, 0);
}

test('after a verified revert only the selected ADR becomes reverted; superseded predecessors stay', async (t) => {
  const { root, feat, fix } = repo(t, { profile: 'deep' });
  withAdrs(root);
  const texts = adrTexts(root);
  await revertCode(root, [fix, feat], [STATUS, T1]);
  const r = await telos(root, 'adr', 'revert', '002', '--task', '01-01');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^Chain: ADR 001 stays superseded by 002/m);
  assert.deepEqual(statuses(root), { '001': 'superseded by 002', '002': `reverted (${new Date().toISOString().slice(0, 10)}, 01-01)`,
    '003': 'accepted', '004': 'reverted (2026-01-01, 01-09)' });
  const after = adrTexts(root);
  assert.equal(after[1], texts[1].replace('Status: accepted', `Status: ${statuses(root)['002']}`));
  for (const i of [0, 2, 3]) assert.equal(after[i], texts[i]);
  assert.equal((await telos(root, 'task', 'set', '01-01', 'status=reverted')).code, 0);
});

test('an ADR write failure after the code revert stops before task or history success', async (t) => {
  const { root, feat, fix } = repo(t, { profile: 'deep' });
  withAdrs(root);
  const texts = adrTexts(root);
  await revertCode(root, [fix, feat], [STATUS, T1]);
  assert.throws(() => revertAdr(root, { number: '002', task: '01-01' }, { beforePublish() { throw new Error('EIO'); } }),
    (err) => err instanceof AdrError && /rerun `telos adr revert 002 --task 01-01`/.test(err.message));
  assert.deepEqual(adrTexts(root), texts);
  assert.equal(loadTask(root, '01-01').meta.status, 'done');
  assert.equal(readHistory(root).log.filter((e) => e.kind === 'revert').length, 0);
  assert.ok(!existsSync(join(root, 'src/c.ts')), 'the staged code revert stays for the retry');
});

test('a cancelled undo or a code conflict changes no ADR status', async (t) => {
  const { root, feat } = repo(t, { profile: 'deep' });
  withAdrs(root);
  const before = statuses(root);
  await telos(root, 'ctx', 'undo', '01-01');
  assert.deepEqual(statuses(root), before);
  write(root, 'src/a.ts', read(root, 'src/a.ts').replace('export const a2 = 2;', 'export const a2 = 22;'));
  commit(root, 'fix(quick): change a2', ['src/a.ts']);
  assert.notEqual(spawnSync('git', ['-C', root, 'revert', '--no-commit', feat]).status, 0);
  git(root, 'revert', '--abort');
  assert.deepEqual(statuses(root), before);
});
