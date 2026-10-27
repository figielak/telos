import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { acceptanceItems } from '../accept.mjs';
import { atLeast, load as loadConfig, requireMessage } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { HistoryError, readHistory } from '../history.mjs';
import { phaseLine } from '../roadmap.mjs';
import { getLine } from '../status.mjs';
import { phaseDir, phaseTasks } from '../tasks.mjs';
import { indexLine, statusPhase, statusText } from './approve.mjs';
import { stripComments } from './index.mjs';

// Bundles for /telos:check and /telos:done (SPEC §5, §7): the phase's tasks with their
// acceptance pointers, the full checks, unresolved decisions and what HISTORY already holds.
// Read-only; the skills run `telos check`, `telos accept` and the state changes themselves.

const FULL = ['build', 'types', 'lint', 'test'];

/** @typedef {{ id: string, text: string, proposed: boolean, marked: boolean }} Decision */

/** @returns {{ decisions: Decision[], questions: string[] }} from the phase's `NN-CONTEXT.md` */
function contextState(root, nn) {
  const dir = phaseDir(root, nn);
  const path = dir && join(dir, `${nn}-CONTEXT.md`);
  if (!path || !existsSync(path)) return { decisions: [], questions: [] };
  const text = stripComments(readFileSync(path, 'utf8'));
  const decisions = [...text.matchAll(/^- (D-\d{2})( \[proposed\])?: (.+)$/gm)].map((m) => ({
    id: m[1], text: m[3].trim(), proposed: Boolean(m[2]), marked: /→ (?:HISTORY|ADR \d{3})\s*$/.test(m[3]),
  }));
  const questions = [...text.matchAll(/^- (Q-\d{2}):/gm)].map((m) => m[1]);
  return { decisions, questions };
}

/** @returns {{ phase?: { date: string }, decisions: Set<string>, error?: string }} phase NN entries of the live Log */
function historyState(root, nn) {
  try {
    const log = readHistory(root).log.filter((e) => e.ref === nn);
    const phase = log.find((e) => e.kind === 'phase');
    const decisions = new Set(log.filter((e) => e.kind === 'decision').map((e) => /^(D-\d{2}):/.exec(e.text)?.[1]).filter(Boolean));
    return { phase, decisions };
  } catch (err) {
    if (!(err instanceof HistoryError)) throw err;
    return { decisions: new Set(), error: err.message };
  }
}

function acceptanceNote(task) {
  const items = acceptanceItems(task.sections.get('Acceptance'));
  const commands = items.filter((i) => i.cmd !== undefined).length;
  return `acceptance: ${commands} command${commands === 1 ? '' : 's'}, ${items.length - commands} manual`;
}

/**
 * Shared phase report. `close` adds the close verdict, decision promotion state and commit policy.
 * @returns {string} bundle text, or a `REFUSED: …` / profile line
 */
export function phaseReport({ root, args }, { close }) {
  if (args.length > 1 || (args.length && !/^\d{2}$/.test(args[0]))) {
    throw new UsageError(`usage: ctx ${close ? 'done' : 'check'} [NN]`);
  }
  const cfg = loadConfig(root);
  if (!atLeast(cfg, 'standard')) return requireMessage('standard');
  const nn = args[0] ?? statusPhase(root);
  if (!nn) return 'REFUSED: no phase in STATUS; pass NN';
  const phase = phaseLine(root, nn);
  if (!phase) return `REFUSED: no phase ${nn} in ROADMAP`;
  const tasks = phaseTasks(root, nn);
  if (!tasks.length) return `REFUSED: phase ${nn} has no task files; run /telos:plan ${nn}`;
  const history = historyState(root, nn);
  if (close && phase.status === 'done') {
    return `REFUSED: phase ${phase.name} is already done (phase entry ${history.phase ? 'recorded' : 'missing'}); `
      + 'nothing to close again — reopening is /telos:undo';
  }
  if (close && phase.status !== 'active') return `REFUSED: phase ${phase.name} is ${phase.status}, not active`;

  const done = tasks.filter((t) => t.meta.status === 'done');
  const notDone = tasks.filter((t) => t.meta.status !== 'done');
  const checks = FULL.filter((k) => cfg.checks[k]).map((k) => `${k}=${cfg.checks[k]}`);
  // D-02: deep critical code requires a configured e2e, run by the same targeted full check.
  const e2e = atLeast(cfg, 'deep') ? tasks.filter((t) => t.meta.type === 'code' && t.meta.critical === true).map((t) => t.id) : [];
  const e2eMissing = e2e.length > 0 && !cfg.checks.e2e;
  const { decisions, questions } = contextState(root, nn);
  const awaiting = getLine(statusText(root), 'Awaiting user').split(',').map((s) => s.trim())
    .filter((s) => s.startsWith(`${nn}:`));
  const unresolved = [
    ...decisions.filter((d) => d.proposed).map((d) => `- ${d.id} is proposed`),
    ...questions.map((q) => `- ${q} is open`),
    ...awaiting.map((a) => `- ${a} awaits the user`),
  ];

  const lines = [
    `Profile: ${cfg.profile}`,
    `Target: ${phase.name} [${phase.status}] ${phase.goal} · done when: ${phase.done}`,
    ['Tasks:', ...tasks.map((t) => `${indexLine(t)} · ${acceptanceNote(t)}`)].join('\n'),
    `Accept: ${done.length ? done.map((t) => `telos accept ${t.id}`).join(' · ') : 'none (no done task)'}`,
    ...(!close && notDone.length ? [`Not done (skipped): ${notDone.map((t) => t.id).join(', ')}`] : []),
    `Full checks (telos check --level full --phase ${nn}): ${checks.length ? checks.join(' · ') : 'none configured — UNVERIFIED'}`,
    ...(e2e.length ? [`E2E: required for critical code ${e2e.join(', ')}${e2eMissing
      ? ' — checks.e2e not configured (UNVERIFIED)' : `: e2e=${cfg.checks.e2e}`}`] : []),
    unresolved.length ? ['Unresolved:', ...unresolved].join('\n') : 'Unresolved: none',
    'Manual items: every Acceptance item without a command must be checked by hand; accept PASS does not prove them.',
  ];
  if (!close) return lines.join('\n');

  const promotion = (d) => {
    if (d.proposed) return '[proposed]';
    if (d.marked) return '[promoted]';
    return history.decisions.has(d.id) ? '[in HISTORY; add → HISTORY to CONTEXT]' : '[candidate]';
  };
  const blockers = [
    ...notDone.map((t) => `- ${t.id} is ${t.meta.status ?? '?'}, not done`),
    ...unresolved,
    ...(checks.length ? [] : ['- no full checks configured (UNVERIFIED)']),
    ...(e2eMissing ? [`- e2e required for critical code ${e2e.join(', ')} but checks.e2e is not configured (UNVERIFIED)`] : []),
    ...(history.error ? [`- HISTORY.md is unreadable: ${history.error}`] : []),
  ];
  return [
    ...lines,
    history.error ? `History: unavailable (${history.error})`
      : `History: phase entry ${history.phase ? `recorded (${history.phase.date})` : 'missing'}`,
    ['Decisions:', ...(decisions.length ? decisions.map((d) => `- ${d.id}: ${d.text} ${promotion(d)}`) : ['- none'])].join('\n'),
    `Auto-commit: ${cfg.git.auto_commit ? 'yes' : 'no'}`,
    blockers.length ? ['Close: blocked', ...blockers].join('\n') : 'Close: ready',
  ].join('\n');
}

/** Bundle for /telos:check: verify a phase (STATUS phase by default) without closing it. */
export const checkBundle = (ctx) => phaseReport(ctx, { close: false });
