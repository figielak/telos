import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadManifest } from '../bench/lib/manifest.mjs';
import { expandMatrix } from '../bench/lib/matrix.mjs';
import { UsageError } from '../lib/errors.mjs';

const fixture = fileURLToPath(new URL('fixtures/bench/', import.meta.url));

function copy(t) {
  const dir = mkdtempSync(join(tmpdir(), 'telos-bench-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(fixture, dir, { recursive: true });
  return dir;
}
function mutate(t, edit) {
  const dir = copy(t);
  const file = join(dir, 'manifest.json');
  const json = JSON.parse(readFileSync(file, 'utf8'));
  edit(json);
  writeFileSync(file, JSON.stringify(json));
  return dir;
}
const bad = (t, edit, pattern) => {
  const dir = mutate(t, edit);
  assert.throws(() => loadManifest(dir), (err) => err instanceof UsageError && pattern.test(err.message), String(pattern));
};

test('a valid fixture manifest loads with 40-hex commits and complete task fields', () => {
  const m = loadManifest(fixture);
  assert.equal(m.repetitions, 5);
  assert.deepEqual(m.repos.map((r) => r.id), ['r1', 'r2']);
  assert.equal(m.tasks.length, 4);
  for (const task of m.tasks) {
    assert.match(task.start, /^[a-f0-9]{40}$/);
    assert.match(task.reference, /^[a-f0-9]{40}$/);
    for (const field of ['repo', 'type', 'expectedPaths', 'acceptance', 'b']) assert.ok(task[field], field);
  }
  assert.equal(m.tasks.find((x) => x.id === 't-multi').type, 'multi');
});

test('invalid manifests fail with the file and field named', (t) => {
  bad(t, (j) => { delete j.tasks[0].repo; }, /manifest\.json: tasks\[0\]\.repo/);
  bad(t, (j) => { delete j.tasks[1].expectedPaths; }, /tasks\[1\]\.expectedPaths/);
  bad(t, (j) => { j.tasks[0].repo = 'nope'; }, /tasks\[0\]\.repo: unknown repo/);
  bad(t, (j) => { j.tasks[2].id = 't-one'; }, /tasks\[2\]\.id: duplicate/);
  bad(t, (j) => { j.tasks[0].start = 'abc123'; }, /tasks\[0\]\.start: .*40/);
  bad(t, (j) => { j.tasks[0].reference = 'Z'.repeat(40); }, /tasks\[0\]\.reference/);
  bad(t, (j) => { j.tasks[0].steps = ['x']; }, /tasks\[0\]: .*both/);
  bad(t, (j) => { delete j.tasks[0].prompt; }, /tasks\[0\]\.prompt/);
  bad(t, (j) => { j.tasks[3].type = 'single'; }, /tasks\[3\]\.type/);
  bad(t, (j) => { j.tasks[0].b = 'r1/missing/CLAUDE.md'; }, /tasks\[0\]\.b: .*not found/);
  bad(t, (j) => { j.tasks[0].acceptance = '../outside'; }, /tasks\[0\]\.acceptance: .*inside/);
  bad(t, (j) => { j.repetitions = 0; }, /repetitions/);
  bad(t, (j) => { j.variants = ['A', 'E']; }, /variants/);
});

test('a missing or malformed manifest file is a usage error naming the file', (t) => {
  const dir = copy(t);
  writeFileSync(join(dir, 'manifest.json'), '{ nope');
  assert.throws(() => loadManifest(dir), /manifest\.json: .*JSON/);
  assert.throws(() => loadManifest(join(dir, 'absent')), /manifest\.json/);
});

const ids = (m, opts) => expandMatrix(m, opts).cells.map((c) => c.id);

test('matrix: every cell once; same seed same order, other seed other order', () => {
  const m = loadManifest(fixture);
  const a = ids(m, { seed: 'one' });
  assert.equal(a.length, 4 * 4 * 5);
  assert.equal(new Set(a).size, a.length);
  assert.deepEqual(ids(m, { seed: 'one' }), a);
  assert.notDeepEqual(ids(m, { seed: 'two' }), a);
  for (const task of m.tasks) for (const v of 'ABCD') for (let r = 1; r <= 5; r++) assert.ok(a.includes(`${task.id}.${v}.${r}`));
});

test('matrix: each (task, rep) block holds all four variants back to back', () => {
  const { cells } = expandMatrix(loadManifest(fixture), { seed: 's' });
  for (let i = 0; i < cells.length; i += 4) {
    const block = cells.slice(i, i + 4);
    assert.equal(new Set(block.map((c) => `${c.task}.${c.rep}`)).size, 1);
    assert.deepEqual(block.map((c) => c.variant).sort(), ['A', 'B', 'C', 'D']);
  }
  const orders = new Set();
  for (let i = 0; i < cells.length; i += 4) orders.add(cells.slice(i, i + 4).map((c) => c.variant).join(''));
  assert.ok(orders.size > 1, 'variant order is randomized across blocks');
});

test('setup cells are keyed (repo, start, profile), shared, and precede their first dependent cell', () => {
  const m = loadManifest(fixture);
  const { cells, setups, queue } = expandMatrix(m, { seed: 's' });
  const r1 = setups.filter((s) => s.repo === 'r1');
  assert.equal(r1.filter((s) => s.profile === 'deep').length, 2);
  assert.equal(r1.filter((s) => s.profile === 'standard').length, 2);
  assert.equal(setups.length, 6);
  assert.equal(new Set(setups.map((s) => s.key)).size, 6);
  for (const c of cells) {
    if (c.variant === 'A' || c.variant === 'B') assert.equal(c.setup, null);
    else assert.equal(c.setup, setups.find((s) => s.repo === m.tasks.find((x) => x.id === c.task).repo
      && s.start === m.tasks.find((x) => x.id === c.task).start && s.profile === (c.variant === 'C' ? 'deep' : 'standard')).key);
  }
  const at = (kind, id) => queue.findIndex((q) => q.kind === kind && q.id === id);
  for (const s of setups) {
    const first = cells.filter((c) => c.setup === s.key).map((c) => at('cell', c.id)).sort((x, y) => x - y)[0];
    assert.ok(at('setup', s.key) >= 0 && at('setup', s.key) < first, s.key);
  }
  assert.equal(queue.filter((q) => q.kind === 'cell').length, cells.length);
});

test('ids are stable; done ids are skipped; reps, only and variant filters keep ids and relative order', () => {
  const m = loadManifest(fixture);
  const all = ids(m, { seed: 's' });
  assert.ok(all.every((id) => /^[a-z0-9-]+\.[ABCD]\.\d+$/.test(id)));
  const done = new Set(all.slice(0, 7));
  const rest = expandMatrix(m, { seed: 's', done });
  assert.deepEqual(rest.cells.map((c) => c.id), all.slice(7));
  const one = ids(m, { seed: 's', reps: 1 });
  assert.equal(one.length, 16);
  assert.deepEqual(one, all.filter((id) => id.endsWith('.1')));
  const only = ids(m, { seed: 's', only: ['t-two'], variant: ['A', 'D'], reps: 2 });
  assert.deepEqual(only, all.filter((id) => /^t-two\.[AD]\.[12]$/.test(id)));
  const q = expandMatrix(m, { seed: 's', only: ['t-two'], variant: ['A'] });
  assert.equal(q.setups.length, 0);
  assert.throws(() => expandMatrix(m, { seed: 's', only: ['nope'] }), UsageError);
  assert.throws(() => expandMatrix(m, { seed: 's', variant: ['Z'] }), UsageError);
  assert.throws(() => expandMatrix(m, { seed: 's', reps: 0 }), UsageError);
  assert.throws(() => expandMatrix(m, {}), UsageError);
});

test('a setup whose dependent cells are all done is not emitted again', () => {
  const m = loadManifest(fixture);
  const full = expandMatrix(m, { seed: 's' });
  const done = new Set(full.cells.filter((c) => c.setup === full.setups[0].key).map((c) => c.id));
  const rest = expandMatrix(m, { seed: 's', done });
  assert.ok(!rest.setups.some((s) => s.key === full.setups[0].key));
});
