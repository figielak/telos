import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../lib/cli.mjs';
import { readHistory } from '../lib/history.mjs';
import { init } from '../lib/init.mjs';

const { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = fs;
const CLAUDE = '# My project\n\nOwn rules stay.\n';
const asRoot = process.getuid?.() === 0;

function repo(t, profile = 'minimal') {
  const root = mkdtempSync(join(tmpdir(), 'telos-profile-'));
  t.after(() => {
    try { chmodSync(join(root, '.telos'), 0o755); } catch { /* already gone */ }
    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, 'CLAUDE.md'), CLAUDE);
  init(root, { profile, stack: ['javascript'], checks: { test: 'npm test' } });
  return root;
}

const path = (root, name) => join(root, '.telos', name);
const read = (root, name) => readFileSync(path(root, name), 'utf8');
const config = (root) => JSON.parse(read(root, 'config.json'));
const profileEntries = (root) => readHistory(root).log.filter((e) => e.kind === 'profile');

/** Every file under .telos/ with its content, directories marked. */
function snapshot(root) {
  const out = {};
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const key = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { out[`${key}/`] = true; walk(join(dir, e.name), key); }
      else out[key] = readFileSync(join(dir, e.name), 'utf8');
    }
  };
  walk(join(root, '.telos'), '');
  return out;
}

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const code = await main(args, { cwd: root, stdout: out, stderr: err });
  return { code, stdout: out.text, stderr: err.text };
}

test('minimal → standard creates HISTORY and LESSONS and records the switch via history', async (t) => {
  const root = repo(t);
  assert.ok(!existsSync(path(root, 'HISTORY.md')));
  const r = await telos(root, 'profile', 'standard');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /minimal → standard/);
  assert.equal(config(root).profile, 'standard');
  assert.ok(existsSync(path(root, 'HISTORY.md')));
  assert.ok(existsSync(path(root, 'HISTORY.md')));
  const entries = profileEntries(root);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].ref, 'telos');
  assert.match(entries[0].text, /minimal → standard/);
  // The switch does not invent an `init` row dated today with the target profile.
  assert.deepEqual(readHistory(root).log.map((e) => e.kind), ['profile']);
});

test('the same profile twice is a no-op without duplicate files or history', async (t) => {
  const root = repo(t);
  assert.equal((await telos(root, 'profile', 'deep')).code, 0);
  const before = snapshot(root);
  const r = await telos(root, 'profile', 'deep');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /already deep/);
  assert.deepEqual(snapshot(root), before);
  assert.equal(profileEntries(root).length, 1);
});

test('unknown or missing profile is a usage error and changes nothing', async (t) => {
  const root = repo(t);
  const before = snapshot(root);
  assert.equal((await telos(root, 'profile', 'huge')).code, 2);
  assert.equal((await telos(root, 'profile')).code, 2);
  assert.equal((await telos(root, 'profile', 'deep', 'extra')).code, 2);
  assert.deepEqual(snapshot(root), before);
});

test('invalid config fails with exit 1 and leaves config untouched', async (t) => {
  const root = repo(t);
  writeFileSync(path(root, 'config.json'), '{"profile": "minimal", "limits": {"status_lines": -1}}\n');
  const before = snapshot(root);
  const r = await telos(root, 'profile', 'standard');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /limits\.status_lines/);
  assert.doesNotMatch(r.stdout, /→/);
  assert.deepEqual(snapshot(root), before);
});

test('without .telos/ the command exits 1', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'telos-profile-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.git'));
  assert.equal((await telos(root, 'profile', 'deep')).code, 1);
});

test('unwritable destination fails, keeps the original config and stays retryable', { skip: asRoot }, async (t) => {
  const root = repo(t);
  const original = read(root, 'config.json');
  chmodSync(join(root, '.telos'), 0o555);
  const r = await telos(root, 'profile', 'standard');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /telos profile:/);
  assert.equal(r.stdout, '');
  assert.equal(read(root, 'config.json'), original);
  chmodSync(join(root, '.telos'), 0o755);
  assert.equal((await telos(root, 'profile', 'standard')).code, 0);
  assert.equal(profileEntries(root).length, 1);
});

test('a history failure rolls the config back; a retry after the fix records once', async (t) => {
  const root = repo(t, 'standard');
  const original = read(root, 'config.json');
  const history = read(root, 'HISTORY.md');
  writeFileSync(path(root, 'HISTORY.md'), '# History\nbroken\n');
  const r = await telos(root, 'profile', 'deep');
  assert.equal(r.code, 1);
  assert.equal(read(root, 'config.json'), original);
  assert.equal(read(root, 'HISTORY.md'), '# History\nbroken\n');

  writeFileSync(path(root, 'HISTORY.md'), history);
  assert.equal((await telos(root, 'profile', 'deep')).code, 0);
  assert.equal(profileEntries(root).length, 1);
});

test('a failed config publish leaves no false history entry, from standard or from minimal', async (t) => {
  const { switchProfile } = await import('../lib/profile.mjs');
  const fail = { publish() { throw new Error('disk full'); } };
  for (const start of ['standard', 'minimal']) {
    const root = repo(t, 'standard');
    if (start === 'minimal') assert.equal((await telos(root, 'profile', 'minimal')).code, 0);
    const history = read(root, 'HISTORY.md');
    const original = read(root, 'config.json');
    assert.throws(() => switchProfile(root, 'deep', fail), /disk full/);
    assert.equal(read(root, 'config.json'), original, start);
    assert.equal(read(root, 'HISTORY.md'), history, start);
  }
});

test('a switch keeps checks, stack, limits, git settings, unknown key order and CLAUDE.md', async (t) => {
  const root = repo(t);
  const custom = {
    version: 1, stack: ['javascript', 'astro'], profile: 'minimal',
    checks: { lint: 'npm run lint', test: 'npm test' },
    limits: { status_lines: 25, map_tokens: 900, history_entries: 7 },
    git: { auto_commit: false, phase_tags: false },
    strict_scope: true,
  };
  writeFileSync(path(root, 'config.json'), `${JSON.stringify(custom, null, 2)}\n`);
  const claude = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
  for (const target of ['standard', 'deep', 'minimal']) {
    assert.equal((await telos(root, 'profile', target)).code, 0, target);
    assert.equal(read(root, 'config.json'), `${JSON.stringify({ ...custom, profile: target }, null, 2)}\n`);
    assert.equal(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), claude);
  }
});

