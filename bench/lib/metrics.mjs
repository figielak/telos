import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Flat metrics row of one run record (PROTOCOL §8): host usage is the evidence for tokens and cost; transcripts give
// per-model turns, tool counts, denials and the exploration proxy. Anything unreadable stays null, never 0.

const sum = (values) => (values.some((v) => v == null) ? null : Math.round(values.reduce((a, b) => a + b, 0) * 1e6) / 1e6);
const FIELDS = { input: 'input_tokens', cache_creation: 'cache_creation_input_tokens', output: 'output_tokens', cache_read: 'cache_read_input_tokens' };
const EXPLORE_TOOLS = new Set(['Read', 'Grep', 'Glob']);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
/** Not product code: Telos state, instruction files (§8.4). */
const INSTRUCTION = /(^|\/)(\.telos|\.claude)\/|(^|\/)(CLAUDE(\.local)?|AGENTS|GEMINI)\.md$/;

// --- Bash ---------------------------------------------------------------------------------------------------------
const READ_LIKE = /^(cat|head|tail|grep|egrep|fgrep|rg|find|ls|tree|wc|file|stat|less|more|sed\s+-n|git\s+(show|log|diff|blame|grep|ls-files|ls-tree|cat-file))\b/;
const KNOWN_OTHER = /^(npm|npx|pnpm|yarn|node|python3?|pytest|uv|pip3?|go|cargo|make|mvn|gradle|git|telos|mkdir|cp|mv|rm|touch|echo|printf|cd|pwd|export|env|true|false|test|chmod|diff|sort|tee|sed|awk|tr|cut|xargs|which|date|sleep|bash|sh)\b/;

/** Split a command line into simple commands on `&&`, `||`, `;`, `|` and newlines, dropping a leading `cd <dir>`. */
const segments = (command) => command.split(/&&|\|\||;|\||\n/).map((s) => s.trim().replace(/^\(+/, '')).filter(Boolean).filter((s) => !/^cd(\s|$)/.test(s));

/** `explore` when any simple command reads files, `other` when all are known non-reading ones, else `unclassified`. */
export function classifyBash(command) {
  const parts = segments(String(command ?? ''));
  if (!parts.length) return 'unclassified';
  if (parts.some((p) => READ_LIKE.test(p))) return 'explore';
  return parts.every((p) => KNOWN_OTHER.test(p)) ? 'other' : 'unclassified';
}

/** Paths a Bash command writes to: `sed -i`, `tee`, and `>`/`>>` redirects (not `/dev/null` or fd duplication). */
function bashWrites(command) {
  const out = [];
  for (const m of command.matchAll(/(?:^|[^>&\d])\d?>>?\s*([^\s|&;<>()]+)/g)) out.push(m[1]);
  for (const m of command.matchAll(/\btee\s+(?:-a\s+)?([^\s|&;<>()]+)/g)) out.push(m[1]);
  for (const m of command.matchAll(/\bsed\s+(?:-[A-Za-z]+\s+)*-i\S*\s+(?:-e\s+)?(?:'[^']*'|"[^"]*"|\S+)\s+([^\s|&;<>()]+)/g)) out.push(m[1]);
  return out.filter((p) => p !== '/dev/null' && !p.startsWith('&'));
}

const isProductWrite = (path) => !INSTRUCTION.test(path);

// --- transcripts --------------------------------------------------------------------------------------------------
/** Parse a session JSONL → array of lines, or `null` when the file is missing or any line is not JSON. */
export function readTranscript(path) {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return null; }
}

const blocks = (line) => (Array.isArray(line.message?.content) ? line.message.content : []);
const resultText = (content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.map((c) => c?.text ?? '').join('') : '');
const DENIED = /(permission to use .* (has been )?denied|was denied|not allowed|denied by|requires approval|blocked by hook)/i;

/** Transcript files of one session id: the main file and its subagents, as `[{ lines, source }]` or `null` if unreadable. */
function sessionFiles(dir, sessionId) {
  const main = readTranscript(join(dir, `${sessionId}.jsonl`));
  if (!main) return null;
  const files = [{ lines: main, source: 0 }];
  const subDir = join(dir, sessionId, 'subagents');
  if (existsSync(subDir)) {
    for (const [i, name] of readdirSync(subDir).filter((f) => f.endsWith('.jsonl')).sort().entries()) {
      const lines = readTranscript(join(subDir, name));
      if (!lines) return null;
      files.push({ lines, source: i + 1 });
    }
  }
  return files;
}

/** Events of a session in time order: main file and subagents merged by timestamp (file order breaks ties). */
function events(files) {
  const all = [];
  for (const { lines, source } of files) lines.forEach((line, i) => all.push({ line, source, i, t: Date.parse(line.timestamp ?? '') }));
  return all.sort((a, b) => (Number.isNaN(a.t) || Number.isNaN(b.t) ? a.source - b.source || a.i - b.i : a.t - b.t || a.source - b.source || a.i - b.i));
}

/** Analyse one session: model turns, tool counts, denials, exploration window. */
function analyse(files) {
  const turns = new Map(); // message id → model
  const tools = {};
  const calls = new Map(); // tool_use id → { kind, counted }
  let denied = 0;
  let mutated = false;
  const explore = { calls: 0, bytes: 0, unclassified: 0 };
  let costState = null;
  for (const line of files[0].lines) if (line.type === 'cost-state') costState = line; // the main file's last one covers the session
  for (const { line } of events(files)) {
    if (line.type === 'assistant' && line.message) {
      const id = line.message.id ?? `${line.requestId ?? line.uuid}`;
      if (!turns.has(id)) turns.set(id, line.message.model ?? 'unknown');
      for (const b of blocks(line)) {
        if (b.type !== 'tool_use') continue;
        tools[b.name] = (tools[b.name] ?? 0) + 1;
        if (mutated) continue;
        const input = b.input ?? {};
        if (WRITE_TOOLS.has(b.name)) { if (isProductWrite(String(input.file_path ?? input.notebook_path ?? ''))) mutated = true; continue; }
        if (b.name === 'Bash') {
          const command = String(input.command ?? '');
          if (bashWrites(command).some(isProductWrite)) { mutated = true; continue; }
          const kind = classifyBash(command);
          if (kind === 'explore') calls.set(b.id, true);
          else if (kind === 'unclassified') explore.unclassified += 1;
          if (kind === 'explore') explore.calls += 1;
        } else if (EXPLORE_TOOLS.has(b.name)) { calls.set(b.id, true); explore.calls += 1; }
      }
    } else if (line.type === 'user') {
      for (const b of blocks(line)) {
        if (b.type !== 'tool_result') continue;
        if (calls.has(b.tool_use_id)) explore.bytes += Buffer.byteLength(resultText(b.content));
        const decision = line.permissionDecision?.decision ?? b.permissionDecision?.decision;
        if (b.is_error && (decision === 'deny' || DENIED.test(resultText(b.content)))) denied += 1;
      }
    }
  }
  return { turns, tools, denied, explore, costState };
}

// --- row ----------------------------------------------------------------------------------------------------------
const outside = (path, expected) => !expected.some((e) => (e.endsWith('/') ? path.startsWith(e) : path === e || path.startsWith(`${e}/`)));

/**
 * Flat metrics row of one run record from `runMatrix` (07-12) → object with `cost_usd` (every attempt of every
 * session; `setup_usd` separate), `input`, `cache_creation`, `fresh` (= input + cache_creation), `output`, `cache_read`,
 * `turns`, `wall_ms`, `sessions`, `attempts`, `per_model`, `tools`, `denied`, `explore_calls`, `explore_bytes`,
 * `explore_unclassified`, `out_of_scope_paths` (needs `expectedPaths`), `status`, `accepted`, `unverified`.
 * Tokens, cost, turns and wall time are host values; transcripts add the rest. `transcriptsDir` holds
 * `<sessionId>.jsonl` and `<sessionId>/subagents/*.jsonl` of every attempt that has one.
 */
export function rowFromRecord(record, { transcriptsDir, expectedPaths = record.expectedPaths } = {}) {
  const attempts = (record.sessions ?? []).flatMap((s) => s.attempts ?? [s]);
  const total = (get) => sum(attempts.map(get));
  const row = { cell: record.cell, task: record.task, variant: record.variant, rep: record.rep, status: record.status, accepted: record.accepted === true,
    cost_usd: total((a) => a.costUsd ?? null), setup_usd: record.setupUsd ?? null };
  for (const [name, field] of Object.entries(FIELDS)) row[name] = total((a) => a.usage?.[field] ?? null);
  row.fresh = row.input == null || row.cache_creation == null ? null : row.input + row.cache_creation;
  row.output = row.output ?? null;
  row.turns = total((a) => a.turns ?? null);
  row.wall_ms = total((a) => a.ms ?? null);
  row.sessions = (record.sessions ?? []).length;
  row.attempts = attempts.length;

  const analyses = [];
  let readable = Boolean(transcriptsDir);
  for (const a of attempts) {
    const files = readable ? sessionFiles(transcriptsDir, a.sessionId) : null;
    // an attempt that never reached a turn has no transcript to speak of; a missing one is only a problem otherwise
    if (!files) { if (a.turns === 0 && a.exit !== 0) continue; readable = false; break; }
    analyses.push(analyse(files));
  }
  if (readable) {
    const perModel = {};
    for (const an of analyses) {
      for (const model of an.turns.values()) (perModel[model] ??= { cost_usd: null, turns: 0 }).turns += 1;
      for (const [model, u] of Object.entries(an.costState?.modelUsage ?? {})) {
        const m = (perModel[model] ??= { cost_usd: null, turns: 0 });
        m.cost_usd = (m.cost_usd ?? 0) + (u.costUSD ?? 0);
      }
    }
    row.per_model = Object.fromEntries(Object.entries(perModel).sort(([a], [b]) => (a < b ? -1 : 1)));
    row.tools = {};
    for (const an of analyses) for (const [k, v] of Object.entries(an.tools)) row.tools[k] = (row.tools[k] ?? 0) + v;
    row.tools = Object.fromEntries(Object.entries(row.tools).sort(([a], [b]) => (a < b ? -1 : 1)));
    row.denied = analyses.reduce((s, an) => s + an.denied, 0);
    row.explore_calls = analyses.reduce((s, an) => s + an.explore.calls, 0);
    row.explore_bytes = analyses.reduce((s, an) => s + an.explore.bytes, 0);
    row.explore_unclassified = analyses.reduce((s, an) => s + an.explore.unclassified, 0);
  } else {
    Object.assign(row, { per_model: null, tools: null, denied: null, explore_calls: null, explore_bytes: null, explore_unclassified: null });
  }
  row.out_of_scope_paths = Array.isArray(expectedPaths) && record.changedPaths ? record.changedPaths.filter((p) => outside(p, expectedPaths)).sort() : null;
  row.unverified = !readable || [row.cost_usd, row.input, row.cache_creation, row.output, row.cache_read, row.turns].includes(null);
  return row;
}
