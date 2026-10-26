import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadConfig } from './config.mjs';
import { cap, stripComments } from './ctx/index.mjs';
import { stackLine } from './ctx/stack.mjs';
import { telosDir } from './repo.mjs';
import { getLine, view } from './status.mjs';
import { sections } from './tasks.mjs';

// SessionStart status (SPEC §8): what a fresh session needs to resume the loop, no file reads.

export const SESSION_CAP = 1200;
const POINTERS = ['STATUS.md', 'ROADMAP.md', 'PROJECT.md'];

/** @returns {string} first line of PROJECT §Purpose, '' when unset */
function purpose(root) {
  const path = join(telosDir(root), 'PROJECT.md');
  if (!existsSync(path)) return '';
  const body = sections(stripComments(readFileSync(path, 'utf8'))).get('Purpose') ?? '';
  return body.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
}

/**
 * Compact status for SessionStart (≤ SESSION_CAP chars).
 * @param {string} root repo root
 * @returns {string} '' when `.telos/` has no STATUS.md
 * @throws {Error} on an unreadable config (the hook stays silent)
 */
export function sessionText(root) {
  const path = join(telosDir(root), 'STATUS.md');
  if (!existsSync(path)) return '';
  const cfg = loadConfig(root);
  const status = readFileSync(path, 'utf8');
  const awaiting = getLine(status, 'Awaiting user');
  const line = purpose(root);
  return cap([
    ...(awaiting === 'none' ? [] : [`Awaiting user: ${awaiting}`]),
    ...(line ? [`Project: ${line}`] : []),
    stackLine(root, cfg),
    `Profile: ${cfg.profile}`,
    ...view(root, status).filter((l) => !l.startsWith('Awaiting user:')),
    `Files: ${POINTERS.map((f) => `.telos/${f}`).join(' · ')}`,
  ].join('\n'), SESSION_CAP);
}
