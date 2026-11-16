import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { UsageError } from './errors.mjs';
import { telosDir } from './repo.mjs';
import { phaseLine } from './roadmap.mjs';
import { render } from './template.mjs';

// Phase plans: one file per phase, `.telos/phases/NN-name.md` (goal, done when, a checklist of
// `- [ ] **NN-MM Title**` tasks, notes). The single reader for plan, close and the session.

const NN = /^\d{2}$/;
const ITEM = /^- \[([ xX])\] (.*)$/;

const phasesDir = (root) => join(telosDir(root), 'phases');

/**
 * `## ` sections of a markdown file, frontmatter skipped. Keys drop HTML comments and a trailing
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
 * Absolute path of phase `nn`'s plan: an existing `NN-*.md`, else `NN-name.md` from ROADMAP.
 * @returns {string | null} null when neither exists
 */
export function phasePath(root, nn) {
  if (!NN.test(nn ?? '')) throw new UsageError(`invalid phase '${nn ?? ''}' (expected NN)`);
  const dir = phasesDir(root);
  const found = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${nn}-`) && f.endsWith('.md')).sort() : [];
  if (found.length) return join(dir, found[0]);
  const phase = phaseLine(root, nn);
  return phase ? join(dir, `${phase.name}.md`) : null;
}

/** @returns {string} the repo-relative form of `path`, `/`-separated */
export const shown = (root, path) => relative(root, path).split('\\').join('/');

/** @typedef {{ id: string | null, text: string, done: boolean }} Item */

/**
 * Checklist state of phase `nn`: top-level `- [ ]`/`- [x]` lines under `## Tasks`.
 * @returns {{ path: string | null, exists: boolean, items: Item[], done: number, total: number }}
 */
export function checklist(root, nn) {
  const path = phasePath(root, nn);
  const exists = Boolean(path && existsSync(path));
  const body = exists ? sections(readFileSync(path, 'utf8')).get('Tasks') ?? '' : '';
  const items = body.split('\n').map((l) => ITEM.exec(l)).filter(Boolean).map(([, mark, rest]) => {
    const text = rest.replace(/\*\*/g, '').trim();
    return { id: /^(\d{2}-\d{2})\b/.exec(text)?.[1] ?? null, text, done: mark !== ' ' };
  });
  const done = items.filter((i) => i.done).length;
  return { path, exists, items, done, total: items.length };
}

/** @returns {string} the rendered phase template for ROADMAP phase `nn` */
export function phaseSkeleton(root, nn) {
  const phase = phaseLine(root, nn);
  if (!phase) throw new UsageError(`no phase ${nn} in ROADMAP`);
  return render('phase.md', { nn, name: phase.name, goal: phase.goal || '<goal>', done: phase.done || '<done when>' });
}

/**
 * Create phase `nn`'s plan from the template; an existing file is kept.
 * @returns {{ path: string, created: boolean }}
 */
export function createPhase(root, nn) {
  const text = phaseSkeleton(root, nn);
  const path = phasePath(root, nn);
  if (existsSync(path)) return { path, created: false };
  mkdirSync(phasesDir(root), { recursive: true });
  writeFileSync(path, text);
  return { path, created: true };
}
