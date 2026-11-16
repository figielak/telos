import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadConfig } from '../config.mjs';
import { deleteZoneEntries } from '../history.mjs';
import { checklist, listItems, phaseSkeleton, sections, shown } from '../phases.mjs';
import { telosDir } from '../repo.mjs';
import { phaseLine, phaseLines } from '../roadmap.mjs';
import { getList, statusPhase, statusText } from '../status.mjs';
import { stripComments } from './index.mjs';
import { stackLine } from './stack.mjs';

// Bundle for /telos:plan: what a one-file phase plan needs — the target phase, PROJECT Purpose and
// Rules, stack, checks, removed approaches, MAP §Find and the roadmap. Read-only. Most needed
// first: cap() cuts from the end, where the roadmap stands.

const ROADMAP_LINE = 160;

const read = (root, file) => {
  const path = join(telosDir(root), file);
  return existsSync(path) ? stripComments(readFileSync(path, 'utf8')) : '';
};

/** @returns {string[]} Purpose line 1 and the Rules list of PROJECT.md */
function projectLines(root) {
  const project = sections(read(root, 'PROJECT.md'));
  const purpose = (project.get('Purpose') ?? '').split('\n').find((l) => l.trim()) ?? 'none';
  const rules = listItems(project.get('Rules'));
  return [`Purpose: ${purpose.trim()}`, rules.length ? ['Rules:', ...rules.map((r) => `- ${r}`)].join('\n') : 'Rules: none'];
}

/** @returns {string} Delete-zone approaches, one per line */
function approachLines(root) {
  let found;
  try {
    found = deleteZoneEntries(root).filter((e) => e.approach !== undefined);
  } catch (err) {
    return `Removed approaches: unavailable (${err.message})`;
  }
  return ['Removed approaches (never plan these):',
    ...(found.length ? found.map((e) => `- ${e.approach} — ${e.reason} (${e.ref})`) : ['- none'])].join('\n');
}

/** @returns {string} the `## Find` lines of MAP.md, or a pointer when the map has none */
function findLines(root) {
  const find = listItems(sections(read(root, 'MAP.md')).get('Find'));
  return find.length ? ['Find (MAP):', ...find.map((l) => `- ${l}`)].join('\n') : 'Find (MAP): none (run /telos:map)';
}

/** @returns {string} the phase file state, plus the skeleton to start from when it is missing */
function phaseFile(root, nn) {
  const plan = checklist(root, nn);
  if (!plan.path) return 'Phase file: none (add the phase to ROADMAP first)';
  const path = shown(root, plan.path);
  if (plan.exists) return `Phase file: ${path} (exists, ${plan.done}/${plan.total} done; edit it in place)`;
  return `Phase file: ${path} (missing; write it from this skeleton)\n${stripComments(phaseSkeleton(root, nn)).trim()}`;
}

/** Bundle for /telos:plan: STATUS phase by default, or `NN`, or a description of a new phase. */
export function planBundle({ root, args }) {
  const cfg = loadConfig(root);
  const arg = args.join(' ').trim();
  const phases = phaseLines(root);
  const next = String(Math.max(0, ...phases.map((p) => Number(p.nn))) + 1).padStart(2, '0');

  let nn = null;
  let target;
  if (/^\d{2}$/.test(arg)) nn = arg;
  else if (!arg) nn = statusPhase(root);
  const phase = nn && phaseLine(root, nn);
  if (phase) target = `${phase.name} [${phase.status}] ${phase.goal} · done when: ${phase.done}`;
  else if (nn) target = `${nn} (no ROADMAP line)`;
  else if (arg) target = `new phase "${arg}" → ${next} (add it with telos roadmap add <name> "<goal>" "<done when>")`;
  else target = 'none (pass a phase NN or a description)';

  const carry = phase ? getList(statusText(root), 'carry').filter((i) => i.startsWith(`${nn}: `)) : [];
  const roadmap = phases.map((p) => {
    const line = `- ${p.name} [${p.status}] ${p.goal}`;
    return line.length > ROADMAP_LINE ? `${line.slice(0, ROADMAP_LINE - 1)}…` : line;
  });
  const checks = Object.entries(cfg.checks);
  return [
    `Target: ${target}`,
    ...(arg ? [] : [`New phase: ${next}`]),
    ...(phase ? [phaseFile(root, nn)] : []),
    ...(carry.length ? [['Carry-over:', ...carry.map((i) => `- ${i.slice(4)}`)].join('\n')] : []),
    ...projectLines(root),
    stackLine(root, cfg),
    `Checks: ${checks.length ? checks.map(([k, v]) => `${k}=${v}`).join(' · ') : 'none'}`,
    `Auto-commit: ${cfg.git.auto_commit ? 'yes' : 'no'}`,
    approachLines(root),
    findLines(root),
    ['Roadmap:', ...(roadmap.length ? roadmap : ['- none'])].join('\n'),
  ].join('\n');
}
