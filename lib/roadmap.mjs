import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { UsageError } from './errors.mjs';
import { telosDir } from './repo.mjs';

// ROADMAP.md (SPEC §4.1): one line per phase, `- NN-name [status] goal · done when: criterion`.
// Only `telos roadmap` changes it (02:D-03).

export const PHASE_STATUSES = ['planned', 'drafted', 'active', 'done', 'dropped'];

const NN = /^\d{2}$/;
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LINE = /^- ((\d{2})-[a-z0-9-]+) \[([^\]]+)\](?: (.*?))?(?: · done when: (.*))?$/;
const DONE_WHEN = ' · done when: ';

/** A missing phase or ROADMAP.md: the CLI reports it with exit 1. */
export class RoadmapError extends Error {}

const roadmapPath = (root) => join(telosDir(root), 'ROADMAP.md');

function read(root) {
  const path = roadmapPath(root);
  if (!existsSync(path)) throw new RoadmapError('ROADMAP.md not found (not initialized? run /telos:init)');
  return readFileSync(path, 'utf8');
}

/** @typedef {{ nn: string, name: string, status: string, goal: string, done: string }} Phase */

/** @returns {Phase | null} name is the `NN-name` directory name */
function parseLine(line) {
  const m = LINE.exec(line);
  return m && { nn: m[2], name: m[1], status: m[3], goal: m[4] ?? '', done: m[5] ?? '' };
}

/**
 * @param {string} root
 * @param {string} nn phase number
 * @returns {Phase | null} null when ROADMAP.md or the phase is missing
 */
export function phaseLine(root, nn) {
  const path = roadmapPath(root);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8').split('\n').map(parseLine).find((p) => p?.nn === nn) ?? null;
}

function setStatus(root, [nn, status, ...extra]) {
  if (!NN.test(nn ?? '') || extra.length) throw new UsageError('usage: roadmap set <NN> <status>');
  if (!PHASE_STATUSES.includes(status)) {
    throw new UsageError(`unknown status '${status ?? ''}' (allowed: ${PHASE_STATUSES.join(', ')})`);
  }
  const lines = read(root).split('\n');
  const i = lines.findIndex((l) => parseLine(l)?.nn === nn);
  if (i < 0) throw new RoadmapError(`no phase ${nn} in ROADMAP.md`);
  const { name } = parseLine(lines[i]);
  lines[i] = lines[i].replace(/\[[^\]]+\]/, `[${status}]`);
  writeFileSync(roadmapPath(root), lines.join('\n'));
  return `${name} [${status}]`;
}

function addPhase(root, [name, goal, done, ...extra]) {
  if (!NAME.test(name ?? '')) throw new UsageError(`name '${name ?? ''}' must be kebab-case`);
  if (!goal?.trim() || !done?.trim() || extra.length) {
    throw new UsageError('usage: roadmap add <name> "<goal>" "<done when>"');
  }
  if (goal.includes(DONE_WHEN.trim())) throw new UsageError('goal must not contain "done when:"');
  const lines = read(root).split('\n');
  const phases = lines.map(parseLine);
  const nn = Math.max(0, ...phases.filter(Boolean).map((p) => Number(p.nn))) + 1;
  if (nn > 99) throw new RoadmapError('no free phase number');
  const line = `- ${String(nn).padStart(2, '0')}-${name} [planned] ${goal.trim()}${DONE_WHEN}${done.trim()}`;
  const last = phases.findLastIndex(Boolean);
  const none = lines.indexOf('- none');
  if (last >= 0) lines.splice(last + 1, 0, line);
  else if (none >= 0) lines[none] = line;
  else lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, line);
  writeFileSync(roadmapPath(root), lines.join('\n'));
  return line;
}

/** @type {import('./cli.mjs').Command} */
export const roadmapCommand = {
  help: 'set <NN> <status> | add <name> "<goal>" "<done when>"',
  needsTelos: true,
  run({ args, root, stdout, stderr }) {
    const [action, ...rest] = args;
    const actions = { set: setStatus, add: addPhase };
    if (!Object.hasOwn(actions, action ?? '')) throw new UsageError(`unknown action '${action ?? ''}' (set, add)`);
    try {
      stdout.write(`${actions[action](root, rest)}\n`);
      return 0;
    } catch (err) {
      if (!(err instanceof RoadmapError)) throw err;
      stderr.write(`telos roadmap: ${err.message}\n`);
      return 1;
    }
  },
};
