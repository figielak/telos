// `telos resume-test` (phase 15): does a fresh session know the project better, and more
// cheaply, with the memory than without it? Questions live in `.telos/resume-test.md` (D1);
// scoring is a deterministic substring match, never a model judge (D2).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { UsageError } from './errors.mjs';
import { DEFAULT_AGENT_CMD, DEFAULT_TIMEOUT_S, VARIANTS, runAll } from './resume-run.mjs';

/** Questions file, relative to the repo root. */
export const QUESTIONS_FILE = '.telos/resume-test.md';
export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 10;

const QUESTION = /^-\s+Q:\s*(.*)$/;
const EXPECT = /^\s+expect:\s*(.*)$/;

/** Blank out HTML comments, keeping line breaks so line numbers stay true. */
const stripComments = (text) => text.replace(/<!--[\s\S]*?(?:-->|$)/g, (c) => c.replace(/[^\n]/g, ''));

/**
 * @typedef {{ line: number, q: string, facts: string[][] }} Question
 *   `facts`: every fact must match; each fact is a list of alternatives
 */

/**
 * Parse and validate the questions file: `- Q: <question>`, then `  expect: <fact>; <fact>`
 * on the next non-empty line; `a|b` is one fact with alternatives.
 * @param {string} text
 * @returns {{ questions: Question[], errors: string[] }} errors carry line numbers
 */
export function parseQuestions(text) {
  const questions = [];
  const errors = [];
  let open = null;
  const close = () => {
    if (open) errors.push(`line ${open.line}: question without an expect line`);
    open = null;
  };
  stripComments(text).split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    const q = QUESTION.exec(raw);
    const e = EXPECT.exec(raw);
    if (q) {
      close();
      if (!q[1].trim()) errors.push(`line ${i + 1}: empty question`);
      open = { line: i + 1, q: q[1].trim() };
    } else if (e && open) {
      const facts = e[1].split(';')
        .map((f) => f.split('|').map((a) => a.trim()).filter(Boolean))
        .filter((alts) => alts.length);
      if (!facts.length) errors.push(`line ${i + 1}: expect has no fact`);
      else if (open.q) questions.push({ ...open, facts });
      open = null;
    } else if (e) {
      errors.push(`line ${i + 1}: expect without a question`);
    } else {
      close();
    }
  });
  close();
  if (questions.length < MIN_QUESTIONS || questions.length > MAX_QUESTIONS) {
    errors.push(`${questions.length} questions; ${MIN_QUESTIONS}–${MAX_QUESTIONS} needed`);
  }
  return { questions, errors };
}

const normalize = (s) => s.toLowerCase().replace(/\s+/g, ' ');

/**
 * D2: correct when the answer contains every fact (case-insensitive, whitespace collapsed);
 * a fact matches when any of its alternatives does.
 * @param {string} answer
 * @param {string[][]} facts
 * @returns {{ correct: boolean, missing: string[] }} missing facts as written (`a|b`)
 */
export function score(answer, facts) {
  const text = normalize(answer);
  const missing = facts.filter((alts) => !alts.some((a) => text.includes(normalize(a)))).map((alts) => alts.join('|'));
  return { correct: missing.length === 0, missing };
}

/**
 * Score every run; a failed run is incorrect and keeps its error.
 * @param {Question[]} questions
 * @param {Record<string, import('./resume-run.mjs').RunResult>[]} results per question, keyed by variant
 * @param {string[]} variants
 */
export function summarize(questions, results, variants) {
  const rows = questions.map((question, i) => {
    const row = { line: question.line, q: question.q };
    for (const v of variants) {
      const r = results[i][v];
      const s = r.error ? { correct: false, missing: question.facts.map((a) => a.join('|')) } : score(r.answer, question.facts);
      row[v] = { ...s, ...r };
    }
    return row;
  });
  const sum = (runs, key) => (runs.some((r) => r[key] !== null)
    ? runs.reduce((n, r) => n + (r[key] ?? 0), 0) : null);
  const totals = Object.fromEntries(variants.map((v) => {
    const runs = rows.map((row) => row[v]);
    return [v, {
      correct: runs.filter((r) => r.correct).length, total: runs.length,
      tokens: sum(runs, 'tokens'), cost: sum(runs, 'cost'), toolCalls: sum(runs, 'toolCalls'),
      failed: runs.filter((r) => r.error).length,
    }];
  }));
  return { variants, rows, totals };
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fmtTokens = (n) => (n === null ? '–' : n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}K`);
const fmtCost = (n) => (n === null ? '–' : `$${n.toFixed(2)}`);
const fmtCount = (n) => (n === null ? '–' : String(n));
const table = (rows) => {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
  return rows.map((r) => r.map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c]))).join('  ').trimEnd());
};

/**
 * The D4 report: one row per question, the totals per variant, then what every incorrect
 * answer missed (or why its run failed).
 * @param {ReturnType<typeof summarize>} summary
 * @returns {string}
 */
export function renderReport({ variants, rows, totals }) {
  const mark = (r) => (r.error ? 'failed' : r.correct ? '✓' : '✗');
  const out = [`Resume test · ${rows.length} questions · ${variants.join(' vs ')}`, ''];
  out.push(...table([['#', 'Question', ...variants],
    ...rows.map((row, i) => [String(i + 1), clip(row.q, 48), ...variants.map((v) => mark(row[v]))])]));
  out.push('');
  const t = variants.map((v) => totals[v]);
  out.push(...table([['', ...variants],
    ['Correct', ...t.map((x) => `${x.correct}/${x.total}`)],
    ['Tokens', ...t.map((x) => fmtTokens(x.tokens))],
    ['Cost', ...t.map((x) => fmtCost(x.cost))],
    ['Tool calls', ...t.map((x) => fmtCount(x.toolCalls))],
    ['Failed runs', ...t.map((x) => String(x.failed))]]));
  const misses = rows.flatMap((row, i) => variants.filter((v) => !row[v].correct).map((v) => (row[v].error
    ? `- ${i + 1} ${v}: failed (${row[v].error})`
    : `- ${i + 1} ${v}: missing ${row[v].missing.map((m) => JSON.stringify(m)).join(', ')}`)));
  if (misses.length) out.push('', 'Missing facts', ...misses);
  return `${out.join('\n')}\n`;
}

const USAGE = "[--variant memory|bare] [--json] [--agent-cmd '<cmd>'] [--timeout <seconds>]";
const TEMPLATE = fileURLToPath(new URL('../templates/resume-test.md', import.meta.url));

/** `telos resume-test`: 2 × N fresh headless sessions; results go to stdout only (D5). */
export const resumeTestCommand = {
  help: `Ask .telos/resume-test.md in fresh sessions with and without the memory: resume-test ${USAGE}`,
  needsTelos: true,
  async run({ args, root, stdout, stderr }) {
    let values, positionals;
    try {
      ({ values, positionals } = parseArgs({ args, allowPositionals: true, options: {
        variant: { type: 'string' }, json: { type: 'boolean' },
        'agent-cmd': { type: 'string' }, timeout: { type: 'string' },
      } }));
    } catch (err) {
      throw new UsageError(`${err.message}; use resume-test ${USAGE}`);
    }
    if (positionals.length) throw new UsageError(`unexpected argument '${positionals[0]}'; use resume-test ${USAGE}`);
    if (values.variant !== undefined && !VARIANTS.includes(values.variant)) {
      throw new UsageError(`--variant must be memory or bare; use resume-test ${USAGE}`);
    }
    const timeout = values.timeout === undefined ? DEFAULT_TIMEOUT_S : Number(values.timeout);
    if (!(timeout > 0)) throw new UsageError(`--timeout must be a positive number of seconds; use resume-test ${USAGE}`);
    const agentCmd = values['agent-cmd'] ?? DEFAULT_AGENT_CMD;
    if (!agentCmd.trim()) throw new UsageError(`--agent-cmd is empty; use resume-test ${USAGE}`);

    const file = join(root, QUESTIONS_FILE);
    if (!existsSync(file)) {
      stderr.write(`telos resume-test: no ${QUESTIONS_FILE}; start from ${TEMPLATE}\n`);
      return 1;
    }
    const { questions, errors } = parseQuestions(readFileSync(file, 'utf8'));
    if (errors.length) {
      stderr.write(errors.map((e) => `${QUESTIONS_FILE}: ${e}\n`).join(''));
      return 1;
    }
    const variants = values.variant ? [values.variant] : VARIANTS;
    const runs = questions.length * variants.length;
    let n = 0;
    stderr.write(`telos resume-test: ${runs} headless sessions, one at a time\n`);
    const results = await runAll({ root, questions, variants, agentCmd, timeoutMs: timeout * 1000,
      onRun: (i, v, r) => {
        n += 1;
        const verdict = r.error ? `failed: ${r.error}` : score(r.answer, questions[i].facts).correct ? '✓' : '✗';
        stderr.write(`[${n}/${runs}] ${i + 1} ${v} ${verdict} (${Math.round(r.ms / 1000)}s)\n`);
      } });
    const summary = summarize(questions, results, variants);
    stdout.write(values.json ? `${JSON.stringify(summary, null, 2)}\n` : renderReport(summary));
    return n > 0 && variants.every((v) => summary.totals[v].failed === questions.length) ? 1 : 0;
  },
};
