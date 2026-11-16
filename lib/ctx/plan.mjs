import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { areasFor, loadAreas, repoPath } from '../areas.mjs';
import { load as loadConfig } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { deleteZoneEntries } from '../history.mjs';
import { checklist, listItems, phaseSkeleton, sections, shown } from '../phases.mjs';
import { telosDir } from '../repo.mjs';
import { phaseLine, phaseLines } from '../roadmap.mjs';
import { getList, statusPhase, statusText } from '../status.mjs';
import { CAP, stripComments } from './index.mjs';
import { stackLine } from './stack.mjs';

// Bundle for /telos:plan: what a one-file phase plan needs — the target phase, PROJECT Purpose and
// Rules, stack, checks, removed approaches, the MAP index, the area files `--area <path>` selects
// (11-04) and the roadmap. Read-only. Most needed first: cap() cuts from the end, where the roadmap
// stands. With `--area` the area files come before the roadmap in the budget too: they are added
// whole while the bundle stays within CAP (the rest as pointers), and the roadmap keeps the rows
// that still fit, nearest to the target phase first.

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

/** @returns {string} the MAP index (Structure, Areas, Find) without its title, or a pointer when not built */
function indexLines(root) {
  const map = sections(read(root, 'MAP.md'));
  const body = ['Structure', 'Areas', 'Find'].filter((name) => listItems(map.get(name)).length)
    .map((name) => `## ${name}\n${map.get(name).trim()}`);
  return body.length ? ['Map index (.telos/MAP.md):', ...body].join('\n') : 'Map index: none (run /telos:map)';
}

/** Split `--area <path>` selectors from the phase argument. */
function parseArgs(args) {
  const rest = [], selectors = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--area') { rest.push(args[i]); continue; }
    const path = args[++i];
    if (path === undefined || path.startsWith('--')) throw new UsageError('--area needs a path');
    selectors.push(path);
  }
  return { rest, selectors };
}

/**
 * Area files matching the selectors: whole while `budget` chars allow, then `Read …` pointers.
 * @returns {string} '' without selectors
 */
function areaLines(root, cwd, selectors, budget) {
  if (!selectors.length) return '';
  const paths = selectors.map((p) => repoPath(root, cwd, p));
  const areas = loadAreas(root);
  const names = areasFor(areas, paths);
  const head = `Areas for ${paths.join(', ')}: ${names.join(', ') || 'none'}`;
  const parts = [head];
  let used = head.length + 1;
  for (const name of names) {
    const area = areas.find((a) => a.name === name);
    const whole = `--- area ${name} · paths: ${area.header.paths.join(', ')}\n${stripComments(area.text).trim()}\n--- end ${name}`;
    const pointer = `Read ${area.rel}`;
    const part = used + whole.length + 1 <= budget ? whole : pointer;
    parts.push(part);
    used += part.length + 1;
  }
  return parts.join('\n');
}

/**
 * Roadmap rows that fit `budget` chars, nearest to row `at` first; the rest as one count line.
 * @param {string[]} rows @param {number} at index of the target phase @param {number} budget
 */
function roadmapLines(rows, at, budget) {
  const whole = ['Roadmap:', ...(rows.length ? rows : ['- none'])].join('\n');
  if (whole.length <= budget) return whole;
  const more = (n) => `(${n} more in .telos/ROADMAP.md)`;
  const order = rows.map((_, i) => i).sort((a, b) => Math.abs(a - at) - Math.abs(b - at) || b - a);
  const kept = new Set();
  let used = 'Roadmap:'.length + 1 + more(rows.length).length;
  for (const i of order) {
    if (used + rows[i].length + 1 > budget) break;
    kept.add(i);
    used += rows[i].length + 1;
  }
  return ['Roadmap:', ...rows.filter((_, i) => kept.has(i)), more(rows.length - kept.size)].join('\n');
}

/** @returns {string} the phase file state, plus the skeleton to start from when it is missing */
function phaseFile(root, nn) {
  const plan = checklist(root, nn);
  if (!plan.path) return 'Phase file: none (add the phase to ROADMAP first)';
  const path = shown(root, plan.path);
  if (plan.exists) return `Phase file: ${path} (exists, ${plan.done}/${plan.total} done; edit it in place)`;
  return `Phase file: ${path} (missing; write it from this skeleton)\n${stripComments(phaseSkeleton(root, nn)).trim()}`;
}

/**
 * Bundle for /telos:plan: STATUS phase by default, or `NN`, or a description of a new phase;
 * `--area <path>` (repeatable) adds the matching area files.
 */
export function planBundle({ root, cwd = root, args }) {
  const cfg = loadConfig(root);
  const { rest, selectors } = parseArgs(args);
  const arg = rest.join(' ').trim();
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
  const before = [
    `Target: ${target}`,
    ...(arg ? [] : [`New phase: ${next}`]),
    ...(phase ? [phaseFile(root, nn)] : []),
    ...(carry.length ? [['Carry-over:', ...carry.map((i) => `- ${i.slice(4)}`)].join('\n')] : []),
    ...projectLines(root),
    stackLine(root, cfg),
    `Checks: ${checks.length ? checks.map(([k, v]) => `${k}=${v}`).join(' · ') : 'none'}`,
    `Auto-commit: ${cfg.git.auto_commit ? 'yes' : 'no'}`,
    approachLines(root),
    indexLines(root),
  ].join('\n');
  if (!selectors.length) return [before, roadmapLines(roadmap, 0, Infinity)].join('\n');
  // Selected areas outrank the roadmap: reserve only its heading, the target row and the count line.
  const open = phases.findIndex((p) => (nn ? p.nn === nn : !['done', 'dropped'].includes(p.status)));
  const at = open < 0 ? Math.max(0, roadmap.length - 1) : open;
  const reserve = roadmapLines(roadmap, at, 0).length + (roadmap[at]?.length ?? 0) + 1;
  const areas = areaLines(root, cwd, selectors, CAP - before.length - reserve - 2);
  return [before, areas, roadmapLines(roadmap, at, CAP - before.length - areas.length - 2)].join('\n');
}
