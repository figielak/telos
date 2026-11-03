import { spawnSync } from 'node:child_process';

import { UsageError } from '../../lib/errors.mjs';
import { round, runSession } from './session.mjs';

// The sessions of one cell (PROTOCOL §6.2, §6.3, §7.2, §7.3; D-05). C/D scenarios are driven only by `telos` CLI output
// read inside the copy: lint-plan's exit code, `telos status` (Next, Blockers, Awaiting user) and the task index of
// `telos ctx approve`. The runner never judges model output beyond a `REFUSED:` marker.

export const CONFIRM_TEXT = 'accept the recommended options';
export const CONTINUE_TEXT = 'continue the work in this repository: ';
const CLOSE = /^close phase \d{2} \(\/telos:done\)$/;
const DO = /^\/telos:do(-hard \d{2}-\d{2})?$/;

function telosCli(ctx, args) {
  const [cmd, ...pre] = ctx.telos;
  const r = spawnSync(cmd, [...pre, ...args], { cwd: ctx.cwd, env: ctx.env, encoding: 'utf8', timeout: 120_000 });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** `telos status` → `{ next, blockers, awaiting }` (awaiting `null` when the line is absent). */
function readStatus(ctx) {
  const r = telosCli(ctx, ['status']);
  if (r.code !== 0) return { error: `telos status: exit ${r.code}` };
  const line = (label) => r.stdout.split('\n').find((l) => l.startsWith(`${label}: `))?.slice(label.length + 2).trim() ?? null;
  return { next: line('Next'), blockers: line('Blockers') ?? 'none', awaiting: line('Awaiting user') };
}

/** Task index of the STATUS phase from `telos ctx approve` → `[{ id, status }]`. */
function readTasks(ctx) {
  const r = telosCli(ctx, ['ctx', 'approve']);
  if (r.code !== 0) return { error: `telos ctx approve: exit ${r.code}` };
  return { tasks: [...r.stdout.matchAll(/^- (\d{2}-\d{2}) \[([a-z-]+)\]/gm)].map(([, id, status]) => ({ id, status })) };
}

/** What a C/D step is about to receive (§6.4): the rendered rows of `telos budget --ctx`, without its stored-files list. */
function bundleOf(ctx, args) {
  const r = telosCli(ctx, ['budget', '--ctx', ...args]);
  const lines = r.stdout.split('\n').filter(Boolean);
  return { args: args.join(' '), exit: r.code, lines: lines.slice(lines.findLastIndex((l) => l.startsWith('- .telos/')) + 1) };
}

/**
 * Run every session of `cell` (`{ id, variant, task: { type: 'single', prompt } | { type: 'multi', steps[] } }`) in the
 * copy `ctx.cwd` → `{ status: completed|failed|timeout|infra-failed, reason?, usageLimit?, sessions[], spentUsd }`.
 * ctx: `env`, `argvBase` (from `baseArgv`), `telos` (argv prefix of the CLI, launcher included), `cellBudgetUsd`
 * (the cell reservation; each session gets what its predecessors left, §7.3), `sessionTimeoutMs`, `runTimeoutMs`,
 * optional `killGraceMs` and `spawn`.
 */
export async function runTrajectory(cell, ctx) {
  const { task, variant } = cell;
  if (!(ctx.cellBudgetUsd > 0)) throw new UsageError(`${cell.id}: cellBudgetUsd must be > 0`);
  if (task?.type === 'multi' ? !task.steps?.length : !task?.prompt) throw new UsageError(`${cell.id}: task needs prompt (single) or steps (multi)`);
  const telos = variant === 'C' || variant === 'D';
  const started = Date.now();
  const sessions = [];
  let spent = 0;
  let unknown = false;
  const end = (status, reason) => ({ status, ...(reason ? { reason } : {}), sessions, spentUsd: unknown ? null : spent });

  /** One session → `null` when the run may go on, else the run's final record. */
  const session = async (step, prompt, bundleArgs) => {
    if (unknown) return end('failed', 'budget: spend unknown, the reservation cannot be kept');
    const left = round(ctx.cellBudgetUsd - spent);
    if (!(left > 0)) return end('failed', `budget: ${spent} of ${ctx.cellBudgetUsd} USD spent`);
    const runLeft = ctx.runTimeoutMs - (Date.now() - started);
    if (runLeft <= 0) return end('timeout', 'run time limit');
    const bundle = telos && bundleArgs ? bundleOf(ctx, bundleArgs) : undefined;
    const s = await runSession({ prompt, env: ctx.env, cwd: ctx.cwd, argvBase: ctx.argvBase, budgetUsd: left,
      timeoutMs: Math.min(ctx.sessionTimeoutMs, runLeft), killGraceMs: ctx.killGraceMs, spawn: ctx.spawn });
    sessions.push({ step, prompt, ...(bundle ? { bundle } : {}), ...s });
    for (const a of s.attempts) {
      if (a.costUsd == null) unknown = true;
      else spent = round(spent + a.costUsd);
    }
    if (s.timedOut) return end('timeout', `${step}: time limit`);
    if (s.json?.api_error_status === 429) return { ...end('infra-failed', `${step}: usage limit: ${s.json.result ?? 'HTTP 429'}`), usageLimit: true };
    if (s.hostError) return end('infra-failed', `${step}: host error before the first turn, ${s.attempts.length} attempts`);
    if (s.exit !== 0 || s.json?.is_error) return end('failed', `${step}: exit ${s.exit}${s.json?.subtype ? ` (${s.json.subtype})` : ''}`);
    const refused = telos && /REFUSED:.*/.exec(s.json?.result ?? '');
    if (refused) return end('failed', `refused: ${refused[0]}`);
    return null;
  };

  if (task.type !== 'multi') return (await session('task', telos ? `/telos:quick ${task.prompt}` : task.prompt, ['quick'])) ?? end('completed');
  const text = task.steps.join('\n\n');
  if (!telos) {
    for (const [i, step] of task.steps.entries()) {
      const stop = await session(`step ${i + 1}`, i ? `${CONTINUE_TEXT}${step}` : text);
      if (stop) return stop;
    }
    return end('completed');
  }
  return cdScenario(ctx, text, session, end);
}

/** PROTOCOL §6.3 steps 1–6 for C and D. */
async function cdScenario(ctx, text, session, end) {
  let stop = await session('plan', `/telos:plan ${text}`, ['plan']);
  if (stop) return stop;
  const lint = telosCli(ctx, ['lint-plan']);
  if (lint.code !== 0) return end('failed', `lint: ${lint.stdout.split('\n')[0] || `exit ${lint.code}`}`);
  // the shipped way to confirm proposed decisions headless: revise notes (a plain prompt may not edit .telos/)
  if ((stop = await session('confirm', `/telos:revise ${CONFIRM_TEXT}`, ['plan']))) return stop;
  const after = readStatus(ctx);
  if (after.error) return end('failed', after.error);
  if (after.awaiting && after.awaiting !== 'none') return end('failed', `awaiting: ${after.awaiting}`);
  if ((stop = await session('approve', '/telos:approve', ['approve']))) return stop;
  const generated = readTasks(ctx);
  if (generated.error) return end('failed', generated.error);
  if (!generated.tasks.length) return end('failed', 'no tasks');
  const pending = generated.tasks.filter((t) => t.status !== 'approved').map((t) => t.id);
  if (pending.length) return end('failed', `not approved: ${pending.join(', ')}`);

  const limit = 2 * generated.tasks.length;
  let st = readStatus(ctx);
  let index = readTasks(ctx);
  for (let count = 0; ; count++) {
    if (st.error || index.error) return end('failed', st.error ?? index.error);
    if (CLOSE.test(st.next)) {
      const open = index.tasks.filter((t) => t.status !== 'done').map((t) => t.id);
      return open.length ? end('failed', `next: ${st.next} with tasks not done: ${open.join(', ')}`) : end('completed');
    }
    if (!DO.test(st.next ?? '')) return end('failed', `next: ${st.next}`);
    // a blocker is only followed through the shipped /telos:do → /telos:do-hard escalation
    if (st.blockers !== 'none' && !st.next.startsWith('/telos:do-hard ')) return end('failed', `blocker: ${st.blockers}`);
    if (count >= limit) return end('failed', `session limit: ${limit} loop sessions for ${generated.tasks.length} tasks`);
    const before = JSON.stringify([st.next, index.tasks]);
    if ((stop = await session('do', st.next, ['do', ...st.next.split(' ').slice(1)]))) return stop;
    const ran = st.next;
    st = readStatus(ctx);
    index = readTasks(ctx);
    if (st.error || index.error) return end('failed', st.error ?? index.error);
    if (st.blockers !== 'none' && DO.test(st.next ?? '') && !st.next.startsWith('/telos:do-hard ')) return end('failed', `blocker: ${st.blockers}`);
    if (JSON.stringify([st.next, index.tasks]) === before) return end('failed', `no progress: ${ran}`);
  }
}
