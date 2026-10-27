import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join, relative } from 'node:path';

import { UsageError } from './errors.mjs';
import { isRepo, refExists, reviewDiff, reviewHistory, reviewUntracked } from './git.mjs';
import { telosDir } from './repo.mjs';
import { inScope } from './scope.mjs';
import { getLine } from './status.mjs';
import { loadTask, phaseDir, phaseTasks, TaskError } from './tasks.mjs';

export class ReviewError extends Error {}
const refuse = (reason) => { throw new ReviewError(`REFUSED: ${reason}`); };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const command = (args) => ['git', ...args.map(quote)].join(' ');
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

/** Validate a selector; STATUS task takes priority over phase when omitted. */
export function reviewTarget(root, selector) {
  if (selector !== undefined && !/^\d{2}(?:-\d{2})?$/.test(selector)) throw new UsageError('usage: ctx review [NN-MM|NN]');
  if (selector === undefined) {
    const status = read(join(telosDir(root), 'STATUS.md'));
    const task = getLine(status, 'Task');
    selector = task !== 'none' ? task : /^(\d{2})(?:-|$)/.exec(getLine(status, 'Phase'))?.[1];
    if (!/^\d{2}(?:-\d{2})?$/.test(selector ?? '')) refuse('no valid target in STATUS; pass NN-MM or NN, or set STATUS task/phase');
  }
  return { kind: selector.length === 5 ? 'task' : 'phase', id: selector };
}

function acceptanceOf(root, task) {
  const text = task.sections.get('Acceptance') ?? '';
  const lines = task.text.split('\n');
  const start = lines.findIndex((l) => /^## Acceptance(?:\s|$)/.test(l));
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  const path = relative(root, task.path);
  return { id: task.id, path, text, continuation: start >= 0
    ? `Read ${JSON.stringify(path)} lines ${start + 1}-${end} (Acceptance)`
    : `Read ${JSON.stringify(path)}; restore the missing Acceptance section` };
}

function untrackedBlock(root, path) {
  const file = join(root, path);
  const stat = lstatSync(file);
  const symlink = stat.isSymbolicLink();
  if (!symlink && !stat.isFile()) return {
    source: 'untracked', changes: [{ path, status: '??', kind: 'unavailable' }], text: '',
    continuation: `Inspect untracked directory ${JSON.stringify(path)} separately`,
  };
  const content = symlink ? Buffer.from(readlinkSync(file)) : readFileSync(file);
  const binary = content.includes(0) || !Buffer.from(content.toString('utf8')).equals(content);
  const digest = hash(content);
  const kind = symlink ? 'symlink' : binary ? 'binary' : 'untracked';
  return {
    source: 'untracked', changes: [{ path, status: '??', kind, bytes: content.length, digest, mode: stat.mode & 0o777 }],
    text: symlink ? `Symlink target: ${JSON.stringify(content.toString('utf8'))}`
      : binary ? `Binary untracked file (${content.length} bytes, sha256 ${digest}); no text diff.` : content.toString('utf8'),
    continuation: symlink ? `Read link target of ${JSON.stringify(path)} without following it`
      : binary ? `Inspect binary file ${JSON.stringify(path)} (sha256 ${digest})`
        : `Read ${JSON.stringify(path)} lines 1-${content.toString('utf8').split('\n').length} (untracked)`,
  };
}

/** Read-only task/phase evidence. Full patches feed evidenceId; the bundle budgets presentation only. */
export function reviewEvidence(root, selector) {
  const target = reviewTarget(root, selector);
  const nn = target.id.slice(0, 2);
  let tasks;
  try {
    tasks = target.kind === 'task' ? [loadTask(root, target.id)] : phaseTasks(root, nn);
  } catch (err) {
    if (!(err instanceof TaskError)) throw err;
    refuse(`${err.message}; select an existing target or run /telos:plan`);
  }
  if (!tasks.length) refuse(`phase ${nn} has no task files; select an existing phase or run /telos:plan`);
  if (!isRepo(root)) refuse('not a git work tree; run review in the target repository');
  const tag = `telos/${nn}-start`;
  if (!refExists(root, tag)) refuse(`tag ${tag} is missing; create it at the phase plan commit (git tag ${tag} <commit>), then rerun`);
  const history = reviewHistory(root, tag, target.kind === 'task' ? target.id : undefined);
  if (!history) refuse('git history unavailable; restore the phase tag and HEAD, then rerun');
  const scope = tasks.flatMap((t) => Array.isArray(t.meta.scope) ? t.meta.scope.map(String) : []);
  const selected = (c) => target.kind === 'phase' || inScope(c.path, scope) || (c.oldPath && inScope(c.oldPath, scope));
  const diffBlocks = [];
  const append = (source, revisions, select) => {
    const diff = reviewDiff(root, revisions, select);
    if (!diff) refuse(`git diff unavailable for ${source}; inspect git diff ${revisions.join(' ')} and rerun`);
    if (diff.changes.length) diffBlocks.push({ source, changes: diff.changes, text: diff.text, continuation: command(diff.args) });
  };
  if (target.kind === 'phase') append('phase', [history.baseline, history.head]);
  else for (const c of history.commits) {
    for (const parent of c.parents) append(`commit ${c.hash} parent ${parent}`, [parent, c.hash]);
  }
  append('index', ['--cached', history.head], selected);
  append('worktree', [], selected);
  const untracked = reviewUntracked(root);
  if (!untracked) refuse('git status unavailable; restore repository access and rerun');
  for (const path of untracked.filter((path) => selected({ path }))) {
    try { diffBlocks.push(untrackedBlock(root, path)); } catch (err) {
      refuse(`cannot read untracked path ${JSON.stringify(path)} (${err.code}); restore access and rerun`);
    }
  }
  const changes = diffBlocks.flatMap((b) => b.changes.map((c) => ({ source: b.source, ...c })));
  const acceptance = tasks.map((t) => acceptanceOf(root, t));
  const paths = [...new Set(changes.flatMap((c) => [c.path, c.oldPath].filter(Boolean)))];
  const mapPath = join(telosDir(root), 'MAP.md');
  const mapText = read(mapPath);
  const map = mapText.replace(/<!--[\s\S]*?-->/g, '').split('\n')
    .filter((l) => l.startsWith('- ') && paths.some((p) => l.includes(p)));
  const notes = [];
  for (const c of changes) {
    if (['binary', 'conflict', 'submodule', 'unavailable'].includes(c.kind)) {
      notes.push(`${c.kind} evidence needs separate inspection: ${JSON.stringify(c.path)} (${c.source})`);
    }
  }
  for (const a of acceptance) if (!a.text) notes.push(`missing Acceptance for ${a.id}: ${a.continuation}`);
  const result = { target, tag, baseline: history.baseline, head: history.head, commits: history.commits.map((c) => c.hash),
    changes, diffBlocks, acceptance, map,
    mapContinuation: `Read ${JSON.stringify('.telos/MAP.md')} lines 1-${mapText.split('\n').length}`,
    notes, complete: notes.length === 0 };
  result.evidenceId = hash(JSON.stringify({ ...result, scope }));
  result.phasePath = relative(root, phaseDir(root, nn));
  return result;
}
