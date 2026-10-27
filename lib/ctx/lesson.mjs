import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { atLeast, load as loadConfig, requireMessage } from '../config.mjs';
import { LIMIT, formatLesson, readLessons } from '../lessons.mjs';
import { telosDir } from '../repo.mjs';
import { getLine } from '../status.mjs';
import { listItems, sections } from '../tasks.mjs';
import { statusText } from './approve.mjs';
import { stripComments } from './index.mjs';

// Bundle for /telos:lesson (SPEC §4.1): default ref, list occupancy, every numbered entry,
// malformed lines and PROJECT Conventions (the promotion target). The lesson itself stays in
// the skill body. Read-only; Conventions come last, so cap() cuts there, never a lesson.

const FULL = ' (full: never add a 21st; propose promoting one to PROJECT.md §Conventions '
  + 'or dropping a stale one and let the user choose)';

export function lessonBundle({ root }) {
  const cfg = loadConfig(root);
  if (!atLeast(cfg, 'standard')) return requireMessage('standard');
  const { exists, entries, problems } = readLessons(root);
  if (!exists) return `REFUSED: .telos/LESSONS.md is missing; restore it with \`telos profile ${cfg.profile}\``;

  const task = getLine(statusText(root), 'Task');
  const ref = /^\d{2}-\d{2}$/.test(task) ? `${task} (STATUS task)` : 'quick (no STATUS task)';
  const projectPath = join(telosDir(root), 'PROJECT.md');
  const project = sections(existsSync(projectPath) ? stripComments(readFileSync(projectPath, 'utf8')) : '');
  const conventions = listItems(project.get('Conventions'));

  return [
    `Profile: ${cfg.profile}`,
    `Ref: ${ref}`,
    `Lessons: ${entries.length}/${LIMIT}${entries.length >= LIMIT ? FULL : ''}`,
    ...entries.map((e, i) => `L${i + 1} (line ${e.line}) ${formatLesson(e).slice(2)}`),
    ...(problems.length ? ['Malformed:', ...problems.map((p) => `- line ${p.line}: ${p.reason}: ${p.raw}`)] : []),
    ['Conventions (PROJECT.md §Conventions):', ...(conventions.length ? conventions.map((c) => `- ${c}`) : ['- none'])].join('\n'),
  ].join('\n');
}
