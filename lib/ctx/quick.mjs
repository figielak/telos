import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { atLeast, load as loadConfig } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { isRepo, porcelainFiles } from '../git.mjs';
import { telosDir } from '../repo.mjs';
import { getLine } from '../status.mjs';
import { MAX_SELECTORS, memoryLines, normalizeSelector } from '../lessons.mjs';
import { listItems, loadTask, sections, TaskError } from '../tasks.mjs';
import { statusText } from './approve.mjs';
import { CAP, stripComments } from './index.mjs';
import { stackLine } from './stack.mjs';

// Bundle for /telos:quick (SPEC §5.3): enough to make a small change safely, no plan.
// The description stays out: the skill shows it in `## Change` (02:D-13).

const QUICK_CHECKS = ['test_related', 'test', 'lint', 'types'];
const TREE_MAX = 20;

/** @returns {string} `Current: …` naming the STATUS phase and task, so quick stays out of its files */
function currentLine(root) {
  const status = statusText(root);
  const phase = getLine(status, 'Phase');
  const task = getLine(status, 'Task');
  if (task === 'none') return `Current: phase ${phase} · no task`;
  let state = '?';
  try { state = loadTask(root, task).meta.status; } catch (err) {
    if (!(err instanceof TaskError || err instanceof UsageError)) throw err;
  }
  const note = state === 'in-progress' ? ' — keep quick changes out of its files' : '';
  return `Current: phase ${phase} · task ${task} [${state}]${note}`;
}

function treeLines(root) {
  if (!isRepo(root)) return 'Working tree: n/a (not a git repo)';
  const files = porcelainFiles(root).sort();
  if (!files.length) return 'Working tree: clean';
  const shown = files.slice(0, TREE_MAX).map((f) => `- ${f}`);
  if (files.length > TREE_MAX) shown.push(`- … ${files.length - TREE_MAX} more`);
  return ['Working tree:', ...shown].join('\n');
}

/** @returns {string[]} normalized `--area` selectors; anything else is a usage error */
function selectors(args) {
  let values;
  try {
    ({ values } = parseArgs({ args, strict: true, options: { area: { type: 'string', multiple: true } } }));
  } catch (err) {
    throw new UsageError(`${err.message} (usage: ctx quick [--area <path-or-topic>]…)`);
  }
  const areas = values.area ?? [];
  if (areas.length > MAX_SELECTORS) throw new UsageError(`at most ${MAX_SELECTORS} --area selectors`);
  return [...new Set(areas.map(normalizeSelector))];
}

/** Bundle for /telos:quick; `--area` selectors pick the lessons (standard+). */
export function quickBundle({ root, args = [] }) {
  const areas = selectors(args);
  const cfg = loadConfig(root);
  const projectPath = join(telosDir(root), 'PROJECT.md');
  const project = sections(stripComments(existsSync(projectPath) ? readFileSync(projectPath, 'utf8') : ''));
  const rules = listItems(project.get('Rules'));
  const checks = QUICK_CHECKS.filter((k) => cfg.checks?.[k]).map((k) => `${k}=${cfg.checks[k]}`);
  const head = [
    currentLine(root),
    rules.length ? ['Rules:', ...rules.map((r) => `- ${r}`)].join('\n') : 'Rules: none',
    stackLine(root, cfg),
    `Checks: ${checks.join(' · ') || 'none'}`,
    treeLines(root),
    'Size: ≤ ~5 files and < 1 hour; larger → stop and suggest /telos:plan',
  ];
  // Memory comes last and is budgeted, so Rules and Checks are never cut.
  const budget = CAP - head.join('\n').length - 20;
  return [...head, ...(atLeast(cfg, 'standard') ? memoryLines(root, { budget, selectors: areas }) : [])].join('\n');
}
