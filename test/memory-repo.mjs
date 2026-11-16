// Test helper (not a test file): a temporary repo initialized with `telos init`, two ROADMAP
// phases (01-demo active, 02-next planned) and STATUS pointing at 01-demo.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../lib/init.mjs';
import { setLines } from '../lib/status.mjs';

export const PHASES = '- 01-demo [active] demo phase · done when: demo works\n'
  + '- 02-next [planned] next phase · done when: next works\n';

/**
 * @param {{ after?: (fn: () => void) => void } | null} t test context for cleanup (null: caller cleans up)
 * @param {{ checks?: Record<string, string>, stack?: string[], profile?: string }} [opts]
 * @returns {string} repo root
 */
export function memoryRepo(t, { checks = {}, stack = ['javascript'], profile = 'standard' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'telos-test-'));
  t?.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.git'));
  init(root, { profile, stack, checks });
  const telos = (file) => join(root, '.telos', file);
  writeFileSync(telos('ROADMAP.md'), `${readFileSync(telos('ROADMAP.md'), 'utf8').trimEnd()}\n${PHASES}`);
  writeFileSync(telos('STATUS.md'), setLines(readFileSync(telos('STATUS.md'), 'utf8'), { phase: '01-demo', task: 'none' }));
  return root;
}

/** Write `.telos/<rel>` (or any repo-relative path) with `text`. */
export const write = (root, rel, text) => writeFileSync(join(root, rel), text);

/** Read a repo-relative path. */
export const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
