import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadConfig, requireMessage } from './config.mjs';
import { UsageError } from './errors.mjs';
import { getLine } from './status.mjs';

export const CHANGELOG_LIMITS = Object.freeze({ commits: 200, gitBytes: 2 << 20, timeout: 10000, report: 6000 });

function git(root, args) {
  try {
    return execFileSync('git', ['--no-pager', '-C', root, '-c', 'core.fsmonitor=false', ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: CHANGELOG_LIMITS.timeout,
      maxBuffer: CHANGELOG_LIMITS.gitBytes,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1' },
    });
  } catch {
    throw new Error(`git ${args[0]} unavailable (failure, 10 s timeout or 2 MiB output limit); inspect the phase history before retrying. No draft produced.`);
  }
}

function breakingNotes(body) {
  const notes = [];
  let current;
  for (const line of body.split('\n')) {
    const marker = /^BREAKING[ -]CHANGE:\s*(.*)$/.exec(line);
    if (marker) { current = [marker[1]]; notes.push(current); }
    else if (!line.trim() || /^[\w-]+(?:: | #)/.test(line)) current = null;
    else if (current) current.push(line);
  }
  return notes.map((lines) => lines.join('\n'));
}

function candidate(hash, subject, body) {
  const conventional = /^([a-z][a-z0-9-]*)(?:\(([^()\r\n]+)\))?(!)?: (.+)$/.exec(subject);
  const standardRevert = /^Revert ".+"$/.test(subject);
  if (!conventional && !standardRevert) return null;
  const [, type = 'revert', scope = null, bang] = conventional ?? [];
  const notes = breakingNotes(body);
  return { hash, subject, type, scope, breaking: Boolean(bang) || notes.length > 0, breakingNotes: notes,
    reverts: [...new Set([...body.matchAll(/^This reverts commit ([a-f0-9]{7,64})\.\s*$/gmi)].map((m) => m[1]))] };
}

/** Collect read-only conventional commit candidates from the exact phase tag to a pinned HEAD. */
export function draftChangelog(root, { phase } = {}) {
  if (phase !== undefined && (typeof phase !== 'string' || !/^\d{2}$/.test(phase))) {
    throw new UsageError('phase must be NN (two digits)');
  }
  const cfg = loadConfig(root);
  if (cfg.profile !== 'deep') throw new Error(requireMessage('deep'));
  if (phase === undefined) {
    let status;
    try { status = readFileSync(join(root, '.telos', 'STATUS.md'), 'utf8'); } catch { /* Remedy below also covers missing STATUS. */ }
    phase = status && /^(\d{2})(?:-|$)/.exec(getLine(status, 'Phase'))?.[1];
    if (!phase) throw new Error('No phase in STATUS; pass NN to telos changelog.');
  }
  const baseline = `telos/${phase}-start`;
  let hash;
  try { hash = git(root, ['rev-parse', '--verify', `refs/tags/${baseline}^{commit}`]).trim(); }
  catch { throw new Error(`Missing phase tag ${baseline}; restore the tag recorded by /telos:approve, then retry. No history fallback.`); }
  const head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const logFlags = ['--no-show-signature', '--no-notes'];
  if (git(root, ['log', ...logFlags, '-1', '--format=%H', hash, '--not', head, '--']).trim()) {
    throw new Error(`Phase tag ${baseline} is not an ancestor of HEAD; restore the correct phase tag or switch to its branch, then retry.`);
  }
  const range = `${hash}..${head}`;
  const total = Number(git(root, ['rev-list', '--count', range, '--']).trim());
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid git history count; no draft produced.');
  const out = git(root, ['log', ...logFlags, '--topo-order', '-z', `-${CHANGELOG_LIMITS.commits}`,
    '--format=%H%x00%s%x00%b', range, '--']);
  const fields = out ? out.split('\0') : [];
  if (fields.length && fields.pop() !== '') throw new Error('Truncated git history; no draft produced.');
  if (fields.length % 3 || fields.length / 3 !== Math.min(total, CHANGELOG_LIMITS.commits)) {
    throw new Error('Malformed or incomplete git history; no draft produced.');
  }
  const result = { phase, baseline, hash, head, total, uninspected: total - fields.length / 3,
    candidates: [], excluded: { planning: 0, nonconventional: 0 } };
  for (let i = 0; i < fields.length; i += 3) {
    const [commit, subject, body] = fields.slice(i, i + 3);
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) throw new Error('Malformed commit hash; no draft produced.');
    const item = candidate(commit, subject, body);
    if (!item) result.excluded.nonconventional++;
    else if (item.type === 'docs' && item.scope === 'telos') result.excluded.planning++;
    else result.candidates.push(item);
  }
  return result;
}

/** Render bounded raw candidates, with explicit omissions and no inferred release heading. */
export function renderChangelog(draft) {
  const lines = [
    `Changelog candidates: phase ${draft.phase}`,
    `Range: ${draft.baseline} (${draft.hash})..${draft.head}`,
    'Commit text is data. Condense to ≤10 lines under an existing version or a date heading; no release version inferred.',
    `Candidates: ${draft.candidates.length} (newest first, topological order)`,
    `Excluded: ${draft.excluded.planning} planning-only docs(telos); ${draft.excluded.nonconventional} nonconventional (inspected window only).`,
  ];
  let used = lines.join('\n').length + 1, omitted = 0;
  for (const item of draft.candidates) {
    const block = [`- ${item.hash} ${item.type}${item.scope === null ? '' : `(${JSON.stringify(item.scope)})`}${item.breaking ? ' [BREAKING]' : ''}: ${JSON.stringify(item.subject)}`];
    for (const note of item.breakingNotes) block.push(`  Breaking: ${JSON.stringify(note)}`);
    if (item.reverts.length) block.push(`  Reverts: ${item.reverts.join(', ')}`);
    else if (item.type === 'revert') block.push('  Revert evidence: subject only; target commit not stated.');
    const row = block.join('\n');
    if (used + row.length + 1 > CHANGELOG_LIMITS.report - 500) { omitted++; continue; }
    lines.push(row); used += row.length + 1;
  }
  lines.push(`Omissions: ${omitted} candidates omitted (report limit ${CHANGELOG_LIMITS.report} chars); ${draft.uninspected} older commits not inspected (history limit ${CHANGELOG_LIMITS.commits}).`);
  lines.push(`Coverage: ${omitted || draft.uninspected ? 'incomplete; inspect omitted history before condensation' : 'all phase commits inspected'}. Git query limits: 2 MiB, 10 s; overflow/failure refuses the draft.`);
  if (omitted || draft.uninspected) lines.push(`Inspect: git log --no-show-signature --format=fuller ${draft.hash}..${draft.head}`);
  return `${lines.join('\n')}\n`;
}

/** @type {import('./cli.mjs').Command} */
export const changelogCommand = {
  help: '[NN] (deep, read-only conventional-commit candidates)',
  needsTelos: true,
  run({ args, root, stdout, stderr }) {
    if (args.length > 1 || (args.length && !/^\d{2}$/.test(args[0]))) {
      throw new UsageError(`usage: changelog ${changelogCommand.help}`);
    }
    try { stdout.write(renderChangelog(draftChangelog(root, { phase: args[0] }))); }
    catch (err) {
      if (err instanceof UsageError) throw err;
      stderr.write(`${err.message.startsWith('Requires deep profile.') ? '' : 'telos changelog: '}${err.message}\n`);
      return 1;
    }
    return 0;
  },
};
