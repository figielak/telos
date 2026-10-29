import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { acceptanceItems } from '../accept.mjs';
import { atLeast, load as loadConfig, requireMessage } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { HistoryError, readHistory } from '../history.mjs';
import { ReviewError, reviewEvidence } from '../review.mjs';
import { phaseLine } from '../roadmap.mjs';
import { getLine } from '../status.mjs';
import { phaseDir, phaseTasks } from '../tasks.mjs';
import { indexLine, statusPhase, statusText } from './approve.mjs';
import { CAP, stripComments } from './index.mjs';

// Bundles for /telos:check and /telos:done (SPEC §5, §7): the phase's tasks with their
// acceptance pointers, the full checks, unresolved decisions and what HISTORY already holds.
// Read-only; the skills run `telos check`, `telos accept` and the state changes themselves.

const FULL = ['build', 'types', 'lint', 'test'];
const REVIEW_LINE = /^Review: (PASS WITH NOTES|PASS|CHANGES REQUESTED|UNVERIFIED)\b.*?EvidenceId (\S+)/m;

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
 * D-01/D-02: recorded RED/GREEN and review evidence of a deep critical code task. A task review is
 * reused only with a passing verdict whose EvidenceId equals the task's current complete evidence.
 * @returns {{ id: string, red: boolean, green: boolean, reusable: boolean, line: string }}
 */
function criticalEvidence(root, task) {
  const result = stripComments(task.sections.get('Result') ?? '');
  const red = /^RED: \S/m.test(result);
  const green = /^GREEN: \S/m.test(result);
  const review = REVIEW_LINE.exec(result);
  let reusable = false;
  let state = 'missing';
  if (review) {
    const [, verdict, id] = review;
    if (verdict.startsWith('PASS')) {
      let current = null;
      try { current = reviewEvidence(root, task.id); } catch (err) { if (!(err instanceof ReviewError)) throw err; }
      reusable = Boolean(current?.complete) && current.evidenceId === id;
      state = `${verdict} EvidenceId ${id} — ${reusable ? 'current' : 'stale or unavailable'}`;
    } else state = `${verdict} EvidenceId ${id} — not reusable`;
  }
  const seen = (ok) => (ok ? 'recorded' : 'missing');
  return { id: task.id, red, green, reusable, line: `- ${task.id}: RED ${seen(red)} · GREEN ${seen(green)} · review ${state}` };
}

/** Over the cap, the task list and per-task evidence shrink to ids so verdicts and blockers stay whole. */
function fitReport(parts, tasks, evidence) {
  const text = () => parts.filter((p) => p !== null).join('\n');
  if (text().length <= CAP) return text();
  const byStatus = new Map();
  for (const t of tasks) byStatus.set(t.meta.status ?? '?', [...(byStatus.get(t.meta.status ?? '?') ?? []), t.id]);
  parts[parts.indexOf(parts.find((p) => p?.startsWith('Tasks:\n')))] = `Tasks: ${tasks.length} (compacted for the cap): `
    + [...byStatus].map(([status, ids]) => `${status} ${ids.join(' ')}`).join('; ');
  const at = parts.findIndex((p) => p?.startsWith('Critical evidence'));
  if (text().length > CAP && at >= 0) {
    const ids = (pick) => evidence.filter(pick).map((e) => e.id).join(' ') || 'none';
    parts[at] = `Critical evidence (compacted): RED missing ${ids((e) => !e.red)} · GREEN missing ${ids((e) => !e.green)} · review reusable ${ids((e) => e.reusable)}`;
  }
  return text();
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
  const deep = atLeast(cfg, 'deep');
  const evidence = deep ? tasks.filter((t) => e2e.includes(t.id)).map((t) => criticalEvidence(root, t)) : [];
  const deepLines = deep ? [
    'Deep close: targeted full/e2e checks + acceptance → review → doc-sync → reverify → promote/record',
    evidence.length ? ['Critical evidence (from Result; accept PASS proves none of it):', ...evidence.map((e) => e.line)].join('\n') : null,
    !evidence.length ? 'Review: none required (no critical code tasks)'
      : evidence.every((e) => e.reusable) ? 'Review: reuse — every critical code task has current complete review evidence; no new review'
        : `Review: one phase review — run \`telos ctx review ${nn}\` and \`telos ctx shared review\`, then the agent telos:reviewer-hard once with both outputs`,
    `Doc-sync: \`telos docs-scan ${nn}\` · \`telos changelog ${nn}\` · docs readme=${cfg.docs.readme}, paths=${cfg.docs.paths.join(', ') || 'none'}`
      + ` · changelog=${cfg.docs.changelog} (≤ 10 entry lines under a version or date heading)`,
  ] : [];
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
    ...deepLines,
  ];
  if (!close) return fitReport(lines, tasks, evidence);

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
    ...evidence.flatMap((e) => [
      ...(e.red ? [] : [`- ${e.id}: no recorded RED evidence in Result (UNVERIFIED; accept PASS does not prove it)`]),
      ...(e.green ? [] : [`- ${e.id}: no recorded GREEN/e2e evidence in Result (UNVERIFIED)`]),
    ]),
  ];
  return fitReport([
    ...lines,
    history.error ? `History: unavailable (${history.error})`
      : `History: phase entry ${history.phase ? `recorded (${history.phase.date})` : 'missing'}`,
    ['Decisions:', ...(decisions.length ? decisions.map((d) => `- ${d.id}: ${d.text} ${promotion(d)}`) : ['- none'])].join('\n'),
    `Auto-commit: ${cfg.git.auto_commit ? 'yes' : 'no'}`,
    blockers.length ? ['Close: blocked', ...blockers].join('\n') : 'Close: ready',
  ], tasks, evidence);
}

/** Bundle for /telos:check: verify a phase (STATUS phase by default) without closing it. */
export const checkBundle = (ctx) => phaseReport(ctx, { close: false });
