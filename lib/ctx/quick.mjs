import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadConfig } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { isRepo, porcelainFiles } from '../git.mjs';
import { telosDir } from '../repo.mjs';
import { getLine } from '../status.mjs';
import { listItems, loadTask, sections, TaskError } from '../tasks.mjs';
import { statusText } from './approve.mjs';
import { stripComments } from './index.mjs';
import { stackLine } from './stack.mjs';

// Bundle for /telos:quick (SPEC §5.3): enough to make a small change safely, no plan.

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

/** Bundle for /telos:quick <description>. */
export function quickBundle({ root, args }) {
  const change = args.join(' ').trim();
  if (!change) return 'REFUSED: describe the change: /telos:quick <description>';
  const cfg = loadConfig(root);
  const projectPath = join(telosDir(root), 'PROJECT.md');
  const project = sections(stripComments(existsSync(projectPath) ? readFileSync(projectPath, 'utf8') : ''));
  const rules = listItems(project.get('Rules'));
  const checks = QUICK_CHECKS.filter((k) => cfg.checks?.[k]).map((k) => `${k}=${cfg.checks[k]}`);
  // 04: area-matched LESSONS and delete-zone approach lines plug in here (02:D-09).
  return [
    `Change: ${change}`,
    currentLine(root),
    rules.length ? ['Rules:', ...rules.map((r) => `- ${r}`)].join('\n') : 'Rules: none',
    stackLine(root, cfg),
    `Checks: ${checks.join(' · ') || 'none'}`,
    treeLines(root),
    'Size: ≤ ~5 files and < 1 hour; larger → stop and suggest /telos:plan',
  ].join('\n');
}
