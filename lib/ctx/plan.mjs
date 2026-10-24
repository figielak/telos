import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadConfig } from '../config.mjs';
import { telosDir } from '../repo.mjs';
import { phaseLine } from '../roadmap.mjs';
import { getList } from '../status.mjs';
import { listItems, phaseDir, phaseTasks, sections } from '../tasks.mjs';
import { excerpt, stripComments } from './index.mjs';
import { indexLine, statusPhase, statusText } from './approve.mjs';
import { stackLine } from './stack.mjs';

// Bundle for /telos:plan and /telos:revise (SPEC §5.2). Lessons and delete-zone lines are
// phase 04 (02:D-09).

const FORMAT = 'Format: create tasks with `telos task new <NN> <slug> "<title>"`, then fill them. '
  + 'Normal ≤ 80 lines; effort: hard or critical: true → ≤ 140 lines plus Interface and Edge cases. '
  + 'Sections: Goal, Read first, Files, Constraints, Tests (type code, written first), Steps, Acceptance, Result. '
  + 'scope required (audit: [".telos/"]), Files ⊆ scope, Acceptance has a `cmd` → exit N item '
  + '(code: also "all listed tests pass"). Check with `telos lint-plan <NN>`.';

const read = (root, file) => {
  const path = join(telosDir(root), file);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

/** @returns {string[]} Purpose line 1 and the Rules list of PROJECT.md */
function projectLines(root) {
  const project = sections(stripComments(read(root, 'PROJECT.md')));
  const purpose = (project.get('Purpose') ?? '').split('\n').find((l) => l.trim()) ?? 'none';
  const rules = listItems(project.get('Rules'));
  return [`Purpose: ${purpose.trim()}`, rules.length ? ['Rules:', ...rules.map((r) => `- ${r}`)].join('\n') : 'Rules: none'];
}

function checksLine(cfg) {
  const entries = Object.entries(cfg.checks ?? {});
  return `Checks: ${entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(' · ') : 'none'}`;
}

/** Bundle for /telos:plan [NN|description] and /telos:revise. */
export function planBundle({ root, args }) {
  const cfg = loadConfig(root);
  const arg = args.join(' ').trim();
  const roadmap = stripComments(read(root, 'ROADMAP.md')).split('\n').filter((l) => /^(- |## )/.test(l));
  const highest = Math.max(0, ...roadmap.map((l) => Number(/^- (\d{2})-/.exec(l)?.[1] ?? 0)));

  let nn = null;
  let target;
  if (/^\d{2}$/.test(arg)) nn = arg;
  else if (!arg) nn = statusPhase(root);
  if (nn) {
    const phase = phaseLine(root, nn);
    target = phase ? `${phase.name} [${phase.status}] ${phase.goal} · done when: ${phase.done}` : `${nn} (no ROADMAP line)`;
  } else if (arg) {
    nn = String(highest + 1).padStart(2, '0');
    target = `new phase "${arg}" → ${nn} (add it with telos roadmap add <name> "<goal>" "<done when>")`;
  } else {
    target = 'none (pass a phase NN or a description)';
  }

  const carry = getList(statusText(root), 'carry')
    .map((item, i) => ({ item, n: i + 1 })).filter(({ item }) => nn && item.startsWith(`${nn}: `))
    .map(({ item, n }) => `- #${n} ${item.slice(4)}`);
  const tasks = nn ? phaseTasks(root, nn) : [];
  const dir = nn ? phaseDir(root, nn) : null;
  const contextPath = dir && join(dir, `${nn}-CONTEXT.md`);

  // Most needed first: cap() cuts from the end, and CONTEXT can still be read from its file.
  return [
    `Profile: ${cfg.profile}`,
    `Target: ${target}`,
    ...projectLines(root),
    stackLine(root, cfg),
    checksLine(cfg),
    ...(nn ? [[`Carry-over for ${nn}:`, ...(carry.length ? carry : ['- none'])].join('\n')] : []),
    ['Tasks:', ...(tasks.length ? tasks.map(indexLine) : ['- none'])].join('\n'),
    FORMAT,
    ['Roadmap:', ...(roadmap.length ? roadmap : ['- none'])].join('\n'),
    ...(contextPath && existsSync(contextPath)
      ? [`Context (.telos/phases/${dir.split(/[\\/]/).pop()}/${nn}-CONTEXT.md):\n${excerpt(contextPath).trim()}`] : []),
  ].join('\n');
}
