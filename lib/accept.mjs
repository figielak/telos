import { spawnSync } from 'node:child_process';

import { draftChangelog } from './changelog.mjs';
import { load as loadConfig, requireMessage } from './config.mjs';
import { scanDocs } from './docs-scan.mjs';
import { UsageError } from './errors.mjs';
import { isRepo, porcelainFiles, refExists, taskCommitFiles } from './git.mjs';
import { phaseLine } from './roadmap.mjs';
import { inScope } from './scope.mjs';
import { loadTask, phaseTasks, TaskError } from './tasks.mjs';

// `telos accept <id>` (SPEC §4.3.1): machine-checkable Acceptance items + scope check,
// the gate `do` runs before committing. Runs commands, never edits the task file or git.

const TIMEOUT_MS = 600_000; // 02:D-05
const TAIL_LINES = 15;
const CHECKBOX = /^- \[[ xX]\] (.+)$/;
const COMMAND = /`([^`]+)`\s*→\s*exit (\d+)/;

/** @typedef {{ text: string, cmd?: string, exit?: number, verdict: 'PASS' | 'FAIL' | 'MANUAL',
 *   note?: string, tail?: string[] }} Item */

/**
 * Checkbox items of an Acceptance body; `` `cmd` → exit N `` items carry `cmd` and `exit`.
 * @param {string} body
 * @returns {Omit<Item, 'verdict'>[]}
 */
export function acceptanceItems(body) {
  return (body ?? '').replace(/<!--[\s\S]*?-->/g, '').split('\n').map((l) => CHECKBOX.exec(l.trim())?.[1].trim())
    .filter(Boolean).map((text) => {
      const m = COMMAND.exec(text);
      return m ? { text, cmd: m[1], exit: Number(m[2]) } : { text };
    });
}

/**
 * Paths from the last `Deviations:` line: `Deviations: p — why; p2, p3 — why` (`-` also separates).
 * @param {string} resultBody
 * @returns {string[]}
 */
export function deviations(resultBody) {
  const line = (resultBody ?? '').split('\n').filter((l) => /^(- )?Deviations:/.test(l.trim())).at(-1);
  const value = line?.trim().replace(/^(- )?Deviations:\s*/, '') ?? '';
  if (!value || value === 'none') return [];
  return value.split(';').flatMap((entry) => entry.split(/\s+[—-]\s+/)[0].split(','))
    .map((p) => p.trim()).filter(Boolean);
}

/** @returns {Item} */
function run(root, item, timeoutMs) {
  if (item.cmd === undefined) return { ...item, verdict: 'MANUAL' };
  // `exec 2>&1` keeps stdout and stderr interleaved for the tail.
  const r = spawnSync('sh', ['-c', `exec 2>&1\n${item.cmd}`], {
    cwd: root, encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 64 << 20,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail = (r.stdout ?? '').trimEnd().split('\n').filter((l, i, all) => l || i < all.length - 1).slice(-TAIL_LINES);
  if (r.error?.code === 'ETIMEDOUT' || (r.status === null && r.signal)) {
    return { ...item, verdict: 'FAIL', note: `timeout ${timeoutMs / 1000}s`, tail };
  }
  if (r.status === item.exit) return { ...item, verdict: 'PASS' };
  return { ...item, verdict: 'FAIL', note: `got ${r.status}`, tail };
}

/**
 * Uncommitted paths the deep close of phase `nn` may leave besides the task's own scope: the
 * docs-scan matched documents, the configured changelog when the phase has changelog candidates,
 * and paths owned by another done task of the phase (doc-sync docstrings). Validates ownership.
 * @returns {string[]}
 * @throws {TaskError} the task or phase cannot be closed
 */
function closeAllowance(root, task, nn) {
  if (nn !== task.nn) throw new TaskError(`task ${task.id} is not in phase ${nn}`);
  let cfg;
  try { cfg = loadConfig(root); } catch (err) { throw new TaskError(err.message); }
  if (cfg.profile !== 'deep') throw new TaskError(requireMessage('deep'));
  if (task.meta.status !== 'done') throw new TaskError(`task ${task.id} is ${task.meta.status ?? '?'}, not done; --close checks done tasks only`);
  const phase = phaseLine(root, nn);
  if (phase?.status !== 'active') throw new TaskError(`phase ${nn} is ${phase?.status ?? 'missing from ROADMAP'}, not active`);
  try {
    const docs = scanDocs(root, { phase: nn }).matches.map((m) => m.path);
    const changelog = draftChangelog(root, { phase: nn }).candidates.length ? [cfg.docs.changelog] : [];
    const owned = phaseTasks(root, nn).filter((t) => t.meta.status === 'done' && t.id !== task.id)
      .flatMap((t) => (Array.isArray(t.meta.scope) ? t.meta.scope.map(String) : []));
    return [...docs, ...changelog, ...owned];
  } catch (err) {
    if (err instanceof UsageError) throw err;
    throw new TaskError(`close allowance unavailable: ${err.message}`);
  }
}

/**
 * @param {string} root
 * @param {string} id task id
 * @param {{ timeoutMs?: number, close?: string }} [opts] `close`: phase NN of a deep close reverify
 * @returns {{ items: Item[], changed: string[], outside: string[], ok: boolean }}
 * @throws {TaskError} unknown task, not a git repo or a refused close selector
 */
export function accept(root, id, opts = {}) {
  const task = loadTask(root, id);
  if (!isRepo(root)) throw new TaskError('not a git repo');
  const allowed = opts.close === undefined ? [] : closeAllowance(root, task, opts.close);
  const items = acceptanceItems(task.sections.get('Acceptance')).map((i) => run(root, i, opts.timeoutMs ?? TIMEOUT_MS));

  const tag = `telos/${task.nn}-start`;
  const dirty = porcelainFiles(root);
  const committed = taskCommitFiles(root, id, refExists(root, tag) ? tag : undefined);
  const changed = [...new Set([...dirty, ...committed])];
  const scope = Array.isArray(task.meta.scope) ? task.meta.scope.map(String) : [];
  const declared = deviations(task.sections.get('Result'));
  // The close allowance covers only uncommitted edits; the task's own commits keep strict scope.
  const permitted = (f) => !committed.includes(f) && allowed.some((a) => a === f || inScope(f, [a]));
  const outside = changed.filter((f) => !f.startsWith('.telos/') && !inScope(f, scope) && !inScope(f, declared) && !permitted(f)).sort();

  return { items, changed, outside, ok: outside.length === 0 && !items.some((i) => i.verdict === 'FAIL') };
}

function format(id, result) {
  const lines = [];
  if (!result.items.length) lines.push('no acceptance items');
  for (const item of result.items) {
    lines.push(`${item.verdict.padEnd(6)} ${item.text}${item.note ? ` (${item.note})` : ''}`);
    if (item.verdict === 'FAIL') lines.push(...(item.tail ?? []).map((l) => `       ${l}`));
  }
  if (result.outside.length) {
    lines.push(...result.outside.map((f) => `SCOPE  FAIL ${f} (not in scope, not in Deviations)`));
  } else {
    const n = result.changed.length;
    lines.push(`SCOPE  ok (${n} file${n === 1 ? '' : 's'})`);
  }
  lines.push(`accept ${id}: ${result.ok ? 'PASS' : 'FAIL'}`);
  return `${lines.join('\n')}\n`;
}

/** @type {import('./cli.mjs').Command} */
export const acceptCommand = {
  help: 'Run a task\'s machine-checkable acceptance items and check its scope: accept <id> [--close NN]',
  needsTelos: true,
  run({ args, root, stdout, stderr }) {
    const [id, ...extra] = args;
    const close = extra.length === 2 && extra[0] === '--close' && /^\d{2}$/.test(extra[1]) ? extra[1] : undefined;
    if (!id || (extra.length && close === undefined)) throw new UsageError('usage: accept <id> [--close NN]');
    let result;
    try {
      result = accept(root, id, { close });
    } catch (err) {
      if (!(err instanceof TaskError)) throw err;
      stderr.write(`telos accept: ${err.message}\n`);
      return 1;
    }
    stdout.write(format(id, result));
    return result.ok ? 0 : 1;
  },
};
