// Test helper (not a test file): a committed copy of `test/fixtures/areas/` (areas api, web, util
// over src/api/, src/web/, lib/util.mjs; docs/ is under no area) with `telos init` and every area
// header anchored at HEAD.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../lib/init.mjs';

export const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

/** Commit everything with `message`; @returns {string} the new HEAD */
export function commitAll(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', message);
  return git(root, 'rev-parse', 'HEAD');
}

/** Rewrite every area header's commit to `hash` (keeps the date and paths). */
export function setAnchor(root, hash, names = null) {
  const dir = join(root, '.telos', 'areas');
  for (const file of readdirSync(dir)) {
    if (names && !names.includes(file.slice(0, -3))) continue;
    const path = join(dir, file);
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^(<!-- telos-area: commit )\S+/, `$1${hash}`));
  }
}

/**
 * @param {{ after(fn: () => void): void } | null} t test context for cleanup (null: caller cleans up)
 * @returns {{ root: string, anchor: string }} repo root and the commit every area is anchored at
 */
export function areasRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'telos-areas-'));
  t?.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(new URL('./fixtures/areas/', import.meta.url), root, { recursive: true });
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  git(root, 'config', 'commit.gpgsign', 'false');
  init(root);
  const anchor = commitAll(root, 'init');
  setAnchor(root, anchor);
  commitAll(root, 'anchor areas');
  return { root, anchor };
}

/** Write a repo-relative file. */
export const write = (root, rel, text) => writeFileSync(join(root, rel), text);
