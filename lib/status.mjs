import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadConfig } from './config.mjs';
import { UsageError } from './errors.mjs';
import { parse as parseFrontmatter } from './frontmatter.mjs';
import { telosDir } from './repo.mjs';

// STATUS.md (SPEC §4.4): fixed `Label: value` pointer lines plus two lists.
const LINES = { phase: 'Phase', task: 'Task', next: 'Next', blockers: 'Blockers', awaiting: 'Awaiting user' };
const LIST_MAX = { recent: 3, carry: 5 };
const HEADINGS = { recent: 'Recent', carry: 'Carry-over' };

const NONE = 'none';
const statusPath = (root) => join(telosDir(root), 'STATUS.md');

/** @returns {string} value of a pointer line, `none` when absent */
export function getLine(text, label) {
  return new RegExp(`^${label}: (.*)$`, 'm').exec(text)?.[1].trim() || NONE;
}

/**
 * @param {string} text STATUS.md
 * @param {Record<string, string>} values keys of LINES; empty value → `none`
 */
export function setLines(text, values) {
  let out = text;
  for (const [key, value] of Object.entries(values)) {
    const label = LINES[key];
    if (!label) throw new UsageError(`unknown key '${key}' (known: ${Object.keys(LINES).join(', ')})`);
    const re = new RegExp(`^${label}: .*$`, 'm');
    if (!re.test(out)) throw new Error(`STATUS.md has no '${label}:' line`);
    out = out.replace(re, () => `${label}: ${value.trim() || NONE}`);
  }
  return out;
}

/** Line range of a `## heading` section: [start, end) with start at the heading. */
function section(lines, heading) {
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) throw new Error(`STATUS.md has no '## ${heading}' section`);
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return { start, end };
}

/** @returns {string[]} list items without the `- ` prefix; `- none` counts as empty */
export function getList(text, list) {
  const lines = text.split('\n');
  const { start, end } = section(lines, HEADINGS[list]);
  return lines.slice(start + 1, end).filter((l) => l.startsWith('- ') && l !== `- ${NONE}`).map((l) => l.slice(2));
}

/** Replace a list's items, keeping its comment lines; an empty list becomes `- none`. */
export function setList(text, list, items) {
  const lines = text.split('\n');
  const { start, end } = section(lines, HEADINGS[list]);
  const body = lines.slice(start + 1, end);
  const kept = body.filter((l) => l.trim() && !l.startsWith('- '));
  const trailing = body.length - body.findLastIndex((l) => l.trim()) - 1;
  const entries = (items.length ? items : [NONE]).map((s) => `- ${s}`);
  const rebuilt = [...kept, ...entries, ...Array(Math.max(trailing, end < lines.length ? 1 : 0)).fill('')];
  lines.splice(start + 1, end - start - 1, ...rebuilt);
  return lines.join('\n');
}

/** @returns {string} `[status]` of a phase from ROADMAP, `?` when unknown */
function phaseState(root, phase) {
  const path = join(telosDir(root), 'ROADMAP.md');
  if (!existsSync(path)) return '?';
  const line = readFileSync(path, 'utf8').split('\n').find((l) => l.startsWith(`- ${phase} [`));
  return line?.match(/\[([^\]]+)\]/)?.[1] ?? '?';
}

/** @returns {string} status of a task from its file's frontmatter, `?` when unknown */
function taskState(root, phase, task) {
  const dir = join(telosDir(root), 'phases', phase);
  if (!existsSync(dir)) return '?';
  const file = readdirSync(dir).find((f) => f.startsWith(`${task}-`) && f.endsWith('.md'));
  if (!file) return '?';
  return parseFrontmatter(readFileSync(join(dir, file), 'utf8')).status ?? '?';
}

/**
 * Compact view (≤ 15 lines) with phase/task states read live from ROADMAP and the task file.
 * @param {string} root
 * @param {string} text STATUS.md
 */
export function view(root, text) {
  const phase = getLine(text, 'Phase');
  const task = getLine(text, 'Task');
  const awaiting = getLine(text, 'Awaiting user');
  const phasePart = phase === NONE ? 'Phase: none' : `Phase: ${phase} [${phaseState(root, phase)}]`;
  const taskPart = task === NONE ? 'Task: none' : `Task: ${task} [${phase === NONE ? '?' : taskState(root, phase, task)}]`;
  const recent = getList(text, 'recent');
  return [
    ...(awaiting === NONE ? [] : [`Awaiting user: ${awaiting}`]),
    `${phasePart} · ${taskPart}`,
    `Next: ${getLine(text, 'Next')}`,
    `Blockers: ${getLine(text, 'Blockers')}`,
    `Carry-over: ${getList(text, 'carry').length}`,
    ...(recent.length ? [`Recent: ${recent[0]}`] : []),
  ];
}

function parsePairs(args) {
  if (!args.length) throw new UsageError('set needs key=value pairs');
  return Object.fromEntries(args.map((a) => {
    const at = a.indexOf('=');
    if (at < 1) throw new UsageError(`expected key=value, got '${a}'`);
    return [a.slice(0, at), a.slice(at + 1)];
  }));
}

function listName(name) {
  if (!Object.hasOwn(LIST_MAX, name)) throw new UsageError(`unknown list '${name}' (known: recent, carry)`);
  return name;
}

/** @type {import('./cli.mjs').Command} */
export const statusCommand = {
  help: 'Show status, or: set key=value… | add recent|carry "<line>" | rm carry <n>',
  needsTelos: true,
  run({ args, root, stdout, stderr }) {
    const path = statusPath(root);
    const text = readFileSync(path, 'utf8');
    const [action, ...rest] = args;
    let next = text;

    if (action === undefined) {
      stdout.write(`${view(root, text).join('\n')}\n`);
      const limit = loadConfig(root).limits.status_lines;
      const count = text.trimEnd().split('\n').length;
      if (count > limit) stderr.write(`telos status: STATUS.md has ${count} lines (limit ${limit})\n`);
      return 0;
    } else if (action === 'set') {
      next = setLines(text, parsePairs(rest));
    } else if (action === 'add') {
      const list = listName(rest[0]);
      const line = rest.slice(1).join(' ').trim();
      if (!line) throw new UsageError(`add ${list} needs a line`);
      const items = getList(text, list);
      if (list === 'recent') next = setList(text, list, [line, ...items].slice(0, LIST_MAX.recent));
      else if (items.length >= LIST_MAX.carry) {
        stderr.write(`telos status: carry-over is full (${LIST_MAX.carry}); add a ROADMAP phase or drop an item\n`);
        return 1;
      } else next = setList(text, list, [...items, line]);
    } else if (action === 'rm') {
      if (rest[0] !== 'carry') throw new UsageError('only carry items can be removed');
      const items = getList(text, 'carry');
      const n = Number(rest[1]);
      if (!Number.isInteger(n) || n < 1 || n > items.length) throw new UsageError(`no carry item ${rest[1] ?? ''}`.trim());
      next = setList(text, 'carry', items.filter((_, i) => i !== n - 1));
    } else {
      throw new UsageError(`unknown action '${action}'`);
    }

    writeFileSync(path, next);
    return 0;
  },
};
