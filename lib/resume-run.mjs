// Runner for `telos resume-test` (15-02): one fresh headless session per question and variant,
// each in its own temporary copy of the repository (D3). The agent command is injectable (D6).
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, sep } from 'node:path';

import { BLOCK_START, syncBlock } from './init.mjs';
import { QUESTIONS_FILE } from './resume-test.mjs';

export const VARIANTS = ['memory', 'bare'];

/**
 * Claude Code headless, read-only tools, one JSON event per line. The prompt comes on stdin.
 * Flags checked against `claude --help` (Claude Code 2.1); usage is read from the `result` event.
 */
export const DEFAULT_AGENT_CMD = 'claude -p --output-format stream-json --verbose --no-session-persistence'
  + ' --permission-mode dontAsk --tools Read,Grep,Glob,Bash'
  + " --allowedTools 'Read,Grep,Glob,Bash(telos *),Bash(git log *),Bash(git show *),Bash(ls *)'";

export const DEFAULT_TIMEOUT_S = 300;

const SKIP = new Set(['node_modules', join('.telos', '.cache')]);

/** @returns {string} the prompt for one question */
export const prompt = (question) =>
  `${question}\n\nAnswer in English, in at most five lines. Do not change any file.`;

/**
 * Copy the repository into a fresh temporary directory named like the original. Both variants
 * drop the questions file; `bare` also drops `.telos/` and the Telos block in AGENTS.md and
 * CLAUDE.md. The `.git` directory is copied as is.
 * @param {string} root repo root
 * @param {'memory' | 'bare'} variant
 * @returns {{ dir: string, cleanup(): void }}
 */
export function workingCopy(root, variant) {
  const base = mkdtempSync(join(tmpdir(), 'telos-rt-'));
  const dir = join(base, basename(root));
  const skip = (rel) => SKIP.has(rel) || rel === join(...QUESTIONS_FILE.split('/'))
    || (variant === 'bare' && (rel === '.telos' || rel.startsWith(`.telos${sep}`)));
  cpSync(root, dir, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => !skip(relative(root, src)),
  });
  if (variant === 'bare') {
    for (const name of ['AGENTS.md', 'CLAUDE.md']) {
      const file = join(dir, name);
      if (!existsSync(file)) continue;
      const text = readFileSync(file, 'utf8');
      if (BLOCK_START.test(text)) writeFileSync(file, syncBlock(text, '', name));
    }
  }
  return { dir, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

/**
 * Run `cmd` through `sh -c` in `cwd` with `input` on stdin; kill its process group on timeout.
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string, timedOut: boolean, ms: number }>}
 */
export function runAgent({ cmd, cwd, input, timeoutMs }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', cmd], { cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }, timeoutMs);
    const done = (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, ms: Date.now() - started });
    };
    child.on('error', (err) => { stderr += err.message; done(null); });
    child.on('close', done);
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

const parseLine = (line) => {
  try {
    const value = JSON.parse(line);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
};

/**
 * Read the agent's stdout: Claude Code JSON or stream-json (answer from the `result` event,
 * tokens and cost from it, tool calls from `tool_use` blocks), else the whole text as the
 * answer with unknown usage.
 * @returns {{ answer: string, tokens: number | null, cost: number | null, toolCalls: number | null, error: string | null }}
 */
export function parseOutput(stdout) {
  const events = stdout.split('\n').filter((l) => l.trim()).map(parseLine);
  if (!events.length || events.some((e) => e === null)) {
    return { answer: stdout.trim(), tokens: null, cost: null, toolCalls: null, error: null };
  }
  const result = events.findLast((e) => e.type === 'result');
  if (!result) return { answer: '', tokens: null, cost: null, toolCalls: null, error: 'no result event' };
  const u = result.usage ?? {};
  const tokens = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']
    .reduce((sum, k) => sum + (Number(u[k]) || 0), 0);
  const ids = new Set();
  let toolCalls = 0;
  for (const e of events) {
    if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
    for (const block of e.message.content) {
      if (block?.type !== 'tool_use') continue;
      if (block.id && ids.has(block.id)) continue;
      if (block.id) ids.add(block.id);
      toolCalls += 1;
    }
  }
  const answer = typeof result.result === 'string' ? result.result.trim() : '';
  const error = result.is_error ? `agent error: ${result.subtype ?? 'unknown'}` : null;
  return { answer, tokens, cost: typeof result.total_cost_usd === 'number' ? result.total_cost_usd : null, toolCalls, error };
}

/**
 * @typedef {{ answer: string, tokens: number | null, cost: number | null, toolCalls: number | null,
 *   error: string | null, ms: number }} RunResult  `error` set: the run failed and counts as incorrect
 */

/**
 * Ask one question in one variant: fresh working copy, one agent run, copy removed.
 * @param {{ root: string, question: string, variant: 'memory' | 'bare', agentCmd?: string, timeoutMs?: number }} opts
 * @returns {Promise<RunResult>}
 */
export async function ask({ root, question, variant, agentCmd = DEFAULT_AGENT_CMD, timeoutMs = DEFAULT_TIMEOUT_S * 1000 }) {
  const copy = workingCopy(root, variant);
  try {
    const run = await runAgent({ cmd: agentCmd, cwd: copy.dir, input: prompt(question), timeoutMs });
    if (run.timedOut) {
      return { answer: '', tokens: null, cost: null, toolCalls: null, error: `timeout after ${Math.round(timeoutMs / 100) / 10}s`, ms: run.ms };
    }
    const out = parseOutput(run.stdout);
    let { error } = out;
    if (run.code !== 0) {
      const why = run.stderr.trim().split('\n').pop() || 'no output';
      error = `exit ${run.code ?? 'error'}: ${why.slice(0, 200)}`;
    } else if (!error && !out.answer) {
      error = 'empty answer';
    }
    return { ...out, error, ms: run.ms };
  } finally {
    copy.cleanup();
  }
}

/**
 * Ask every question in every requested variant, one after another.
 * @param {{ root: string, questions: { q: string }[], variants?: string[], agentCmd?: string,
 *   timeoutMs?: number, onRun?: (i: number, variant: string, r: RunResult) => void }} opts
 * @returns {Promise<Record<string, RunResult>[]>} per question, results keyed by variant
 */
export async function runAll({ root, questions, variants = VARIANTS, agentCmd, timeoutMs, onRun = () => {} }) {
  const results = [];
  for (const [i, { q }] of questions.entries()) {
    const row = {};
    for (const variant of variants) {
      row[variant] = await ask({ root, question: q, variant, agentCmd, timeoutMs });
      onRun(i, variant, row[variant]);
    }
    results.push(row);
  }
  return results;
}
