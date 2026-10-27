import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { atLeast, load as loadConfig, requireMessage } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { isRepo, porcelainFiles, refExists, taskCommits } from '../git.mjs';
import { telosDir } from '../repo.mjs';
import { phaseLine } from '../roadmap.mjs';
import { loadTask, phaseTasks, TaskError } from '../tasks.mjs';
import { statusPhase } from './approve.mjs';

// Bundle for /telos:undo (SPEC §5, §10): an exact, read-only preview of a task's commits since
// the phase tag, the Telos files they carry, transitive dependents and the phase state after
// the undo. Refusals print `REFUSED: …` with a remedy; the skill runs git only after confirmation.

const BLOCKABLE = ['approved', 'in-progress', 'done'];

/** @returns {import('../tasks.mjs').Task[]} tasks of every phase directory */
function allTasks(root) {
  const dir = join(telosDir(root), 'phases');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => /^\d{2}-/.test(d)).map((d) => d.slice(0, 2))
    .filter((nn, i, all) => all.indexOf(nn) === i).flatMap((nn) => phaseTasks(root, nn));
}

/** @returns {import('../tasks.mjs').Task[]} tasks depending on `id` directly or transitively, sorted by id */
function dependents(root, id) {
  const tasks = allTasks(root);
  const found = new Set();
  let frontier = [id];
  while (frontier.length) {
    const next = tasks.filter((t) => !found.has(t.id) && t.id !== id
      && (t.meta.depends ?? []).some((d) => frontier.includes(d)));
    next.forEach((t) => found.add(t.id));
    frontier = next.map((t) => t.id);
  }
  return tasks.filter((t) => found.has(t.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
}

function candidates(root) {
  const nn = statusPhase(root);
  if (!nn) return 'Candidates: none (no phase in STATUS)';
  const done = phaseTasks(root, nn).filter((t) => ['done', 'blocked', 'in-progress'].includes(t.meta.status));
  return `Candidates in ${nn}: ${done.length ? done.map((t) => `${t.id} [${t.meta.status}]`).join(', ') : 'none'}`;
}

/** Bundle for /telos:undo: `ctx undo NN-MM`; without an id it lists candidates. */
export function undoBundle({ root, args }) {
  if (args.length > 1 || (args.length && !/^\d{2}-\d{2}$/.test(args[0]))) throw new UsageError('usage: ctx undo [NN-MM]');
  const cfg = loadConfig(root);
  if (!atLeast(cfg, 'standard')) return requireMessage('standard');
  if (!args.length) return ['Target: none (pass a task id)', candidates(root)].join('\n');

  const [id] = args;
  let task;
  try { task = loadTask(root, id); } catch (err) {
    if (!(err instanceof TaskError)) throw err;
    return `REFUSED: no task ${id}`;
  }
  if (task.meta.status === 'reverted') return `REFUSED: ${id} is already reverted`;
  if (!isRepo(root)) return 'REFUSED: not a git repository';
  const dirty = porcelainFiles(root);
  if (dirty.length) {
    const shown = dirty.slice(0, 5).join(', ') + (dirty.length > 5 ? `, … ${dirty.length - 5} more` : '');
    return `REFUSED: uncommitted changes (${shown}); commit or discard them yourself, then rerun`;
  }
  const tag = `telos/${task.nn}-start`;
  if (!refExists(root, tag)) {
    return `REFUSED: tag ${tag} is missing; create it at the phase's plan commit (git tag ${tag} <commit>), then rerun`;
  }
  const found = taskCommits(root, id, tag);
  if (!found) return `REFUSED: git log ${tag}..HEAD failed`;
  if (found.reverts.length) return `REFUSED: ${id} was already reverted by ${found.reverts[0]}`;
  if (!found.commits.length) return `REFUSED: no commits of ${id} after ${tag} (subjects <type>(${id}): …)`;
  const merge = found.commits.find((c) => c.parents > 1);
  if (merge) return `REFUSED: ${merge.hash} is a merge commit; revert it by hand (git revert -m 1 ${merge.hash})`;

  const telosFiles = [...new Set(found.commits.flatMap((c) => c.stat).map((l) => l.split('|')[0].trim())
    .filter((p) => p.startsWith('.telos/')))].sort();
  const deps = dependents(root, id);
  const phase = phaseLine(root, task.nn);
  const block = deps.filter((t) => BLOCKABLE.includes(t.meta.status)).map((t) => t.id);

  return [
    `Profile: ${cfg.profile}`,
    `Target: ${id} [${task.meta.status}] ${task.meta.title ?? ''} · phase ${phase ? `${phase.name} [${phase.status}]` : `${task.nn} (no ROADMAP line)`}`,
    `Tag: ${tag}`,
    [`Commits (newest first, ${found.commits.length}):`,
      ...found.commits.flatMap((c) => [`- ${c.hash} ${c.subject}`, ...c.stat.map((l) => `  ${l}`)])].join('\n'),
    `Revert order: ${found.commits.map((c) => c.hash).join(' ')}`,
    `Telos files in these commits: ${telosFiles.join(', ') || 'none'}`,
    `Dependents (transitive, never reverted): ${deps.length ? deps.map((t) => `${t.id} [${t.meta.status}]`).join(', ') : 'none'}`,
    `Block after undo: ${block.join(', ') || 'none'}`,
    `Phase after undo: ${phase?.status === 'done' ? `reopen with \`telos roadmap set ${task.nn} active\`` : 'stays active'}`,
    `Auto-commit: ${cfg.git.auto_commit ? 'yes' : 'no'}`,
  ].join('\n');
}
