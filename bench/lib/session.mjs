import { spawn as nodeSpawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { UsageError } from '../../lib/errors.mjs';
import { WorkspaceError } from './workspace.mjs';

// One headless `claude -p` session (PROTOCOL §6.4, §7.2, §7.3; D-08, D-09, D-12): argv, budget flag, own process
// group, timeout kill and the pre-first-turn retry rule. Nothing is shell-interpolated; the prompt is one argv element.

/** Retries after a host error before the first turn (§7.2). */
export const MAX_RETRIES = 2;
const KILL_GRACE_MS = 5000;
/** Dollar amounts to 1/10000 cent, so repeated subtraction does not drift. */
export const round = (usd) => Math.round(usd * 1e6) / 1e6;

/**
 * Shared argv prefix of every session of a variant: launcher (the dedicated benchmark user, D-08), host command, the
 * pinned model, the shared permission mode, JSON output and, for C/D only, the exported plugin.
 */
export function baseArgv(variant, { launcher, claude = ['claude'], model, permissionMode, pluginDir } = {}) {
  if (!Array.isArray(launcher) || !launcher.length) throw new WorkspaceError('REFUSED: no launcher for the benchmark OS user (D-08); sessions never run as the author');
  if (!model) throw new UsageError('baseArgv: model is required (pinned model ID, D-09)');
  if (!permissionMode) throw new UsageError('baseArgv: permissionMode is required (D-09)');
  const telos = variant === 'C' || variant === 'D';
  if (telos && !pluginDir) throw new UsageError(`baseArgv: variant ${variant} needs pluginDir`);
  return [...launcher, ...claude, '--model', model, '--permission-mode', permissionMode, '--output-format', 'json',
    ...(telos ? ['--plugin-dir', pluginDir] : [])];
}

function parse(stdout) {
  const text = stdout.trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch {
    // stream noise before the result object: take the last line that parses
    for (const line of text.split('\n').reverse()) { try { return JSON.parse(line); } catch { /* next */ } }
    return null;
  }
}

/** Kill the process group: SIGTERM (relayed by launchers such as sudo), then SIGKILL after the grace period. */
function killGroup(child, graceMs) {
  const signal = (sig) => { try { process.kill(-child.pid, sig); } catch { /* group already gone */ } };
  signal('SIGTERM');
  return setTimeout(() => signal('SIGKILL'), graceMs);
}

function attempt({ prompt, env, cwd, argvBase, budgetUsd, timeoutMs, killGraceMs, spawn }) {
  const sessionId = randomUUID();
  const argv = [...argvBase, '--session-id', sessionId, '--max-budget-usd', String(budgetUsd), '-p', '--', prompt];
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let grace = null;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { timedOut = true; grace = killGroup(child, killGraceMs); }, timeoutMs);
    const finish = (exit, error) => {
      clearTimeout(timer);
      // children that outlived the host (or ignored SIGTERM) go with the group
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
      clearTimeout(grace);
      const json = parse(stdout);
      done({ sessionId, argv, exit, timedOut, json, usage: json?.usage ?? null, costUsd: json?.total_cost_usd ?? null,
        turns: json?.num_turns ?? null, ms: Date.now() - started, stderr: stderr.slice(-4000), ...(error ? { error } : {}) });
    };
    child.on('error', (err) => finish(null, err.message));
    child.on('close', (code, sig) => finish(code ?? (sig ? `signal ${sig}` : null)));
  });
}

/** No model output in the attempt: the host failed before the first turn (§7.2). A timeout is never one. */
const preFirstTurn = (a) => !a.timedOut && a.exit !== 0 && !(a.turns > 0);

/**
 * Run one session → `{ sessionId, argv, envNames, exit, timedOut, hostError, json, usage, costUsd, ms, attempts }`.
 * The top-level fields are the last attempt's; `attempts` keeps every attempt with its own usage and cost (§7.2).
 * `usage`/`costUsd` stay `null` when the host reports none, never 0.
 */
export async function runSession({ prompt, env, cwd, argvBase, budgetUsd, timeoutMs, killGraceMs = KILL_GRACE_MS, spawn = nodeSpawn }) {
  if (typeof prompt !== 'string' || !prompt) throw new UsageError('runSession: prompt must be a non-empty string');
  if (!(typeof budgetUsd === 'number' && budgetUsd > 0)) throw new UsageError(`runSession: budgetUsd must be > 0 (got ${budgetUsd})`);
  if (!(timeoutMs > 0)) throw new UsageError('runSession: timeoutMs must be > 0');
  const attempts = [];
  let left = budgetUsd;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    attempts.push(await attempt({ prompt, env, cwd, argvBase, budgetUsd: left, timeoutMs, killGraceMs, spawn }));
    if (!preFirstTurn(attempts.at(-1))) break;
    // retries share the session's budget; an attempt of unknown cost leaves nothing to retry with
    left = round(left - (attempts.at(-1).costUsd ?? left));
    if (!(left > 0)) break;
  }
  const last = attempts.at(-1);
  return { ...last, envNames: Object.keys(env ?? {}).sort(), hostError: preFirstTurn(last), attempts };
}
