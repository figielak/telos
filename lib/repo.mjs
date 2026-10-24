import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Walk up from `cwd` to the directory containing `.git`.
 * @param {string} cwd
 * @returns {string | null} repo root, or null outside a repo
 */
export function findRoot(cwd) {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * @param {string} root repo root
 * @returns {string} path of the `.telos/` directory
 */
export function telosDir(root) {
  return join(root, '.telos');
}
