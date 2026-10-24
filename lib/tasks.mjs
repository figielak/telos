import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { UsageError } from './errors.mjs';
import { parse as parseFrontmatter, setField } from './frontmatter.mjs';
import { telosDir } from './repo.mjs';
import { render } from './template.mjs';

// Task files (SPEC §4.2, §4.3): the single reader for lint-plan, accept, ctx and hooks (02:D-02).

export const STATUSES = ['draft', 'approved', 'in-progress', 'done', 'blocked', 'reverted'];

const ID = /^\d{2}-\d{2}$/;
const NN = /^\d{2}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TASK_FILE = /^(\d{2}-\d{2})-.+\.md$/;

/** A missing or unreadable task, phase or ROADMAP line: the CLI reports it with exit 1. */
export class TaskError extends Error {}

/** @typedef {{ id: string, nn: string, path: string, meta: Record<string, unknown>,
 *   sections: Map<string, string>, text: string }} Task */

const phasesDir = (root) => join(telosDir(root), 'phases');

function checkNN(nn) {
  if (!NN.test(nn ?? '')) throw new UsageError(`invalid phase '${nn ?? ''}' (expected NN)`);
}

function checkId(id) {
  if (!ID.test(id ?? '')) throw new UsageError(`invalid task id '${id ?? ''}' (expected NN-MM)`);
}

/**
 * `## ` sections of a task file, frontmatter skipped. Keys drop HTML comments and a trailing
 * `(…)`, so `## Tests (write first) <!-- … -->` is `Tests`; bodies are trimmed, comments kept.
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function sections(text) {
  let lines = text.split('\n');
  if (lines[0] === '---') lines = lines.slice(lines.indexOf('---', 1) + 1);
  const out = new Map();
  let name = null;
  let body = [];
  const flush = () => { if (name !== null) out.set(name, body.join('\n').trim()); };
  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      name = line.slice(3).replace(/<!--.*?-->/g, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      body = [];
    } else body.push(line);
  }
  flush();
  return out;
}

/** @returns {string[]} `- x` lines of a section body as `x`; `- none` counts as empty */
export function listItems(body) {
  return (body ?? '').split('\n').filter((l) => l.startsWith('- ') && l.trim() !== '- none').map((l) => l.slice(2).trim());
}

/**
 * @param {string} root
 * @param {string} nn phase number
 * @returns {string | null} `.telos/phases/NN-*`, null when absent
 * @throws {TaskError} when two directories share the number
 */
export function phaseDir(root, nn) {
  checkNN(nn);
  const dir = phasesDir(root);
  if (!existsSync(dir)) return null;
  const found = readdirSync(dir).filter((d) => d.startsWith(`${nn}-`) && statSync(join(dir, d)).isDirectory()).sort();
  if (found.length > 1) throw new TaskError(`phase ${nn} has several directories: ${found.join(', ')}`);
  return found.length ? join(dir, found[0]) : null;
}

function readTask(root, path) {
  const text = readFileSync(path, 'utf8');
  let meta;
  try {
    meta = parseFrontmatter(text);
  } catch (err) {
    throw new TaskError(`${relative(root, path)}: ${err.message}`);
  }
  const id = TASK_FILE.exec(path.split(/[\\/]/).pop())[1];
  return { id, nn: id.slice(0, 2), path, meta, sections: sections(text), text };
}

const taskFiles = (dir) => readdirSync(dir).filter((f) => TASK_FILE.test(f)).sort();

/** @returns {Task[]} tasks of a phase sorted by id; `[]` when the phase has no directory */
export function phaseTasks(root, nn) {
  const dir = phaseDir(root, nn);
  return dir ? taskFiles(dir).map((f) => readTask(root, join(dir, f))) : [];
}

/**
 * @param {string} root
 * @param {string} id `NN-MM`
 * @returns {Task}
 * @throws {UsageError} malformed id; {TaskError} missing task
 */
export function loadTask(root, id) {
  checkId(id);
  const dir = phaseDir(root, id.slice(0, 2));
  const files = dir ? taskFiles(dir).filter((f) => f.startsWith(`${id}-`)) : [];
  if (!files.length) throw new TaskError(`no task ${id}`);
  if (files.length > 1) throw new TaskError(`task ${id} has several files: ${files.join(', ')}`);
  return readTask(root, join(dir, files[0]));
}

/**
 * Next task (02:D-08): the first `in-progress` one, else the first `approved` one whose
 * depends are all `done`. Depends on tasks outside `tasks` (other phases) are not checked here.
 * @param {Pick<Task, 'id' | 'meta'>[]} tasks sorted by id
 */
export function nextTask(tasks) {
  const active = tasks.find((t) => t.meta.status === 'in-progress');
  if (active) return active;
  const status = new Map(tasks.map((t) => [t.id, t.meta.status]));
  const ready = (d) => !status.has(d) || status.get(d) === 'done';
  return tasks.find((t) => t.meta.status === 'approved' && (t.meta.depends ?? []).every(ready)) ?? null;
}

/** @returns {string} `NN-name` of the phase's ROADMAP line */
function roadmapPhase(root, nn) {
  const path = join(telosDir(root), 'ROADMAP.md');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const name = new RegExp(`^- (${nn}-[a-z0-9-]+) \\[`, 'm').exec(text)?.[1];
  if (!name) throw new TaskError(`no phase ${nn} in ROADMAP.md`);
  return name;
}

function newTask(root, [nn, slug, ...words]) {
  checkNN(nn);
  if (!SLUG.test(slug ?? '')) throw new UsageError(`slug '${slug ?? ''}' must be kebab-case`);
  const title = words.join(' ').trim();
  if (!title) throw new UsageError('new needs a title: task new <NN> <slug> "<title>"');
  const dir = phaseDir(root, nn) ?? join(phasesDir(root), roadmapPhase(root, nn));
  mkdirSync(dir, { recursive: true });
  const mm = Math.max(0, ...taskFiles(dir).map((f) => Number(f.slice(3, 5)))) + 1;
  if (mm > 99) throw new TaskError(`phase ${nn} has no free task number`);
  const id = `${nn}-${String(mm).padStart(2, '0')}`;
  const path = join(dir, `${id}-${slug}.md`);
  // Render with a placeholder so YAML-special characters in the title go through setField.
  writeFileSync(path, setField(render('task.md', { id, title: 'x' }), 'title', title));
  return `created ${relative(root, path)}`;
}

function setTasks(root, args) {
  const ids = args.filter((a) => !a.includes('='));
  const pairs = args.filter((a) => a.includes('='));
  if (!ids.length || !pairs.length) throw new UsageError('set needs ids and status=<s>: task set <id>… status=<s>');
  let status;
  for (const pair of pairs) {
    const [key, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
    if (key !== 'status') throw new UsageError(`only status can be set (got '${key}')`);
    if (!STATUSES.includes(value)) throw new UsageError(`unknown status '${value}' (allowed: ${STATUSES.join(', ')})`);
    status = value;
  }
  const tasks = ids.map((id) => loadTask(root, id)); // all validated before any write
  for (const t of tasks) writeFileSync(t.path, setField(t.text, 'status', status));
  return `${ids.join(', ')} status=${status}`;
}

function removeTask(root, [id, ...extra]) {
  if (extra.length) throw new UsageError('rm takes one task id');
  const t = loadTask(root, id);
  if (t.meta.status !== 'draft') throw new TaskError(`${id} is ${t.meta.status}; only draft tasks can be removed`);
  rmSync(t.path);
  return `removed ${relative(root, t.path)}`;
}

/** @type {import('./cli.mjs').Command} */
export const taskCommand = {
  help: 'new <NN> <slug> "<title>" | set <id>… status=<s> | rm <id>',
  needsTelos: true,
  run({ args, root, stdout, stderr }) {
    const [action, ...rest] = args;
    const actions = { new: newTask, set: setTasks, rm: removeTask };
    if (!Object.hasOwn(actions, action ?? '')) throw new UsageError(`unknown action '${action ?? ''}' (new, set, rm)`);
    try {
      stdout.write(`${actions[action](root, rest)}\n`);
      return 0;
    } catch (err) {
      if (!(err instanceof TaskError)) throw err;
      stderr.write(`telos task: ${err.message}\n`);
      return 1;
    }
  },
};
