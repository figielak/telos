import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { load as loadConfig } from '../config.mjs';
import { refExists } from '../git.mjs';
import { telosDir } from '../repo.mjs';
import { getLine } from '../status.mjs';
import { listItems, loadTask, nextTask, phaseDir, phaseTasks, sections, TaskError } from '../tasks.mjs';
import { decisionBlocks, statusPhase, statusText } from './approve.mjs';
import { CAP, stripComments } from './index.mjs';
import { stackLine } from './stack.mjs';

// Bundle for /telos:do (SPEC §5.1 step 1): the task plus exact excerpts, never whole files.
// Refusals print `REFUSED: …` with exit 0 so the skill's injection still shows them (02:D-08).

const RUNNABLE = ['approved', 'in-progress', 'blocked'];
const WHOLE_FILE_MAX = 80;
const SECTION_MAX = 60;
const MAP_MAX = 10;
const NOT_BUILT = 'Not built yet: run `/telos:map`. Until then, locate code with targeted Glob/Grep; never read the whole repo.';
const RANGE_REF = /^(\S+?):(\d+)(?:-(\d+))?(?:\s+\((.*)\))?$/;
const SECTION_REF = /^(\S+\.md)\s+(§.+?)(?:\s+\((.*)\))?$/;
const PATH_REF = /^(\S+\.\w+)(?:\s+(.*))?$/;

const readTelos = (root, file) => {
  const path = join(telosDir(root), file);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

/** @returns {boolean} the file differs from `since` (work tree vs. ref); false when unknown */
function changedSince(root, path, since) {
  if (!since) return false;
  return spawnSync('git', ['-C', root, 'diff', '--quiet', since, '--', path], { stdio: 'ignore' }).status === 1;
}

/** Lines of `## …` sections whose heading matches a `§token` (numbered headings match exactly). */
function markdownSections(text, tokens) {
  const lines = text.split('\n');
  const headings = lines.map((l, i) => ({ i, m: /^(#{1,6}) (.*)$/.exec(l) })).filter((h) => h.m);
  const matches = (title, token) => {
    const t = token.toLowerCase();
    const s = title.toLowerCase();
    return /^\d/.test(token) ? s === t || s.startsWith(`${t} `) || s.startsWith(`${t}. `) : s === t || s.startsWith(`${t} `);
  };
  const out = [];
  for (const token of tokens) {
    const h = headings.find((x) => matches(x.m[2].trim(), token));
    if (!h) return { missing: token };
    const level = h.m[1].length;
    const end = headings.find((x) => x.i > h.i && x.m[1].length <= level)?.i ?? lines.length;
    out.push(lines.slice(h.i, end).join('\n').trim());
  }
  return { text: out.join('\n\n') };
}

/**
 * Resolve one `Read first` item.
 * @param {string} root
 * @param {string} ref `path:start-end (label)` | `FILE.md §A[, §B] (label)` | `path (label)`
 * @param {{ since?: string }} [opts] ref to compare files with (the phase tag)
 * @returns {{ label: string, text: string, note?: string }}
 */
export function resolveRef(root, ref, opts = {}) {
  const label = ref.trim();
  const range = RANGE_REF.exec(label);
  if (range) {
    const [, file, from, to = from] = range;
    const path = join(root, file);
    if (!existsSync(path)) return { label, text: '', note: `missing: ${file} (re-locate by label)` };
    const lines = readFileSync(path, 'utf8').replace(/\n$/, '').split('\n');
    const start = Math.max(1, Number(from));
    const end = Math.min(lines.length, Number(to));
    const out = { label, text: lines.slice(start - 1, end).join('\n') };
    if (Number(to) > lines.length) out.note = `file has ${lines.length} lines`;
    if (changedSince(root, file, opts.since)) out.note = 'changed since plan, re-locate by label';
    return out;
  }
  const section = SECTION_REF.exec(label);
  if (section) {
    const [, file, refs] = section;
    const path = [join(telosDir(root), file), join(root, file)].find(existsSync);
    if (!path) return { label, text: '', note: `missing: ${file}` };
    const tokens = refs.split(',').map((s) => s.trim().replace(/^§\s*/, '')).filter(Boolean);
    const found = markdownSections(stripComments(readFileSync(path, 'utf8')), tokens);
    if (found.missing) return { label, text: '', note: `no section §${found.missing} in ${file}` };
    const lines = found.text.split('\n');
    if (lines.length <= SECTION_MAX) return { label, text: found.text };
    return { label, text: lines.slice(0, SECTION_MAX).join('\n'), note: `first ${SECTION_MAX} of ${lines.length} lines` };
  }
  const whole = PATH_REF.exec(label);
  const path = whole && join(root, whole[1]);
  if (path && existsSync(path)) {
    const text = readFileSync(path, 'utf8').trimEnd();
    const count = text.split('\n').length;
    if (count <= WHOLE_FILE_MAX) return { label, text };
    return { label, text: '', note: `not included (${count} lines); open the part you need` };
  }
  return { label, text: '', note: 'unresolved: open it if needed' };
}

/** @returns {string | null} REFUSED reason for a task that may not run yet */
function refusal(root, task) {
  const { id, meta } = task;
  if (meta.status === 'draft') return `${id} is draft, run /telos:approve`;
  if (!RUNNABLE.includes(meta.status)) return `${id} is ${meta.status}`;
  for (const dep of meta.depends ?? []) {
    let status;
    try { status = loadTask(root, dep).meta.status; } catch (err) {
      if (!(err instanceof TaskError)) throw err;
      status = 'missing';
    }
    if (status !== 'done') return `${id} depends on ${dep} [${status}]`;
  }
  const blocked = decisionBlocks(root, task)[0];
  if (blocked) return `decision ${blocked.split(' ')[0]} awaits the user`;
  return null;
}

/** @returns {string} decisions referenced by the task and the CONTEXT goal (std+ phases with a CONTEXT) */
function contextLines(root, task) {
  const dir = phaseDir(root, task.nn);
  const path = dir && join(dir, `${task.nn}-CONTEXT.md`);
  if (!path || !existsSync(path)) return '';
  const context = stripComments(readFileSync(path, 'utf8'));
  const goal = (sections(context).get('Goal') ?? '').trim();
  const wanted = new Set(task.meta.decisions ?? []);
  const decisions = context.split('\n').filter((l) => wanted.has(/^- (D-\d{2})/.exec(l)?.[1]));
  return [goal && `Phase goal: ${goal}`, decisions.length && ['Decisions:', ...decisions].join('\n')].filter(Boolean).join('\n');
}

function interfaces(root, task) {
  return (task.meta.depends ?? []).flatMap((dep) => {
    try {
      const body = loadTask(root, dep).sections.get('Interface');
      return body ? [`Interface of ${dep}:\n${stripComments(body).trim()}`] : [];
    } catch (err) {
      if (err instanceof TaskError) return [];
      throw err;
    }
  });
}

function mapLines(root, task) {
  const map = readTelos(root, 'MAP.md');
  if (!map) return '';
  if (map.includes('telos-map: not built')) return `Map: ${NOT_BUILT}`;
  const scope = (task.meta.scope ?? []).map(String).filter((s) => s !== '*' && s !== '.telos/').map((s) => s.replace(/\*.*$/, ''));
  const lines = stripComments(map).split('\n').filter((l) => l.startsWith('- ') && scope.some((s) => s && l.includes(s)));
  return lines.length ? ['Map:', ...lines.slice(0, MAP_MAX)].join('\n') : '';
}

/**
 * Fit excerpt blocks into `budget` chars: short blocks stay whole, long ones share the rest
 * equally (water-filling) and end with a marker naming the ref to open.
 */
function fitExcerpts(blocks, budget) {
  const alloc = new Array(blocks.length);
  let remaining = budget;
  let left = blocks.length;
  for (const i of blocks.map((_, i) => i).sort((a, b) => blocks[a].text.length - blocks[b].text.length)) {
    alloc[i] = Math.min(blocks[i].text.length + 1, Math.floor(remaining / left));
    remaining -= alloc[i];
    left--;
  }
  return blocks.map(({ text, ref }, i) => {
    if (text.length + 1 <= alloc[i]) return text;
    const marker = `…[cut; open ${ref} for the rest]`;
    const head = text.slice(0, Math.max(0, alloc[i] - marker.length - 2)).replace(/\n[^\n]*$/, '');
    return head.includes('\n') ? `${head}\n${marker}` : `${text.split('\n')[0]}\n${marker}`;
  }).join('\n');
}

/** Bundle for /telos:do [id]. */
export function doBundle({ root, args }) {
  let task;
  if (args[0]) {
    task = loadTask(root, args[0]);
  } else {
    const nn = statusPhase(root);
    if (!nn) return 'REFUSED: no phase in STATUS; run /telos:plan';
    const tasks = phaseTasks(root, nn);
    task = nextTask(tasks);
    if (!task) {
      if (tasks.length && tasks.every((t) => t.meta.status === 'done')) return 'REFUSED: no approved task (phase complete)';
      const states = tasks.map((t) => `${t.id} [${t.meta.status}]`).join(', ') || 'no tasks';
      return `REFUSED: no runnable task in phase ${nn} (${states})`;
    }
  }
  const why = refusal(root, task);
  if (why) return `REFUSED: ${why}`;

  const { meta } = task;
  const cfg = loadConfig(root);
  const status = statusText(root);
  const project = sections(stripComments(readTelos(root, 'PROJECT.md')));
  const rules = listItems(project.get('Rules'));
  const checks = Object.entries(cfg.checks ?? {});
  const tag = `telos/${task.nn}-start`;
  const since = refExists(root, tag) ? tag : undefined;

  const fixed = [
    `Task: ${task.id} [${meta.status}] ${meta.title ?? ''} · type ${meta.type} · effort ${meta.effort ?? 'normal'}`,
    ...(meta.effort === 'hard' ? [`HINT: effort hard → suggest /telos:do-hard ${task.id} before any work`] : []),
    `File: ${relative(root, task.path)}`,
    stripComments(task.text).trim(),
    `Status: phase ${getLine(status, 'Phase')} · task ${getLine(status, 'Task')} · next ${getLine(status, 'Next')} · blockers ${getLine(status, 'Blockers')}`,
    rules.length ? ['Rules:', ...rules.map((r) => `- ${r}`)].join('\n') : 'Rules: none',
    stackLine(root, cfg),
    `Checks: ${checks.length ? checks.map(([k, v]) => `${k}=${v}`).join(' · ') : 'none'}`,
    `Auto-commit: ${cfg.git.auto_commit ? 'yes' : 'no'}`,
    contextLines(root, task),
    ...interfaces(root, task),
  ].filter(Boolean).join('\n');

  const refs = listItems(task.sections.get('Read first'));
  const blocks = refs.map((ref) => {
    const r = resolveRef(root, ref, { since });
    return { ref: ref.replace(/\s+\(.*\)$/, ''), text: `--- ${r.label}${r.note ? ` [${r.note}]` : ''}${r.text ? `\n${r.text}` : ''}` };
  });
  const map = mapLines(root, task);
  const head = `${fixed}\n${blocks.length ? 'Read first:' : 'Read first: none'}`;
  const budget = CAP - head.length - (map ? map.length + 1 : 0) - 1;
  return [head, fitExcerpts(blocks, budget), map].filter(Boolean).join('\n');
}
