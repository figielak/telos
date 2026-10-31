import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIMITS, measure } from '../lib/budget.mjs';
import { main } from '../lib/cli.mjs';
import { init } from '../lib/init.mjs';
import { estimateTokens } from '../lib/map-budget.mjs';
import { sessionText } from '../lib/session.mjs';

const FIXTURES = {
  minimal: fileURLToPath(new URL('fixtures/minimal-loop/', import.meta.url)),
  standard: fileURLToPath(new URL('fixtures/standard-loop/', import.meta.url)),
  deep: fileURLToPath(new URL('fixtures/deep-loop/', import.meta.url)),
};

function repo(t, profile = 'standard') {
  const root = mkdtempSync(join(tmpdir(), 'telos-budget-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(FIXTURES[profile], root, { recursive: true });
  mkdirSync(join(root, '.git'));
  init(root, { profile });
  return root;
}

function sink() {
  const s = { text: '', write(x) { s.text += x; } };
  return s;
}

async function budget(root, ...args) {
  const stdout = sink(); const stderr = sink();
  const code = await main(['budget', ...args], { cwd: root, stdout, stderr });
  return { code, out: stdout.text, err: stderr.text };
}

async function ctx(root, ...args) {
  const stdout = sink();
  const code = await main(['ctx', ...args], { cwd: root, stdout, stderr: sink() });
  return { code, out: stdout.text };
}

/** Every file under root with its bytes and mtime, to prove a run wrote nothing. */
function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out[p] = `${statSync(p).mtimeMs}:${readFileSync(p, 'base64')}`;
      else out[p] = 'link';
    }
  };
  walk(root);
  return out;
}

const units = (text) => ({ bytes: Buffer.byteLength(text), chars: text.length, tokens: estimateTokens(text) });
const row = (rows, label) => rows.find((r) => r.label === label);

test('the default report is deterministic per profile, with distinct stored and rendered totals', async (t) => {
  for (const profile of ['minimal', 'standard', 'deep']) {
    const root = repo(t, profile);
    const a = await budget(root);
    const b = await budget(root);
    assert.equal(a.code, 0, a.err);
    assert.equal(a.out, b.out);
    assert.match(a.out, /^Telos budget · /);
    assert.match(a.out, /estimated tokens = ceil\(UTF-16 code units \/ 4\)/);
    assert.match(a.out, /^Stored \.telos files \(raw\):$/m);
    assert.match(a.out, /^Rendered injections:$/m);
    assert.match(a.out, /^Stored total: \d+ files · \d+ B · \d+ chars · ~\d+ est\. tokens$/m);
    assert.match(a.out, /^Rendered total: \d+ rows · \d+ B · \d+ chars · ~\d+ est\. tokens$/m);
    assert.match(a.out, /^Host usage: not measured/m);
    assert.match(a.out, /\.telos\/STATUS\.md · \d+ B/);
    assert.match(a.out, /SessionStart \(hook output\) · \d+ B/);
    assert.match(a.out, /CLAUDE\.md Telos block · \d+ B/);
  }
});

test('rows use bytes, UTF-16 chars and the shared estimate, final newline included', (t) => {
  const root = repo(t);
  const status = join(root, '.telos', 'STATUS.md');
  writeFileSync(status, `${readFileSync(status, 'utf8')}Zażółć 😀\n`);
  const r = measure(root);
  const stored = row(r.stored, '.telos/STATUS.md');
  assert.deepEqual({ bytes: stored.bytes, chars: stored.chars, tokens: stored.tokens }, units(readFileSync(status, 'utf8')));
  assert.notEqual(stored.bytes, stored.chars);
  const session = row(r.rendered, 'SessionStart (hook output)');
  const emitted = `${sessionText(root)}\n`;
  assert.deepEqual({ bytes: session.bytes, chars: session.chars, tokens: session.tokens }, units(emitted));
  const total = r.stored.filter((x) => !x.missing).reduce((n, x) => n + x.tokens, 0);
  assert.equal(r.totals.stored.tokens, total);
});

test('comment stripping changes only the stored counts', (t) => {
  const root = repo(t);
  const before = measure(root);
  const project = join(root, '.telos', 'PROJECT.md');
  writeFileSync(project, readFileSync(project, 'utf8').replace('## Purpose\n', '## Purpose\n<!-- a long guidance comment that injections strip -->\n'));
  const after = measure(root);
  assert.ok(row(after.stored, '.telos/PROJECT.md').chars > row(before.stored, '.telos/PROJECT.md').chars);
  assert.deepEqual(row(after.rendered, 'SessionStart (hook output)'), row(before.rendered, 'SessionStart (hook output)'));
});

test('--ctx measures exactly what telos ctx prints, including truncation', async (t) => {
  const root = repo(t, 'deep');
  for (const args of [['status'], ['plan'], ['shared', 'review']]) {
    const real = await ctx(root, ...args);
    const r = measure(root, { ctx: args });
    const sel = row(r.rendered, `ctx ${args.join(' ')}`);
    assert.deepEqual({ bytes: sel.bytes, chars: sel.chars, tokens: sel.tokens }, units(real.out), args.join(' '));
  }
  const big = join(root, '.telos', 'ROADMAP.md');
  writeFileSync(big, `${readFileSync(big, 'utf8')}${'- filler line for the cap\n'.repeat(400)}`);
  const real = await ctx(root, 'plan');
  assert.match(real.out, /truncated by telos ctx/);
  const sel = row(measure(root, { ctx: ['plan'] }).rendered, 'ctx plan');
  assert.equal(sel.chars, real.out.length);
  assert.equal(sel.truncated, true);
  const { code, out } = await budget(root, '--ctx', 'plan');
  assert.equal(code, 0);
  assert.match(out, /ctx plan · \d+ B · \d+ chars · ~\d+ est\. tokens · truncated/);
});

test('a refused or profile-gated ctx is no measurement: exit 1, no zero-cost row', async (t) => {
  const root = repo(t, 'minimal');
  for (const args of [['lesson'], ['shared', 'nope'], ['map', '--refresh']]) {
    const { code, out, err } = await budget(root, '--ctx', ...args);
    assert.equal(code, 1, args.join(' '));
    assert.equal(out, '');
    assert.match(err, /not measured/);
  }
});

test('malformed selectors and arguments exit 2', async (t) => {
  const root = repo(t);
  for (const args of [['--ctx'], ['--ctx', 'nope'], ['--ctx', 'shared', '../x'], ['extra'], ['--bogus'], ['--ctx', 'map', '--weird']]) {
    const { code, err } = await budget(root, ...args);
    assert.equal(code, 2, args.join(' '));
    assert.match(err, /^telos budget: /);
  }
});

test('missing optional memory and block are explicit rows; no .telos exits 1', async (t) => {
  const root = repo(t, 'standard');
  rmSync(join(root, '.telos', 'LESSONS.md'));
  rmSync(join(root, 'CLAUDE.md'));
  const { code, out } = await budget(root);
  assert.equal(code, 0);
  assert.match(out, /\.telos\/LESSONS\.md · missing/);
  assert.match(out, /CLAUDE\.md Telos block · missing/);
  rmSync(join(root, '.telos', 'STATUS.md'));
  assert.match((await budget(root)).out, /SessionStart \(hook output\) · missing/);

  const bare = mkdtempSync(join(tmpdir(), 'telos-budget-'));
  t.after(() => rmSync(bare, { recursive: true, force: true }));
  mkdirSync(join(bare, '.git'));
  assert.equal((await budget(bare)).code, 1);
});

test('caches, archives, symlinks, oversize files and traversal limits are visible omissions; nothing is written', async (t) => {
  const root = repo(t, 'deep');
  const dir = join(root, '.telos');
  const outside = mkdtempSync(join(tmpdir(), 'telos-budget-out-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'secret.md'), 'x'.repeat(5000));
  mkdirSync(join(dir, '.cache'), { recursive: true });
  writeFileSync(join(dir, '.cache', 'edited.json'), '{}');
  writeFileSync(join(dir, 'HISTORY-archive.md'), '# History archive\n');
  symlinkSync(join(outside, 'secret.md'), join(dir, 'linked.md'));
  symlinkSync(outside, join(dir, 'linked-dir'));
  writeFileSync(join(dir, 'huge.md'), 'y'.repeat(LIMITS.fileBytes + 1));
  let deep = join(dir, 'phases');
  for (let i = 0; i <= LIMITS.depth; i++) deep = join(deep, `d${i}`);
  mkdirSync(deep, { recursive: true });
  writeFileSync(join(deep, 'buried.md'), 'z\n');
  const many = join(dir, 'phases', 'many');
  mkdirSync(many);
  for (let i = 0; i < LIMITS.entries; i++) writeFileSync(join(many, `f${String(i).padStart(4, '0')}.md`), '');

  const before = snapshot(root);
  const { code, out } = await budget(root);
  assert.equal(code, 0);
  assert.deepEqual(snapshot(root), before);
  assert.match(out, /^Omitted:/m);
  assert.match(out, /\.telos\/\.cache · cache/);
  assert.match(out, /\.telos\/HISTORY-archive\.md · archive/);
  assert.match(out, /\.telos\/linked\.md · symlink/);
  assert.match(out, /\.telos\/linked-dir · symlink/);
  assert.match(out, /\.telos\/huge\.md · over \d+ bytes/);
  assert.match(out, /depth limit/);
  assert.match(out, /entry limit/);
  assert.doesNotMatch(out, /secret|buried/);
  assert.match(out, /^- … \d+ more files, counted in the total$/m);
  assert.ok(out.split('\n').length < LIMITS.rows + 40);
});
