import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { telosDir } from './repo.mjs';

// Normalize the target of an Edit/Write tool call for the Delete-zone guard. Paths are
// resolved lexically and through symlinks, so no alias escapes matching.

const TOOLS = { Edit: 'file_path', Write: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' };

const toPosix = (p) => p.split(sep).join('/');
const inside = (rel) => rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);

/** Resolve symlinks of the deepest existing ancestor; null when a link cannot be resolved. */
function realPath(abs) {
  let base = abs;
  const rest = [];
  for (;;) {
    try { lstatSync(base); break; } catch {
      if (dirname(base) === base) return null;
      rest.unshift(basename(base));
      base = dirname(base);
    }
  }
  try { return join(realpathSync(base), ...rest); } catch { return null; }
}

/**
 * Repo-relative forms of the target: the lexical path and the symlink-resolved one.
 * @returns {{ path: string, candidates: string[], escapes: boolean } | null} null outside the repo
 */
function target(root, cwd, file) {
  const abs = resolve(cwd, file);
  const roots = [resolve(root), realPath(resolve(root)) ?? resolve(root)];
  const lexical = roots.map((r) => relative(r, abs)).find(inside);
  if (lexical === undefined) return null;
  const real = realPath(abs);
  const realRel = real === null ? undefined : relative(roots[1], real);
  const candidates = [toPosix(lexical)];
  const escapes = realRel === undefined || !inside(realRel);
  if (!escapes && toPosix(realRel) !== candidates[0]) candidates.push(toPosix(realRel));
  return { path: candidates[0], candidates, escapes };
}

/**
 * @param {string} root repo root
 * @param {{ tool_name?: string, cwd?: string, tool_input?: Record<string, unknown> }} input hook event
 * @returns {ReturnType<typeof target>} normalized edit target, or null for other tools/outside paths
 */
export function editTarget(root, input) {
  const key = TOOLS[input?.tool_name];
  const file = key && input.tool_input?.[key];
  if (typeof file !== 'string' || !file || !existsSync(telosDir(root))) return null;
  return target(root, input.cwd || root, file);
}
