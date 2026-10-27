import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';

import { atLeast, load as loadConfig } from './config.mjs';
import { UsageError } from './errors.mjs';
import { filesOf } from './lint-plan.mjs';
import { telosDir } from './repo.mjs';
import { inScope } from './scope.mjs';
import { getLine } from './status.mjs';
import { loadTask, TaskError } from './tasks.mjs';

// PreToolUse Edit/Write guard (SPEC §8, std+): protected configs need the in-progress task's
// Files to list them; edits outside that task's scope warn (strict_scope: deny). Paths are
// matched lexically and through symlinks, so no alias passes. Invalid state fails closed,
// except for edits inside .telos/ that are needed to repair it.

const TOOLS = { Edit: 'file_path', Write: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' };

/** @typedef {{ decision: 'allow' | 'warn' | 'deny', reason?: string }} Verdict */

const ALLOW = { decision: 'allow' };
const toPosix = (p) => p.split(sep).join('/');
const inside = (rel) => rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
const isTelos = (p) => p === '.telos' || p.startsWith('.telos/');

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

/** @returns {string | undefined} the protected_configs pattern matching `path` (`#fragment` protects the whole file) */
function protectedBy(path, patterns) {
  return patterns.find((raw) => {
    const pattern = raw.split('#')[0];
    if (!pattern) return false;
    return pattern.includes('/') ? inScope(path, [pattern]) : inScope(posix.basename(path), [pattern]);
  });
}

/** @returns {{ id: string, task?: import('./tasks.mjs').Task, error?: string } | null} the STATUS task */
function statusTask(root) {
  const path = join(telosDir(root), 'STATUS.md');
  const id = existsSync(path) ? getLine(readFileSync(path, 'utf8'), 'Task') : 'none';
  if (!/^\d{2}-\d{2}$/.test(id)) return null;
  try { return { id, task: loadTask(root, id) }; } catch (err) {
    if (!(err instanceof TaskError || err instanceof UsageError)) throw err;
    return { id, error: err.message };
  }
}

function minimalRaw(root) {
  try { return JSON.parse(readFileSync(join(telosDir(root), 'config.json'), 'utf8')).profile === 'minimal'; } catch { return false; }
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

/** @returns {Verdict} protected-config and scope decision for a normalized edit target. */
export function editGuard(root, input) {
  const found = editTarget(root, input);
  if (!found) return ALLOW;
  const { path, candidates, escapes } = found;
  const repair = candidates.every(isTelos) && !escapes;

  let cfg;
  try { cfg = loadConfig(root); } catch (err) {
    if (minimalRaw(root) || repair) return ALLOW;
    return { decision: 'deny', reason: `${err.message}; fix .telos/config.json before editing other files` };
  }
  if (!atLeast(cfg, 'standard')) return ALLOW;

  const current = statusTask(root);
  if (current?.error) {
    if (repair) return ALLOW;
    return { decision: 'deny', reason: `STATUS task ${current.id} cannot be read (${current.error}); `
      + `fix the task file or run telos status set task=<id>, then retry` };
  }
  const active = current?.task?.meta.status === 'in-progress' ? current.task : null;

  const pattern = candidates.map((c) => protectedBy(c, cfg.protected_configs)).find(Boolean);
  if (pattern) {
    const declared = new Set((active ? filesOf(active) : []).map((f) => posix.normalize(f).replace(/^\.\//, '')));
    if (!candidates.every((c) => declared.has(c))) {
      const how = active ? `Add it to the Files of ${active.id} (via /telos:revise) before editing it, or ask the user.`
        : 'There is no in-progress task: start the task that lists it under Files, or ask the user.';
      return { decision: 'deny', reason: `${path} is a protected config (protected_configs: ${pattern}). ${how}` };
    }
  }

  if (!active) return ALLOW;
  const scope = Array.isArray(active.meta.scope) ? active.meta.scope : [];
  const outside = escapes || candidates.some((c) => !isTelos(c) && !inScope(c, scope));
  if (!outside) return ALLOW;
  const where = `${path}${escapes ? ' (resolves outside the repository)' : ''} is outside the scope of ${active.id} (${scope.join(', ') || 'none'})`;
  if (cfg.strict_scope) {
    return { decision: 'deny', reason: `${where}; strict_scope is on, so the edit is blocked. Stay in scope or change the task via /telos:revise.` };
  }
  return { decision: 'warn', reason: `${where}. Stay in scope, or record it in the task Result: \`Deviations: ${path} — <why>\`.` };
}
