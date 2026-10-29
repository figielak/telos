import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AdrError, createAdr, readAdrs, revertAdr } from '../lib/adr.mjs';
import { main } from '../lib/cli.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function put(root, path, text) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
}

function repo(t, { profile = 'deep' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-adr-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.git'));
  put(root, '.telos/config.json', JSON.stringify({ profile }));
  put(root, '.telos/STATUS.md', 'Phase: 02-store\nTask: none\nNext: none\nBlockers: none\nAwaiting user: 02:D-03\n');
  put(root, '.telos/phases/02-store/02-CONTEXT.md', [
    '# 02 · Store', '## Goal', 'Store data.', '## Decisions',
    '- D-01: use SQLite', '- D-02 [proposed]: maybe Postgres', '- D-03: awaited choice',
    '- D-04: WAL mode', '- D-05: move to Postgres', '',
  ].join('\n'));
  if (profile === 'deep') mkdirSync(join(root, '.telos/decisions'));
  return root;
}

const dir = (root) => join(root, '.telos/decisions');
const snapshot = (root) => existsSync(dir(root))
  ? Object.fromEntries(readdirSync(dir(root)).sort().map((f) => [f, readFileSync(join(dir(root), f), 'utf8')]))
  : null;
const read = (root, file) => readFileSync(join(dir(root), file), 'utf8');

async function adr(root, ...args) {
  let out = '', err = '';
  const code = await main(['adr', ...args], { cwd: root,
    stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } } });
  return { code, out, err };
}

const accepted = (n, title, source = '02:D-04') =>
  `# ${n} · ${title}\nDate: 2026-01-02 · Status: accepted · Source: ${source}\nSupersedes: none\n\n## Context\nolder prose\n`;

test('a confirmed source creates the next global ADR with a CLI-owned header from the template', async (t) => {
  const root = repo(t);
  const r = await adr(root, 'new', 'Use SQLite storage', '--source', '02:D-01');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^\.telos\/decisions\/001-use-sqlite-storage\.md · ADR 001 · created\n$/);
  const text = read(root, '001-use-sqlite-storage.md');
  const [title, meta, supersedes] = text.split('\n');
  assert.equal(title, '# 001 · Use SQLite storage');
  const m = /^Date: (\S+) · Status: accepted · Source: 02:D-01$/.exec(meta);
  assert.ok(m && DATE.test(m[1]), meta);
  assert.equal(supersedes, 'Supersedes: none');
  assert.match(text, /^## Context$/m);
  assert.match(text, /^Reverse by: /m);
  assert.ok(text.trimEnd().split('\n').length <= 30);
  assert.deepEqual(readAdrs(root).map(({ number, title: name, status, source, supersedes: s, file }) => ({ number, name, status, source, s, file })),
    [{ number: '001', name: 'Use SQLite storage', status: 'accepted', source: '02:D-01', s: null, file: '001-use-sqlite-storage.md' }]);
});

test('numbers are global and gaps are never reused', async (t) => {
  const root = repo(t);
  put(root, '.telos/decisions/005-older.md', accepted('005', 'Older'));
  const r = await adr(root, 'new', 'Use SQLite storage', '--source', '02:D-01');
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(dir(root), '006-use-sqlite-storage.md')));
  assert.deepEqual(readAdrs(root).map((a) => a.number), ['005', '006']);
});

test('supersession flips only the old status line and keeps its body bytes', async (t) => {
  const root = repo(t);
  assert.equal((await adr(root, 'new', 'Use SQLite', '--source', '02:D-01')).code, 0);
  const old = read(root, '001-use-sqlite.md').replace('## Context\n', '## Context\nWe needed embedded storage.\r\nTabs\tand ünïcode stay.\n');
  writeFileSync(join(dir(root), '001-use-sqlite.md'), old);
  const r = await adr(root, 'new', 'Move to Postgres', '--source', '02:D-05', '--supersedes', '001');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^\.telos\/decisions\/002-move-to-postgres\.md · ADR 002 · created · 001 superseded by 002\n$/);
  const flipped = read(root, '001-use-sqlite.md');
  assert.equal(flipped, old.replace(/^(Date: \S+ · )Status: accepted( · Source: 02:D-01)$/m, '$1Status: superseded by 002$2'));
  assert.notEqual(flipped, old);
  assert.equal(read(root, '002-move-to-postgres.md').split('\n')[2], 'Supersedes: 001');
  assert.deepEqual(readAdrs(root).map((a) => [a.number, a.status]), [['001', 'superseded by 002'], ['002', 'accepted']]);
});

test('unknown, proposed or awaited sources and non-accepted targets fail before any write', async (t) => {
  const root = repo(t);
  put(root, '.telos/decisions/001-gone.md', accepted('001', 'Gone').replace('Status: accepted', 'Status: superseded by 002'));
  put(root, '.telos/decisions/002-now.md', accepted('002', 'Now').replace('Supersedes: none', 'Supersedes: 001'));
  put(root, '.telos/decisions/003-undone.md', accepted('003', 'Undone', '02:D-05').replace('Status: accepted', 'Status: reverted (2026-01-03, 02-04)'));
  const before = snapshot(root);
  for (const [args, why] of [
    [['--source', '02:D-09'], /02:D-09.*not found/],
    [['--source', '07:D-01'], /07:D-01.*not found/],
    [['--source', '02:D-02'], /02:D-02.*proposed/],
    [['--source', '02:D-03'], /02:D-03.*awaits the user/],
    [['--source', '02:D-01', '--supersedes', '009'], /ADR 009.*not found/],
    [['--source', '02:D-01', '--supersedes', '001'], /ADR 001.*superseded by 002.*only accepted/],
    [['--source', '02:D-01', '--supersedes', '003'], /ADR 003.*reverted.*only accepted/],
  ]) {
    const r = await adr(root, 'new', 'Some title', ...args);
    assert.equal(r.code, 1, args.join(' '));
    assert.match(r.err, why, args.join(' '));
    assert.deepEqual(snapshot(root), before, args.join(' '));
  }
});

test('lower profiles get the deep gate', async (t) => {
  const root = repo(t, { profile: 'standard' });
  const r = await adr(root, 'new', 'Use SQLite', '--source', '02:D-01');
  assert.equal(r.code, 1);
  assert.equal(r.err, 'Requires deep profile. Switch with /telos:profile deep.\n');
  assert.equal(snapshot(root), null);
});

test('malformed titles, sources, numbers and options are usage errors with no write', async (t) => {
  const root = repo(t);
  for (const args of [
    ['new', 'Two\nlines', '--source', '02:D-01'], ['new', '', '--source', '02:D-01'], ['new', '!!!', '--source', '02:D-01'],
    ['new', 'Tab\there', '--source', '02:D-01'], ['new', 'x'.repeat(121), '--source', '02:D-01'],
    ['new', 'T', '--source', '2:D-1'], ['new', 'T', '--source', '02-D-01'], ['new', 'T', '--source', '02:D-01\n'],
    ['new', 'T', '--source', '02:D-01', '--supersedes', '1'], ['new', 'T', '--source', '02:D-01', '--supersedes', '../001'],
    ['new', 'T'], ['new', 'T', 'extra', '--source', '02:D-01'], ['new', 'T', '--source', '02:D-01', '--bogus'],
    ['new', 'T', '--source', '02:D-01', '--source', '02:D-04'], ['make', 'T', '--source', '02:D-01'], [],
  ]) {
    const r = await adr(root, ...args);
    assert.equal(r.code, 2, JSON.stringify(args));
    assert.deepEqual(snapshot(root), {}, JSON.stringify(args));
  }
  const r = await adr(root, 'new', '../../etc/passwd', '--source', '02:D-01');
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(Object.keys(snapshot(root)), ['001-etc-passwd.md']);
});

test('a held writer lock, symlinked destination or directory refuses with guidance and overwrites nothing', async (t) => {
  const root = repo(t);
  writeFileSync(join(dir(root), '.adr.lock'), 'pid 1\n');
  let r = await adr(root, 'new', 'Use SQLite', '--source', '02:D-01');
  assert.equal(r.code, 1);
  assert.match(r.err, /another ADR writer.*\.adr\.lock.*remove it/);
  assert.deepEqual(snapshot(root), { '.adr.lock': 'pid 1\n' });
  rmSync(join(dir(root), '.adr.lock'));

  const outside = join(root, 'outside.md');
  writeFileSync(outside, 'keep me\n');
  symlinkSync(outside, join(dir(root), '001-use-sqlite.md'));
  r = await adr(root, 'new', 'Use SQLite', '--source', '02:D-01');
  assert.equal(r.code, 1);
  assert.match(r.err, /001-use-sqlite\.md.*symlink/);
  assert.equal(readFileSync(outside, 'utf8'), 'keep me\n');
  rmSync(join(dir(root), '001-use-sqlite.md'));

  rmSync(dir(root), { recursive: true });
  mkdirSync(join(root, 'elsewhere'));
  symlinkSync(join(root, 'elsewhere'), dir(root));
  r = await adr(root, 'new', 'Use SQLite', '--source', '02:D-01');
  assert.equal(r.code, 1);
  assert.match(r.err, /decisions.*regular directory/);
  assert.deepEqual(readdirSync(join(root, 'elsewhere')), []);
});

test('an interrupted supersession keeps the old body, never reports success and finishes on the exact retry', async (t) => {
  const root = repo(t);
  assert.equal((await adr(root, 'new', 'Use SQLite', '--source', '02:D-01')).code, 0);
  const old = read(root, '001-use-sqlite.md').replace('## Context\n', '## Context\nOriginal reasoning.\n');
  writeFileSync(join(dir(root), '001-use-sqlite.md'), old);
  const options = { title: 'Move to Postgres', source: '02:D-05', supersedes: '001' };
  for (const step of ['afterJournal', 'afterCreate']) {
    assert.throws(() => createAdr(root, options, { [step]() { throw new Error('disk full'); } }),
      (err) => err instanceof AdrError && /interrupted.*disk full.*rerun the same command/.test(err.message));
    assert.equal(read(root, '001-use-sqlite.md'), old, step);
    assert.ok(existsSync(join(dir(root), '.adr-journal.json')), step);
    assert.ok(!existsSync(join(dir(root), '.adr.lock')), `${step}: lock released`);
  }
  const other = await adr(root, 'new', 'Something else', '--source', '02:D-04');
  assert.equal(other.code, 1);
  assert.match(other.err, /interrupted publication of ADR 002.*\.adr-journal\.json.*adr new "Move to Postgres" --source 02:D-05 --supersedes 001/);

  const r = await adr(root, 'new', 'Move to Postgres', '--source', '02:D-05', '--supersedes', '001');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /ADR 002 · completed · 001 superseded by 002/);
  assert.equal(read(root, '001-use-sqlite.md'), old.replace('Status: accepted', 'Status: superseded by 002'));
  assert.deepEqual(Object.keys(snapshot(root)), ['001-use-sqlite.md', '002-move-to-postgres.md']);
});

test('a journal whose files changed meanwhile refuses instead of overwriting evidence', async (t) => {
  const root = repo(t);
  assert.equal((await adr(root, 'new', 'Use SQLite', '--source', '02:D-01')).code, 0);
  const options = { title: 'Move to Postgres', source: '02:D-05', supersedes: '001' };
  assert.throws(() => createAdr(root, options, { afterCreate() { throw new Error('crash'); } }), AdrError);
  const edited = read(root, '001-use-sqlite.md').replace('## Context\n', '## Context\nhand edit\n');
  writeFileSync(join(dir(root), '001-use-sqlite.md'), edited);
  const r = await adr(root, 'new', 'Move to Postgres', '--source', '02:D-05', '--supersedes', '001');
  assert.equal(r.code, 1);
  assert.match(r.err, /001-use-sqlite\.md changed since the interrupted publication.*inspect/);
  assert.equal(read(root, '001-use-sqlite.md'), edited);
  assert.ok(existsSync(join(dir(root), '.adr-journal.json')));
});

test('an exact retry reuses the ADR; a conflicting duplicate refuses', async (t) => {
  const root = repo(t);
  assert.equal((await adr(root, 'new', 'Use SQLite', '--source', '02:D-01')).code, 0);
  assert.equal((await adr(root, 'new', 'Move to Postgres', '--source', '02:D-05', '--supersedes', '001')).code, 0);
  const before = snapshot(root);
  for (const args of [['Use SQLite', '--source', '02:D-01'], ['Move to Postgres', '--source', '02:D-05', '--supersedes', '001']]) {
    const r = await adr(root, 'new', ...args);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, / · reused\n$/);
    assert.deepEqual(snapshot(root), before);
  }
  for (const [args, why] of [
    [['Use SQLite differently', '--source', '02:D-01'], /02:D-01 already has ADR 001/],
    [['Use SQLite', '--source', '02:D-04'], /title "Use SQLite" already used by ADR 001/],
    [['Move to Postgres', '--source', '02:D-05'], /02:D-05 already has ADR 002/],
  ]) {
    const r = await adr(root, 'new', ...args);
    assert.equal(r.code, 1, args.join(' '));
    assert.match(r.err, why);
    assert.deepEqual(snapshot(root), before);
  }
});

test('a malformed ADR header fails closed for readers and writers', async (t) => {
  const root = repo(t);
  put(root, '.telos/decisions/001-bad.md', '# 001 · Bad\nStatus: maybe\n');
  assert.throws(() => readAdrs(root), (err) => err instanceof AdrError && /001-bad\.md.*header/.test(err.message));
  const r = await adr(root, 'new', 'Use SQLite', '--source', '02:D-01');
  assert.equal(r.code, 1);
  assert.match(r.err, /001-bad\.md.*header/);
});

// adr revert (05-11): a task undo marks only ADRs whose source is one of the task's decisions.
const task = (root, id, decisions, phase = '02-store') => put(root, `.telos/phases/${phase}/${id}-t.md`, [
  '---', `id: ${id}`, 'title: T', 'type: code', 'status: done', 'critical: false', 'effort: normal',
  'depends: []', `decisions: [${decisions.join(', ')}]`, 'scope: [src/]', '---', '## Goal', 'x', '',
].join('\n'));
const REVERTED = (id) => new RegExp(`^Date: \\S+ · Status: reverted \\((\\d{4}-\\d{2}-\\d{2}), ${id}\\) · Source: `, 'm');

test('adr revert marks a linked accepted ADR reverted, keeps the body and is idempotent', async (t) => {
  const root = repo(t);
  task(root, '02-03', ['D-01']);
  assert.equal((await adr(root, 'new', 'Use SQLite', '--source', '02:D-01')).code, 0);
  const before = read(root, '001-use-sqlite.md').replace('## Context\n', '## Context\nKeep this prose.\n');
  writeFileSync(join(dir(root), '001-use-sqlite.md'), before);
  const r = await adr(root, 'revert', '001', '--task', '02-03');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^\.telos\/decisions\/001-use-sqlite\.md · ADR 001 · reverted \(\d{4}-\d{2}-\d{2}, 02-03\)\n$/);
  const after = read(root, '001-use-sqlite.md');
  const date = REVERTED('02-03').exec(after)?.[1];
  assert.ok(DATE.test(date ?? ''), after);
  assert.equal(after, before.replace('Status: accepted', `Status: reverted (${date}, 02-03)`));
  const again = await adr(root, 'revert', '001', '--task', '02-03');
  assert.equal(again.code, 0, again.err);
  assert.match(again.out, / · unchanged\n$/);
  assert.equal(read(root, '001-use-sqlite.md'), after);
});

test('adr revert refuses unlinked tasks, unknown ids and malformed selectors without mutation', async (t) => {
  const root = repo(t);
  task(root, '02-03', ['D-01']);
  task(root, '02-04', ['D-04']);
  task(root, '03-01', ['D-01'], '03-other');
  assert.equal((await adr(root, 'new', 'Use SQLite', '--source', '02:D-01')).code, 0);
  const before = snapshot(root);
  for (const [args, why] of [
    [['001', '--task', '02-04'], /ADR 001 \(source 02:D-01\) is not a decision of task 02-04/],
    [['001', '--task', '03-01'], /ADR 001 \(source 02:D-01\) is not a decision of task 03-01/],
    [['001', '--task', '02-09'], /no task 02-09/],
    [['009', '--task', '02-03'], /ADR 009 not found/],
  ]) {
    const r = await adr(root, 'revert', ...args);
    assert.equal(r.code, 1, args.join(' '));
    assert.match(r.err, why);
    assert.deepEqual(snapshot(root), before);
  }
  for (const args of [['1', '--task', '02-03'], ['001', '--task', '2-3'], ['001'], ['001', '002', '--task', '02-03'],
    ['001', '--task', '02-03', '--task', '02-04'], ['001', '--task', '02-03', '--source', '02:D-01'], ['../001', '--task', '02-03']]) {
    const r = await adr(root, 'revert', ...args);
    assert.equal(r.code, 2, JSON.stringify(args));
    assert.deepEqual(snapshot(root), before);
  }
});

test('superseded or already reverted ADRs are never reactivated or overwritten; the chain is reported', async (t) => {
  const root = repo(t);
  task(root, '02-03', ['D-01']);
  task(root, '02-05', ['D-05']);
  task(root, '02-06', ['D-05']);
  assert.equal((await adr(root, 'new', 'Use SQLite', '--source', '02:D-01')).code, 0);
  assert.equal((await adr(root, 'new', 'Move to Postgres', '--source', '02:D-05', '--supersedes', '001')).code, 0);
  let before = snapshot(root);
  const superseded = await adr(root, 'revert', '001', '--task', '02-03');
  assert.equal(superseded.code, 1);
  assert.match(superseded.err, /ADR 001 is superseded by 002; not binding, nothing to revert/);
  assert.deepEqual(snapshot(root), before);

  const r = await adr(root, 'revert', '002', '--task', '02-05');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^Chain: ADR 001 stays superseded by 002 \(not reactivated\); no ADR binds 02:D-01 or 02:D-05 now, record an explicit follow-up decision$/m);
  assert.match(read(root, '001-use-sqlite.md'), /Status: superseded by 002/);
  before = snapshot(root);
  const other = await adr(root, 'revert', '002', '--task', '02-06');
  assert.equal(other.code, 1);
  assert.match(other.err, /ADR 002 is already reverted \(\S+, 02-05\)/);
  assert.deepEqual(snapshot(root), before);
});

test('a failed status write keeps the ADR, never reports success and the same command retries', async (t) => {
  const root = repo(t);
  task(root, '02-03', ['D-01']);
  assert.equal((await adr(root, 'new', 'Use SQLite', '--source', '02:D-01')).code, 0);
  const before = snapshot(root);
  assert.throws(() => revertAdr(root, { number: '001', task: '02-03' }, { beforePublish() { throw new Error('disk full'); } }),
    (err) => err instanceof AdrError && /ADR 001 status unchanged: disk full; rerun `telos adr revert 001 --task 02-03`/.test(err.message));
  assert.deepEqual(snapshot(root), before);
  writeFileSync(join(dir(root), '.adr.lock'), 'pid 1\n');
  const locked = await adr(root, 'revert', '001', '--task', '02-03');
  assert.equal(locked.code, 1);
  assert.match(locked.err, /another ADR writer/);
  rmSync(join(dir(root), '.adr.lock'));
  assert.equal((await adr(root, 'revert', '001', '--task', '02-03')).code, 0);
  assert.match(read(root, '001-use-sqlite.md'), REVERTED('02-03'));
});

test('adr revert is deep only', async (t) => {
  const root = repo(t, { profile: 'standard' });
  task(root, '02-03', ['D-01']);
  const r = await adr(root, 'revert', '001', '--task', '02-03');
  assert.equal(r.code, 1);
  assert.equal(r.err, 'Requires deep profile. Switch with /telos:profile deep.\n');
});
