import { createHash } from 'node:crypto';

import { UsageError } from '../../lib/errors.mjs';
import { VARIANTS } from './manifest.mjs';

// Run matrix (bench/PROTOCOL.md §6.1, §7.1): cells are task × variant × repetition, grouped in
// (task, rep) blocks. Orders come from sha256(seed, key) sort keys, not from a stateful generator,
// so filters, `reps` and resume never change the relative order of the cells that remain.

const PROFILE = { C: 'deep', D: 'standard' };
const sortKey = (...parts) => createHash('sha256').update(parts.join('\0')).digest('hex');
const byKey = (key) => (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
const list = (value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]);

/** Setup cell key: one snapshot per (repo, start commit, profile). */
export const setupKey = (repo, start, profile) => `${repo}.${start}.${profile}`;

/**
 * @param {{repos: object[], tasks: object[], repetitions: number}} manifest from loadManifest
 * @param {{seed: string, reps?: number, only?: string[], variant?: string|string[], done?: Iterable<string>}} opts
 * @returns {{cells: object[], setups: object[], queue: {kind: 'setup'|'cell', id: string}[]}}
 *   `cells` in run order (skipping `done`), `setups` needed by them, `queue` interleaving each setup before its first cell.
 */
export function expandMatrix(manifest, opts = {}) {
  const { seed, done } = opts;
  if (seed === undefined || seed === '') throw new UsageError('expandMatrix: seed is required');
  const reps = opts.reps ?? manifest.repetitions;
  if (!Number.isInteger(reps) || reps < 1) throw new UsageError(`reps must be a positive integer (${reps})`);
  const only = list(opts.only);
  const variants = list(opts.variant) ?? VARIANTS;
  for (const id of only ?? []) if (!manifest.tasks.some((t) => t.id === id)) throw new UsageError(`unknown task in only: ${id}`);
  for (const v of variants) if (!VARIANTS.includes(v)) throw new UsageError(`unknown variant ${v}; use ${VARIANTS.join(', ')}`);
  const skip = new Set(done ?? []);

  const blocks = manifest.tasks
    .filter((t) => !only || only.includes(t.id))
    .flatMap((task) => Array.from({ length: reps }, (_, i) => ({ task, rep: i + 1 })))
    .sort(byKey((b) => sortKey(seed, 'block', b.task.id, b.rep)));

  const cells = [];
  for (const { task, rep } of blocks) {
    const order = [...VARIANTS].sort(byKey((v) => sortKey(seed, 'variant', task.id, rep, v)));
    for (const variant of order) {
      if (!variants.includes(variant)) continue;
      const id = `${task.id}.${variant}.${rep}`;
      if (skip.has(id)) continue;
      const profile = PROFILE[variant];
      cells.push({ id, task: task.id, repo: task.repo, variant, rep, setup: profile ? setupKey(task.repo, task.start, profile) : null });
    }
  }

  const setups = [];
  const queue = [];
  const seen = new Set();
  for (const cell of cells) {
    if (cell.setup && !seen.has(cell.setup)) {
      seen.add(cell.setup);
      const task = manifest.tasks.find((t) => t.id === cell.task);
      setups.push({ key: cell.setup, repo: task.repo, start: task.start, profile: PROFILE[cell.variant] });
      queue.push({ kind: 'setup', id: cell.setup });
    }
    queue.push({ kind: 'cell', id: cell.id });
  }
  return { cells, setups, queue };
}
