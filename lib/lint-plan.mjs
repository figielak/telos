import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { UsageError } from './errors.mjs';
import { getLine } from './status.mjs';
import { inScope } from './scope.mjs';
import { listItems, loadTask, phaseDir, phaseTasks, STATUSES, TaskError } from './tasks.mjs';
import { telosDir } from './repo.mjs';

// Structural plan checks (SPEC §4.3.1, §4.3.3; 02:D-07). Whether each edge case is really
// covered by a test is judged by the plan skill, not here.

const TYPES = ['code', 'doc', 'audit'];
const EFFORTS = ['normal', 'hard'];
const REQUIRED = ['Goal', 'Files', 'Steps', 'Acceptance', 'Result'];
const LIMIT = { normal: 80, detailed: 140 };
const MACHINE_CHECK = /`[^`]+`\s*→\s*exit \d+/;
const TESTS_ITEM = /^- \[[ x]\] all listed tests pass$/m;

/** @typedef {import('./tasks.mjs').Task} Task */

/** @returns {string[]} paths of the Files section: `- path[, path…] (create|modify|…)` → paths */
export function filesOf(task) {
  return listItems(task.sections.get('Files'))
    .flatMap((item) => item.replace(/\s+\(.*$/, '').replace(/`/g, '').split(','))
    .map((path) => path.trim()).filter(Boolean);
}

/** @returns {Map<string, boolean> | null} D-NN → proposed, from `NN-CONTEXT.md`; null without CONTEXT */
function contextDecisions(dir, nn) {
  const path = join(dir, `${nn}-CONTEXT.md`);
  if (!existsSync(path)) return null;
  const found = [...readFileSync(path, 'utf8').matchAll(/^- (D-\d{2})( \[proposed\])?:/gm)];
  return new Map(found.map((m) => [m[1], Boolean(m[2])]));
}

/**
 * Problems of one task, in a fixed order; the depend cycle check needs the phase (lintPhase).
 * @param {Task} task
 * @param {{ ids: Set<string>, decisions: Map<string, boolean> | null, exists?: (id: string) => boolean }} phase
 * @returns {string[]}
 */
export function lintTask(task, phase) {
  const { meta, sections } = task;
  const out = [];
  const detailed = meta.effort === 'hard' || meta.critical === true;
  const items = (name) => listItems(sections.get(name));

  if (meta.id !== task.id) out.push(`id mismatch: file ${task.id}, id ${meta.id ?? 'missing'}`);
  if (!TYPES.includes(meta.type)) out.push(`invalid type: ${meta.type ?? 'missing'}`);
  if (!STATUSES.includes(meta.status)) out.push(`invalid status: ${meta.status ?? 'missing'}`);
  if (!EFFORTS.includes(meta.effort ?? 'normal')) out.push(`invalid effort: ${meta.effort}`);

  const scope = Array.isArray(meta.scope) ? meta.scope.map(String) : [];
  if (!scope.length) out.push('scope empty');
  if (meta.type === 'audit' && (scope.length !== 1 || scope[0] !== '.telos/')) out.push('audit scope must be [".telos/"]');
  for (const file of filesOf(task)) if (!inScope(file, scope)) out.push(`file outside scope: ${file}`);

  for (const name of REQUIRED) if (!sections.has(name)) out.push(`missing section: ${name}`);
  if (meta.type === 'code' && !items('Tests').length) out.push('missing section: Tests');
  if (meta.type !== 'code' && items('Tests').length) out.push('Tests only for type code');

  if (detailed) {
    const missing = ['Interface', 'Edge cases'].filter((s) => !sections.has(s));
    if (missing.length) out.push(`detailed task needs: ${missing.join(', ')}`);
    else if (!items('Edge cases').length) out.push('empty section: Edge cases');
  }

  const lines = task.text.trimEnd().split('\n').length;
  const limit = detailed ? LIMIT.detailed : LIMIT.normal;
  if (lines > limit) out.push(`too long: ${lines} > ${limit} lines`);

  const acceptance = sections.get('Acceptance') ?? '';
  if (sections.has('Acceptance') && !MACHINE_CHECK.test(acceptance)) out.push('no machine-checkable acceptance');
  if (meta.type === 'code' && sections.has('Acceptance') && !TESTS_ITEM.test(acceptance)) {
    out.push('missing: all listed tests pass');
  }

  for (const dep of meta.depends ?? []) {
    if (!phase.ids.has(dep) && !(phase.exists ?? (() => false))(dep)) out.push(`unknown depend: ${dep}`);
  }
  if (phase.decisions) {
    for (const d of meta.decisions ?? []) if (!phase.decisions.has(d)) out.push(`unknown decision: ${d}`);
  }
  return out;
}

/** @returns {string[] | null} first depend cycle through `start`, as ids from start back to start */
function cycleFrom(start, depends) {
  const walk = (id, path) => {
    for (const dep of depends.get(id) ?? []) {
      if (dep === start) return [...path, dep];
      if (!path.includes(dep)) {
        const found = walk(dep, [...path, dep]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(start, [start]);
}

/**
 * @param {string} root
 * @param {string} nn phase number
 * @returns {{ count: number, problems: string[] }} problems as `<id>: <problem>`
 */
export function lintPhase(root, nn) {
  const tasks = phaseTasks(root, nn);
  const dir = phaseDir(root, nn);
  const ids = new Set(tasks.map((t) => t.id));
  const exists = (id) => {
    try { return Boolean(loadTask(root, id)); } catch (err) {
      if (err instanceof TaskError || err instanceof UsageError) return false;
      throw err;
    }
  };
  const phase = { ids, decisions: dir ? contextDecisions(dir, nn) : null, exists };
  const depends = new Map(tasks.map((t) => [t.id, (t.meta.depends ?? []).filter((d) => ids.has(d))]));
  const reported = new Set();
  const problems = [];
  for (const task of tasks) {
    for (const p of lintTask(task, phase)) problems.push(`${task.id}: ${p}`);
    const cycle = reported.has(task.id) ? null : cycleFrom(task.id, depends);
    if (cycle) {
      cycle.forEach((id) => reported.add(id));
      problems.push(`${task.id}: depend cycle: ${cycle.join(' → ')}`);
    }
  }
  return { count: tasks.length, problems };
}

/** @type {import('./cli.mjs').Command} */
export const lintPlanCommand = {
  help: 'Check the task files of a phase: lint-plan [NN] (default: phase from STATUS)',
  needsTelos: true,
  run({ args, root, stdout, stderr }) {
    let [nn, ...extra] = args;
    if (extra.length) throw new UsageError('usage: lint-plan [NN]');
    if (nn === undefined) {
      const statusPath = join(telosDir(root), 'STATUS.md');
      const phase = existsSync(statusPath) ? getLine(readFileSync(statusPath, 'utf8'), 'Phase') : 'none';
      if (phase === 'none') throw new UsageError('no current phase in STATUS; pass NN');
      nn = phase.slice(0, 2);
    }
    if (!/^\d{2}$/.test(nn)) throw new UsageError(`invalid phase '${nn}' (expected NN)`);
    let result;
    try {
      result = lintPhase(root, nn);
    } catch (err) {
      if (!(err instanceof TaskError)) throw err;
      stderr.write(`telos lint-plan: ${err.message}\n`);
      return 1;
    }
    if (!result.count) {
      stderr.write(`telos lint-plan: no tasks in phase ${nn}\n`);
      return 1;
    }
    if (!result.problems.length) {
      stdout.write(`ok: ${result.count} tasks\n`);
      return 0;
    }
    stdout.write(`${result.problems.join('\n')}\n${result.problems.length} problems\n`);
    return 1;
  },
};
