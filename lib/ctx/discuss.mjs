import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { atLeast, load as loadConfig, requireMessage } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { telosDir } from '../repo.mjs';
import { phaseLine } from '../roadmap.mjs';
import { getLine, getList } from '../status.mjs';
import { listItems, phaseDir, phaseTasks, sections } from '../tasks.mjs';
import { render } from '../template.mjs';
import { indexLine, statusPhase, statusText } from './approve.mjs';
import { stripComments } from './index.mjs';

// Bundle for /telos:discuss (SPEC §4.3.2, §5.2): the target phase, its CONTEXT (or the skeleton
// to create) and what the decision gates of approve/do will see. Read-only.

const MODES = {
  planned: 'Mode: write — create or extend the CONTEXT; plan the phase afterwards with /telos:plan <NN>.',
  drafted: 'Mode: drafted — draft tasks exist: update the CONTEXT, then propagate changes with /telos:revise <notes>.',
  active: 'Mode: active — approved tasks rely on this CONTEXT: never rewrite or replace an existing D-NN; '
    + 'add new choices as [proposed] and new Q-NN only; plan changes go through /telos:revise <notes>.',
};

/** @returns {string} `D-NN` / `Q-NN` after the highest one used in `text` */
function nextId(text, kind) {
  const used = [...text.matchAll(new RegExp(`\\b${kind}-(\\d{2})\\b`, 'g'))].map((m) => Number(m[1]));
  return `${kind}-${String(Math.max(0, ...used) + 1).padStart(2, '0')}`;
}

function projectLines(root) {
  const path = join(telosDir(root), 'PROJECT.md');
  const project = sections(existsSync(path) ? stripComments(readFileSync(path, 'utf8')) : '');
  const purpose = (project.get('Purpose') ?? '').split('\n').find((l) => l.trim()) ?? 'none';
  const rules = listItems(project.get('Rules'));
  return [`Purpose: ${purpose.trim()}`, rules.length ? ['Rules:', ...rules.map((r) => `- ${r}`)].join('\n') : 'Rules: none'];
}

/** Bundle for /telos:discuss: STATUS phase by default, or `NN` (the skill's validated follow-up). */
export function discussBundle({ root, args }) {
  if (args.length > 1 || (args.length && !/^\d{2}$/.test(args[0]))) throw new UsageError('usage: ctx discuss [NN]');
  const cfg = loadConfig(root);
  if (!atLeast(cfg, 'standard')) return requireMessage('standard');
  const nn = args[0] ?? statusPhase(root);
  if (!nn) return 'REFUSED: no phase in STATUS; pass NN';
  const phase = phaseLine(root, nn);
  if (!phase) return `REFUSED: no phase ${nn} in ROADMAP; add it with /telos:plan <description>`;
  if (!MODES[phase.status]) return `REFUSED: phase ${phase.name} is ${phase.status}; discuss a new phase instead`;

  const dir = phaseDir(root, nn) ?? join(telosDir(root), 'phases', phase.name);
  const path = join(dir, `${nn}-CONTEXT.md`);
  const shown = relative(root, path).split(/[\\/]/).join('/');
  const raw = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const body = stripComments(raw ?? render('CONTEXT.md', { nn, title: phase.name.slice(3) })).trim();

  const tasks = phaseTasks(root, nn);
  const refs = new Map();
  for (const task of tasks) for (const d of task.meta.decisions ?? []) refs.set(d, [...(refs.get(d) ?? []), task.id]);
  const carry = getList(statusText(root), 'carry').filter((item) => item.startsWith(`${nn}: `)).map((item) => `- ${item.slice(4)}`);

  return [
    `Profile: ${cfg.profile}`,
    `Target: ${phase.name} [${phase.status}] ${phase.goal} · done when: ${phase.done}`,
    MODES[phase.status],
    `Context: ${shown} (${raw === null ? 'missing: create it from the skeleton below, ≤ 60 lines' : `${raw.trimEnd().split('\n').length} lines`})`,
    `Next IDs: ${nextId(raw ?? '', 'D')} · ${nextId(raw ?? '', 'Q')}`,
    `Referenced: ${refs.size ? [...refs].map(([d, ids]) => `${d} ← ${ids.join(', ')}`).join(' · ') : 'none'}`,
    `Awaiting user: ${getLine(statusText(root), 'Awaiting user') || 'none'}`,
    ...projectLines(root),
    [`Carry-over for ${nn}:`, ...(carry.length ? carry : ['- none'])].join('\n'),
    ['Tasks:', ...(tasks.length ? tasks.map(indexLine) : ['- none'])].join('\n'),
    raw === null ? `Skeleton:\n${body}` : `Context:\n${body}`,
  ].join('\n');
}
