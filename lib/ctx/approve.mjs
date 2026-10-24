import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRepo, porcelainFiles, refExists } from '../git.mjs';
import { lintPhase } from '../lint-plan.mjs';
import { telosDir } from '../repo.mjs';
import { phaseLine } from '../roadmap.mjs';
import { getLine } from '../status.mjs';
import { phaseDir, phaseTasks } from '../tasks.mjs';

// Bundle for /telos:approve (SPEC §5.2), plus phase helpers shared with `ctx plan` and `ctx do`.

/** @typedef {import('../tasks.mjs').Task} Task */

export const statusText = (root) => {
  const path = join(telosDir(root), 'STATUS.md');
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

/** @returns {string | null} NN of the STATUS `Phase:` line, null when none */
export function statusPhase(root) {
  const phase = getLine(statusText(root), 'Phase');
  return /^\d{2}-/.test(phase) ? phase.slice(0, 2) : null;
}

/** @returns {string} `- id [status] title · effort[ · critical] · depends: …` (scope is lint-plan's job) */
export function indexLine(task) {
  const { meta } = task;
  const depends = Array.isArray(meta.depends) && meta.depends.length ? meta.depends.join(', ') : 'none';
  return `- ${task.id} [${meta.status ?? '?'}] ${meta.title ?? ''} · ${meta.effort ?? 'normal'}`
    + `${meta.critical === true ? ' · critical' : ''} · depends: ${depends}`;
}

/** @returns {Map<string, boolean>} D-NN → proposed, from the phase's `NN-CONTEXT.md` (empty without one) */
export function phaseDecisions(root, nn) {
  const dir = phaseDir(root, nn);
  const path = dir && join(dir, `${nn}-CONTEXT.md`);
  if (!path || !existsSync(path)) return new Map();
  const found = [...readFileSync(path, 'utf8').matchAll(/^- (D-\d{2})( \[proposed\])?:/gm)];
  return new Map(found.map((m) => [m[1], Boolean(m[2])]));
}

/**
 * Why a task may not be approved or run yet (SPEC §4.3.2, §4.4): its decisions are
 * `[proposed]` in CONTEXT or listed as `NN:D-MM` in STATUS *Awaiting user*.
 * @param {string} root
 * @param {Pick<Task, 'nn' | 'meta'>} task
 * @returns {string[]} reasons, e.g. `D-02 is proposed`
 */
export function decisionBlocks(root, task) {
  const decisions = phaseDecisions(root, task.nn);
  const awaiting = getLine(statusText(root), 'Awaiting user').split(',').map((s) => s.trim());
  return (task.meta.decisions ?? []).flatMap((d) => {
    if (decisions.get(d)) return [`${d} is proposed`];
    if (awaiting.includes(`${task.nn}:${d}`)) return [`${d} awaits the user`];
    return [];
  });
}

/** Bundle for /telos:approve: phase, tasks, lint result, blocked and draft tasks, tag, .telos/ changes. */
export function approveBundle({ root, args }) {
  const nn = /^\d{2}$/.test(args[0] ?? '') ? args[0] : statusPhase(root);
  if (!nn) return 'REFUSED: no phase in STATUS; pass NN';
  const phase = phaseLine(root, nn);
  const tasks = phaseTasks(root, nn);
  if (!tasks.length) return `REFUSED: phase ${nn} has no task files; run /telos:plan`;

  const { problems, count } = lintPhase(root, nn);
  const blocked = tasks.flatMap((t) => decisionBlocks(root, t).map((why) => `- ${t.id}: ${why}`));
  const drafts = tasks.filter((t) => t.meta.status === 'draft').map((t) => t.id);
  const tag = `telos/${nn}-start`;
  const changes = porcelainFiles(root).filter((f) => f.startsWith('.telos/'));

  return [
    `Phase: ${phase ? `${phase.name} [${phase.status}]` : `${nn} (no ROADMAP line)`}`,
    'Tasks:', ...tasks.map(indexLine),
    problems.length ? ['Lint:', ...problems].join('\n') : `Lint: ok: ${count} tasks`,
    `Draft: ${drafts.join(', ') || 'none'}`,
    blocked.length ? ['Blocked:', ...blocked].join('\n') : 'Blocked: none',
    `Tag: ${tag} ${refExists(root, tag) ? 'exists' : 'missing'}`,
    !isRepo(root) ? 'Telos changes: n/a (not a git repo)'
      : changes.length ? ['Telos changes:', ...changes.map((f) => `- ${f}`)].join('\n') : 'Telos changes: none',
  ].join('\n');
}
