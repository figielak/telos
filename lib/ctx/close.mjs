import { load as loadConfig } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { HistoryError, readHistory } from '../history.mjs';
import { checklist, shown } from '../phases.mjs';
import { phaseLine, phaseLines } from '../roadmap.mjs';
import { statusPhase } from '../status.mjs';

// Bundle for /telos:close: the phase, its unchecked plan items, the configured checks the agent runs
// itself and the exact closing commands. Read-only; the skill runs every command.

/** @returns {{ recorded: boolean, error?: string }} whether HISTORY already holds `phase NN` */
function phaseEntry(root, nn) {
  try {
    return { recorded: readHistory(root).log.some((e) => e.kind === 'phase' && e.ref === nn) };
  } catch (err) {
    if (!(err instanceof HistoryError)) throw err;
    return { recorded: false, error: err.message };
  }
}

const quote = (s) => JSON.stringify(s);

/** Bundle for /telos:close [NN]: STATUS phase by default. */
export function closeBundle({ root, args }) {
  if (args.length > 1 || (args.length && !/^\d{2}$/.test(args[0]))) throw new UsageError('usage: ctx close [NN]');
  const cfg = loadConfig(root);
  const nn = args[0] ?? statusPhase(root);
  if (!nn) return 'REFUSED: no phase in STATUS; pass NN';
  const phase = phaseLine(root, nn);
  if (!phase) return `REFUSED: no phase ${nn} in ROADMAP`;
  if (phase.status === 'done') return `REFUSED: phase ${phase.name} is already done; nothing to close`;
  if (phase.status !== 'active') return `REFUSED: phase ${phase.name} is ${phase.status}, not active`;

  const plan = checklist(root, nn);
  const open = plan.items.filter((i) => !i.done).map((i) => `- [ ] ${i.text}`);
  const checks = Object.entries(cfg.checks);
  const history = phaseEntry(root, nn);
  const next = phaseLines(root).find((p) => p.nn > nn && ['planned', 'drafted'].includes(p.status));
  const blockers = [...open, ...(history.error ? [`- HISTORY.md is unreadable: ${history.error}`] : [])];
  const closing = [
    ...(history.recorded ? [] : [`telos history add phase ${nn} ${quote(`closed ${phase.name}: <evidence for done when>`)}`]),
    `telos roadmap set ${nn} done`,
    `telos status set phase=${next ? next.name : 'none'} task=none ${quote(`next=/telos:plan${next ? ` ${next.nn}` : ''}`)}`,
    `telos status add recent ${quote(`${nn} closed: <one line>`)}`,
  ];
  return [
    `Target: ${phase.name} [${phase.status}] ${phase.goal} · done when: ${phase.done}`,
    `Plan: ${plan.path ? shown(root, plan.path) : 'none'} (${plan.exists ? `${plan.done}/${plan.total} done` : 'missing'})`,
    ['Unfinished:', ...(open.length ? open : ['- none'])].join('\n'),
    `Checks (run each from the repo root; all must exit 0): ${checks.length
      ? checks.map(([k, v]) => `${k}=${v}`).join(' · ') : 'none configured — verify the done-when by hand'}`,
    `History: phase entry ${history.error ? 'unknown' : history.recorded ? 'recorded' : 'missing'}`,
    `Auto-commit: ${cfg.git.auto_commit ? 'yes' : 'no'}`,
    blockers.length ? ['Close: blocked', ...blockers].join('\n') : 'Close: ready',
    ['Closing commands (in order, after the checks pass):', ...closing.map((c) => `- \`${c}\``)].join('\n'),
  ].join('\n');
}
