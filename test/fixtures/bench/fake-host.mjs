#!/usr/bin/env node
// Scripted stand-in for `claude -p` (bench/lib/session.mjs tests). Reads the script named by FAKE_HOST
// ({ rules: [{ match, state | states[], json, exit, sleepMs, child, failTimes }] }); the first rule whose `match` is a
// prefix of the prompt applies; `states[n]` is used on the n-th call with the same prompt. Every call is appended to <cwd>/calls.jsonl; `state` is merged into <cwd>/state.json for fake-telos.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const prompt = argv[argv.indexOf('--') + 1];
const sessionId = argv[argv.indexOf('--session-id') + 1];
const { rules } = JSON.parse(readFileSync(process.env.FAKE_HOST, 'utf8'));
const rule = rules.find((r) => prompt.startsWith(r.match)) ?? {};
const calls = join(process.cwd(), 'calls.jsonl');
const seen = existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter((l) => l && JSON.parse(l).prompt === prompt).length : 0;
appendFileSync(calls, `${JSON.stringify({ argv, prompt, sessionId, env: Object.keys(process.env).sort() })}\n`);

if (rule.child) {
  const kid = spawn('sleep', ['30'], { stdio: 'ignore' });
  writeFileSync(join(process.cwd(), 'child.pid'), String(kid.pid));
}
if (seen < (rule.failTimes ?? 0)) {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 0, session_id: sessionId,
    total_cost_usd: 0.01, usage: { input_tokens: 5, output_tokens: 0 } }));
  process.exit(1);
}
const finish = () => {
  const patch = rule.states ? rule.states[Math.min(seen - (rule.failTimes ?? 0), rule.states.length - 1)] : rule.state;
  if (patch) {
    const file = join(process.cwd(), 'state.json');
    const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    writeFileSync(file, JSON.stringify({ ...state, ...patch }));
  }
  const json = { type: 'result', subtype: 'success', is_error: false, num_turns: 3, session_id: sessionId, total_cost_usd: 0.25,
    usage: { input_tokens: 10, output_tokens: 20 }, result: 'ok', ...rule.json };
  for (const [k, v] of Object.entries(json)) if (v === null) delete json[k];
  process.stdout.write(JSON.stringify(json));
  process.exit(rule.exit ?? 0);
};
if (rule.sleepMs) setTimeout(finish, rule.sleepMs);
else finish();
