import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { atLeast, load as loadConfig } from './config.mjs';
import { telosDir } from './repo.mjs';
import { getLine } from './status.mjs';

// Compaction continuity (SPEC §8, std+). PreCompact saves the session identity, the STATUS task
// and the edited paths still queued by the 04-11 accumulator in `.cache/session`; SessionStart
// (compact) shows them again. Edit hooks add a one-line hint when the main thread's context use,
// read from structured transcript `message.usage` numbers only, crosses 70/85/100% of a capacity
// given in TELOS_CONTEXT_WINDOW. Hook payloads and transcripts carry no capacity, so without that
// variable no percentage is ever estimated.

const VERSION = 1;
const MAX_PATHS = 50;
const MAX_PATH_CHARS = 300;
const MAX_CACHE_BYTES = 16 * 1024;
const TAIL_BYTES = 1 << 20;
const THRESHOLDS = [70, 85, 100];
const TASK = /^\d{2}-\d{2}$/;

const hash = (s) => createHash('sha256').update(s).digest('hex');
const sessionKey = (id) => hash(typeof id === 'string' && id ? id : 'none');
const cacheDir = (root) => join(telosDir(root), '.cache');

function standard(root) {
  if (!fs.existsSync(telosDir(root))) return false;
  try { return atLeast(loadConfig(root), 'standard'); } catch { return false; }
}

const validPath = (p) => typeof p === 'string' && p.length > 0 && p.length <= MAX_PATH_CHARS
  && !/[\x00-\x1f\x7f]/.test(p) && !isAbsolute(p) && !p.split('/').includes('..');

/** Paths still queued for this session by lib/edited.mjs (same `<sha16>` directory layout). */
function queuedPaths(root, sessionId) {
  const dir = join(cacheDir(root), 'edited', sessionKey(sessionId).slice(0, 16));
  let groups;
  try { groups = fs.readdirSync(dir).filter((d) => d === 'pending' || d.startsWith('batch-')); } catch { return []; }
  const paths = new Set();
  for (const group of groups) {
    let files = [];
    try { files = fs.readdirSync(join(dir, group)); } catch { continue; }
    for (const f of files) {
      try {
        const p = fs.readFileSync(join(dir, group, f), 'utf8');
        if (validPath(p)) paths.add(p);
      } catch { /* claimed meanwhile */ }
    }
  }
  return [...paths].sort();
}

/** PreCompact: save session identity, STATUS task and queued edits. @returns {boolean} saved */
export function saveSession(root, input) {
  if (!standard(root)) return false;
  let task = null;
  try { task = getLine(fs.readFileSync(join(telosDir(root), 'STATUS.md'), 'utf8'), 'Task'); } catch {}
  const data = { version: VERSION, session: sessionKey(input?.session_id), task: TASK.test(task ?? '') ? task : null,
    edited: queuedPaths(root, input?.session_id).slice(0, MAX_PATHS) };
  fs.mkdirSync(cacheDir(root), { recursive: true });
  const tmp = join(cacheDir(root), `.session.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(data), { flag: 'wx', mode: 0o600 });
    fs.renameSync(tmp, join(cacheDir(root), 'session'));
  } finally { fs.rmSync(tmp, { force: true }); }
  return true;
}

/** @returns {{ task: string | null, edited: string[] } | null} validated data saved by this session */
export function readSession(root, sessionId) {
  let data;
  try {
    const path = join(cacheDir(root), 'session');
    const stat = fs.lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_CACHE_BYTES) return null;
    data = JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch { return null; }
  if (!data || typeof data !== 'object' || data.version !== VERSION || data.session !== sessionKey(sessionId)) return null;
  return {
    task: typeof data.task === 'string' && TASK.test(data.task) ? data.task : null,
    edited: Array.isArray(data.edited) ? data.edited.filter(validPath).slice(0, MAX_PATHS) : [],
  };
}

/** `Before compaction: …` within `budget` chars, or '' when nothing was saved or nothing fits. */
export function compactLine(root, sessionId, budget) {
  const saved = readSession(root, sessionId);
  if (!saved || (!saved.task && !saved.edited.length)) return '';
  const head = `Before compaction: task ${saved.task ?? 'none'}`;
  if (head.length > budget) return '';
  if (!saved.edited.length) return head;
  let shown = saved.edited.length;
  const line = (n) => `${head} · edited: ${saved.edited.slice(0, n).join(', ')}`
    + (n < saved.edited.length ? ` (+${saved.edited.length - n} more)` : '');
  while (shown > 0 && line(shown).length > budget) shown--;
  return shown ? line(shown) : head;
}

const tokens = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);

/** Context tokens of the last main-thread assistant message, or null when unavailable. */
export function readUsage(transcriptPath) {
  if (typeof transcriptPath !== 'string' || !transcriptPath) return null;
  let text;
  try {
    const fd = fs.openSync(transcriptPath, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const length = Math.min(size, TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, size - length);
      text = buffer.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return null; }
  for (const line of text.split('\n').reverse()) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry?.type !== 'assistant' || entry.isSidechain) continue;
    const usage = entry.message?.usage;
    const parts = [usage?.input_tokens, usage?.cache_creation_input_tokens ?? 0, usage?.cache_read_input_tokens ?? 0].map(tokens);
    if (parts.every((n) => n !== null)) return parts.reduce((a, b) => a + b, 0);
  }
  return null;
}

/** Create the once-per-session marker; @returns {boolean} true when it is new */
function firstTime(root, sessionId, threshold) {
  try {
    fs.mkdirSync(cacheDir(root), { recursive: true });
    fs.writeFileSync(join(cacheDir(root), `context-hint-${hash(`${sessionKey(sessionId)}:${threshold}`).slice(0, 32)}`), '',
      { flag: 'wx', mode: 0o600 });
    return true;
  } catch { return false; }
}

/**
 * One-line compaction hint the first time usage crosses a threshold in this session.
 * @param {string} root
 * @param {{ session_id?: string, transcript_path?: string }} input hook event
 * @param {{ window?: string }} [opts] capacity in tokens (default: TELOS_CONTEXT_WINDOW)
 * @returns {string | null}
 */
export function usageHint(root, input, { window = process.env.TELOS_CONTEXT_WINDOW } = {}) {
  if (typeof window !== 'string' || !/^\d{4,9}$/.test(window) || !standard(root)) return null;
  const used = readUsage(input?.transcript_path);
  if (used === null) return null;
  const percent = Math.floor((used * 100) / Number(window));
  const crossed = THRESHOLDS.filter((t) => percent >= t);
  if (!crossed.length) return null;
  const fresh = crossed.map((t) => firstTime(root, input?.session_id, t));
  if (!fresh.at(-1)) return null;
  return `telos context: ${percent}% of ${window} tokens used (${crossed.at(-1)}% hint). Next: unrelated work → /clear; `
    + 'same task → checkpoint, then /compact; blocked → record the blocker (telos status set blockers=…) and stop.';
}
