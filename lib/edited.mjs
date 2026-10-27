import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runNamed } from './check.mjs';
import { atLeast, load as loadConfig } from './config.mjs';
import { editTarget } from './edit-guard.mjs';
import { telosDir } from './repo.mjs';

// Edited-file batches for the Stop hook (SPEC §8, std+). PostToolUse drops one file per path into
// `.cache/edited/<session>/pending/`; Stop renames `pending/` to a `batch-*` directory in one
// atomic step, so an edit arriving during the checks lands in a fresh `pending/`. A batch is
// removed only after its checks pass; a failed one is merged into the next claim.

const STOP_TIMEOUT_MS = 120_000;
const REPORT_LINES = 10;
const REPORT_CHARS = 2000;
const STOP_CHECKS = ['format', 'types'];

const hash = (s) => createHash('sha256').update(s).digest('hex');
const sessionDir = (root, sessionId) => join(telosDir(root), '.cache', 'edited',
  hash(typeof sessionId === 'string' && sessionId ? sessionId : 'none').slice(0, 16));

function standard(root) {
  if (!existsSync(telosDir(root))) return null;
  try {
    const cfg = loadConfig(root);
    return atLeast(cfg, 'standard') ? cfg : null;
  } catch { return null; }
}

/**
 * Record the target of a successful Edit/Write-like event; silent no-op otherwise.
 * @returns {boolean} whether a path was recorded
 */
export function recordEdit(root, input) {
  if (input?.tool_response?.success === false || !standard(root)) return false;
  const target = editTarget(root, input);
  if (!target || target.escapes) return false;
  const path = target.candidates.at(-1);
  if (path === '.telos' || path.startsWith('.telos/')) return false;
  const dir = sessionDir(root, input.session_id);
  for (let attempt = 0; attempt < 5; attempt++) {
    mkdirSync(join(dir, 'pending'), { recursive: true });
    const tmp = join(dir, `.tmp-${randomUUID()}`);
    try {
      writeFileSync(tmp, path, { flag: 'wx' });
      renameSync(tmp, join(dir, 'pending', hash(path)));
      return true;
    } catch (err) {
      // `pending/` was claimed between mkdir and rename: start a new one.
      if (err.code !== 'ENOENT') throw err;
    } finally {
      rmSync(tmp, { force: true });
    }
  }
  return false;
}

/** @typedef {{ dirs: string[], paths: string[] }} Batch */

/** Atomically claim pending edits plus any earlier failed batch. @returns {Batch | null} */
export function claimBatch(root, sessionId) {
  const dir = sessionDir(root, sessionId);
  if (!existsSync(dir)) return null;
  try { renameSync(join(dir, 'pending'), join(dir, `batch-${Date.now()}-${randomUUID()}`)); } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const dirs = readdirSync(dir).filter((d) => d.startsWith('batch-')).sort().map((d) => join(dir, d));
  const paths = [...new Set(dirs.flatMap((d) => readdirSync(d).map((f) => readFileSync(join(d, f), 'utf8'))))].sort();
  if (!dirs.length) return null;
  if (!paths.length) { completeBatch(root, { dirs, paths }); return null; }
  return { dirs, paths };
}

/** Drop a batch whose checks passed (or that has nothing left to check). */
export function completeBatch(root, batch) {
  for (const dir of batch.dirs) rmSync(dir, { recursive: true, force: true });
}

function report(result, count) {
  const lines = result.checks.filter((c) => c.verdict === 'FAIL').flatMap((c) => [
    `telos stop: ${c.name} FAIL (${c.note}) for ${count} edited file${count === 1 ? '' : 's'}`,
    ...(c.output ?? []).slice(0, REPORT_LINES).map((l) => `  ${l}`),
  ]);
  lines.push('Fix these before finishing; the edited files stay queued for the next Stop.');
  const text = lines.join('\n');
  return text.length <= REPORT_CHARS ? text : `${text.slice(0, REPORT_CHARS - 1)}…`;
}

/**
 * Stop hook: run `format` then `types` once on the claimed batch of edited files.
 * @param {string} root
 * @param {{ session_id?: string, stop_hook_active?: boolean }} input
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<string | null>} failure report, null when silent
 */
export async function stopChecks(root, input, { timeoutMs = STOP_TIMEOUT_MS } = {}) {
  if (input?.stop_hook_active) return null;
  const cfg = standard(root);
  if (!cfg) return null;
  const names = STOP_CHECKS.filter((k) => cfg.checks[k]);
  const batch = claimBatch(root, input?.session_id);
  if (!batch) return null;
  const files = batch.paths.filter((p) => {
    try { return !lstatSync(join(root, p)).isSymbolicLink(); } catch { return false; }
  });
  if (!names.length || !files.length) { completeBatch(root, batch); return null; }
  let result;
  try {
    result = await runNamed(root, { names, files, timeoutMs });
  } catch (err) {
    return `telos stop: could not run ${names.join(', ')} (${err.message}); the edited files stay queued.`;
  }
  if (result.ok) { completeBatch(root, batch); return null; }
  return report(result, files.length);
}
