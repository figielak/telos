import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../lib/cli.mjs';
import { loadTask } from '../lib/tasks.mjs';

// CLI-level proof of the deep workflow. This harness plays the skills and supplies the reviewer,
// researcher and confirmation outcomes itself: it never starts Claude, a forked agent or a web
// search, so it proves the deterministic CLI contracts, not live-host or model behavior.
const FIXTURE = fileURLToPath(new URL('fixtures/deep-loop/', import.meta.url));
const HOOKS = fileURLToPath(new URL('../hooks/', import.meta.url));
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PHASE = '.telos/phases/01-store';
const CONTEXT = `${PHASE}/01-CONTEXT.md`;
const RESEARCH = `${PHASE}/01-RESEARCH.md`;
const STATUS = '.telos/STATUS.md';
const ROADMAP = '.telos/ROADMAP.md';
const HISTORY = '.telos/HISTORY.md';
const LESSONS = '.telos/LESSONS.md';
const ADR = '.telos/decisions/001-use-pure-message-modules.md';
const CHECKS = { test: 'node src/index.mjs test', e2e: 'node src/index.mjs e2e' };
const DEEP_GATE = 'Requires deep profile. Switch with /telos:profile deep.\n';
const TASKS = { '01-01': { name: 'greet', word: 'Hello', critical: true, decision: 'D-01', depends: [] },
  '01-02': { name: 'farewell', word: 'Bye', critical: false, decision: 'D-02', depends: ['01-01'] } };
const taskPath = (id) => `${PHASE}/${id}-${TASKS[id].name}.md`;
const source = (id) => `src/${TASKS[id].name}.mjs`;

const read = (root, path) => readFileSync(join(root, path), 'utf8');
const write = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const today = () => new Date().toISOString().slice(0, 10);

async function telos(root, ...args) {
  const out = { text: '', write(s) { out.text += s; } };
  const err = { text: '', write(s) { err.text += s; } };
  const context = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const code = await main(args, { cwd: root, stdout: out, stderr: err });
    if (args[0] === 'ctx') assert.ok(out.text.trimEnd().length <= 6000, `${args.join(' ')} over the cap`);
    return { code, stdout: out.text, stderr: err.text };
  } finally {
    if (context !== undefined) process.env.NODE_TEST_CONTEXT = context;
  }
}

async function ok(root, ...args) {
  const r = await telos(root, ...args);
  assert.equal(r.code, 0, `telos ${args.join(' ')}: ${r.stdout}${r.stderr}`);
  return r.stdout;
}

function commit(root, subject, paths) {
  git(root, 'add', '--', ...paths);
  git(root, 'commit', '-q', '-m', subject, '-m', '- Exercise the deep workflow in an isolated fixture');
  return git(root, 'rev-parse', 'HEAD').trim();
}

const run = (root, command) => {
  const [cmd, ...args] = command.split(' ');
  return spawnSync(cmd === 'node' ? process.execPath : cmd, args, { cwd: root, encoding: 'utf8' });
};

function hook(root, name, payload = {}) {
  const r = spawnSync(process.execPath, [join(HOOKS, `${name}.mjs`)], {
    cwd: root, encoding: 'utf8', timeout: 10000, input: JSON.stringify({ cwd: root, session_id: 'deep-loop', ...payload }),
  });
  assert.ifError(r.error);
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const phaseEntries = (root) => (read(root, HISTORY).match(/^- \d{4}-\d{2}-\d{2} phase 01: .*$/gm) ?? []);

async function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'telos-deep-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(FIXTURE, root, { recursive: true });
  git(root, 'init', '-q');
  for (const [key, value] of [['user.name', 'Telos test'], ['user.email', 'test@example.com'],
    ['commit.gpgsign', 'false'], ['tag.gpgsign', 'false'], ['core.hooksPath', join(root, '.git/hooks')]]) {
    git(root, 'config', key, value);
  }
  commit(root, 'build: initialize fixture', ['package.json', 'README.md', 'src/index.mjs', 'docs/api.md']);
  await ok(root, 'init', '--profile', 'minimal', '--checks', JSON.stringify(CHECKS));
  await ok(root, 'profile', 'deep');
  assert.ok(existsSync(join(root, '.telos/decisions')));
  commit(root, 'docs(telos): initialize deep', ['.telos/config.json', '.telos/PROJECT.md', '.telos/MAP.md', ROADMAP,
    STATUS, HISTORY, LESSONS, 'CLAUDE.md', '.gitignore']);
  return root;
}

const contextText = (proposed) => `# 01 · store
## Goal
Ship message modules with a public message(name) function.
## Decisions
- D-01${proposed ? ' [proposed]' : ''}: Use pure message modules, one file per message under src/.
- D-02: Keep farewell wording short.
## Constraints
- No dependencies.
## Open questions
- none
## Carried over
- none
## Links
- ${RESEARCH}
`;

/** The researcher's ≤ 60-line report, persisted by the main thread only when none exists (D-06). */
const REPORT = '# 01 · Research\n## Recommendations\n- Keep each message a pure ESM export.\n## Sources\n- node:test docs (offline stub)\n';

function draft(root, id) {
  const { name, critical, decision, depends } = TASKS[id];
  const detailed = critical ? `## Interface
- export const message = (name) => string
## Edge cases
- Empty name still formats.
` : '';
  const body = `## Goal
Add the ${name} message.
## Read first
- src/index.mjs:1-12 (fixture checks)
## Files
- ${source(id)} (create)
## Constraints
- No dependencies.
## Tests (write first)
- The fixture check validates the ${name} message.
${detailed}## Steps
1. Write a failing stub, implement, check.
## Acceptance
- [ ] all listed tests pass
- [ ] \`node src/index.mjs test\` → exit 0
- [ ] docs/api.md still describes the message API.
## Result
`;
  const text = read(root, taskPath(id));
  write(root, taskPath(id), text.replace('critical: false', `critical: ${critical}`)
    .replace('depends: []', `depends: [${depends.join(', ')}]`).replace('decisions: []', `decisions: [${decision}]`)
    .replace('scope: []', `scope: [${source(id)}]`).replace(/## Goal\n[\s\S]*$/, body));
}

/** research → proposed CONTEXT → confirmation → plan → approve, all through the CLI. */
async function plan(root) {
  await ok(root, 'roadmap', 'add', 'store', 'message modules', 'messages verified end to end');
  await ok(root, 'status', 'set', 'phase=01-store', 'task=none', 'next=/telos:discuss');
  write(root, CONTEXT, contextText(true));
  const research = await ok(root, 'ctx', 'research', '01');
  assert.match(research, new RegExp(`^Report: ${RESEARCH.replaceAll('.', '\\.')}$`, 'm'));
  assert.match(research, /^Report status: missing/m);
  write(root, RESEARCH, REPORT);
  assert.match(await ok(root, 'ctx', 'research', '01'), /^Report status: exists \(\d+ lines\) — preserve it/m);
  const planned = await ok(root, 'ctx', 'plan', '01');
  assert.match(planned, /Research \(.*01-RESEARCH\.md; evidence only/);
  for (const id of Object.keys(TASKS)) {
    await ok(root, 'task', 'new', '01', TASKS[id].name, `Add ${TASKS[id].name}`);
    draft(root, id);
  }
  assert.match(await ok(root, 'lint-plan', '01'), /^ok: 2 tasks/);
  await ok(root, 'roadmap', 'set', '01', 'drafted');
  assert.match(await ok(root, 'ctx', 'approve'), /^Blocked:\n- 01-01: D-01 is proposed/m);
  write(root, CONTEXT, contextText(false)); // the user's explicit confirmation in /telos:discuss
  assert.doesNotMatch(await ok(root, 'ctx', 'approve'), /^Blocked:\n- /m);
  await ok(root, 'task', 'set', '01-01', '01-02', 'status=approved');
  await ok(root, 'roadmap', 'set', '01', 'active');
  await ok(root, 'status', 'set', 'task=01-01', 'next=/telos:do');
  commit(root, 'docs(telos): plan phase 01-store', [CONTEXT, RESEARCH, ROADMAP, STATUS, taskPath('01-01'), taskPath('01-02')]);
  git(root, 'tag', 'telos/01-start');
}

/** RED counts only as an assertion failure of the missing behavior, never an environment failure. */
function realRed(r) {
  return r.status !== 0 && /AssertionError/.test(r.stderr) && !/SyntaxError|ERR_MODULE_NOT_FOUND|Cannot find module/.test(r.stderr);
}

/**
 * A stub reviewer: it reports the bundle's EvidenceId and never a clean verdict on incomplete
 * coverage. Like the agent, it may inspect listed `Read "<path>"` continuations (here: the file
 * must exist in `root`); anything else omitted keeps the coverage UNVERIFIED.
 */
function reviewer(bundle, verdict = 'PASS', root = null) {
  const id = /^EvidenceId: (\S+)$/m.exec(bundle)[1];
  const reads = [...bundle.matchAll(/^\| Read "([^"]+)" lines \d+-\d+/gm)].map((m) => m[1]);
  const inspected = root && reads.length > 0 && reads.every((p) => existsSync(join(root, p)))
    && !/needs separate inspection/.test(bundle);
  const complete = /^Completeness: COMPLETE/m.test(bundle) || inspected;
  const final = complete ? verdict : 'UNVERIFIED';
  return { id, verdict: final, text: [`Review · EvidenceId ${id} · Coverage: ${complete ? 'COMPLETE' : 'UNVERIFIED (omitted evidence)'}`,
    ...(final === 'CHANGES REQUESTED' ? ['HIGH 90% src/greet.mjs:1 — wrong greeting. Scenario: x. Impact: y.'] : []),
    `Verdict: ${final}`].join('\n') };
}

/** Play /telos:do for one task; `red: 'syntax'` makes the first run an environment failure. */
async function doTask(root, id, { red = 'assert', recordRed = true } = {}) {
  const { name, word, critical } = TASKS[id];
  const bundle = await ok(root, 'ctx', 'do', id);
  assert.match(bundle, /^Profile: deep$/m);
  if (critical) {
    assert.match(bundle, new RegExp(`^- GREEN/e2e: \`telos check --level full --task ${id}\` → exit 0 incl\\. e2e=node src/index\\.mjs e2e$`, 'm'));
    assert.match(bundle, new RegExp(`telos:reviewer-hard with \`telos ctx review ${id}\``));
  } else assert.doesNotMatch(bundle, /Deep critical/);
  await ok(root, 'task', 'set', id, 'status=in-progress');
  await ok(root, 'status', 'set', `task=${id}`, `next=finish ${id}`);
  write(root, source(id), red === 'syntax' ? 'export const message = (name) => {\n' : 'export const message = () => \'\';\n');
  const first = run(root, CHECKS.test);
  const lines = [`Added ${name}; fixture checks pass.`];
  if (critical) {
    assert.equal(realRed(first), red === 'assert', 'only an assertion failure is RED');
    if (realRed(first) && recordRed) lines.push(`RED: ${CHECKS.test} → exit ${first.status}: message returned '' (AssertionError)`);
  }
  write(root, source(id), `export const message = (name) => \`${word}, \${name}!\`;\n`);
  let review = null;
  if (critical) {
    const green = await telos(root, 'check', '--level', 'full', '--task', id);
    assert.equal(green.code, 0, green.stdout);
    lines.push(`GREEN: telos check --level full --task ${id} → exit 0 · e2e PASS`);
    review = reviewer(await ok(root, 'ctx', 'review', id));
    assert.equal(review.verdict, 'PASS');
    lines.push(`Review: ${review.verdict} · EvidenceId ${review.id} · fixed none`);
  }
  assert.match(await ok(root, 'accept', id), new RegExp(`accept ${id}: PASS`));
  write(root, taskPath(id), read(root, taskPath(id)).replaceAll('- [ ] ', '- [x] ')
    .replace(/## Result\n[\s\S]*$/, `## Result\n${lines.join('\n')}\nDeviations: none\n`));
  await ok(root, 'task', 'set', id, 'status=done');
  await ok(root, 'status', 'add', 'recent', `${id} done: ${name}`);
  await ok(root, 'status', 'set', 'task=none', 'next=close phase 01 (/telos:done)');
  return commit(root, `feat(${id}): add ${name}`, [source(id), taskPath(id), STATUS]);
}

async function completed(t, opts = {}) {
  const root = await repo(t);
  await plan(root);
  const hashes = { '01-01': await doTask(root, '01-01', opts), '01-02': await doTask(root, '01-02') };
  return { root, hashes };
}

/** ADR body filled by the skill: only the sections, Reverse by and Links. */
const fillAdr = (text) => text.replace('## Context\n', '## Context\nMessages must stay testable without IO.\n')
  .replace('## Decision\n', '## Decision\nOne pure module per message under src/.\n')
  .replace(/## Alternatives\n(<!--.*-->\n)?- \n/, '## Alternatives\n$1- One catalog file — merge conflicts on every message\n')
  .replace(/## Consequences\n(<!--.*-->\n)?- \n/, '## Consequences\n$1- One import per message\n')
  .replace(/^Reverse by: .*$/m, 'Reverse by: merge the modules into one catalog')
  .replace(/^Links: .*$/m, `Links: HISTORY ADR 001, ${RESEARCH}`);

/** Play the deep promotion for D-01 by the ctx done tag; `stopAfter` simulates an interruption. */
async function promote(root, stopAfter) {
  for (let step = 0; step < 6; step++) {
    const line = /^- D-01: .*$/m.exec(await ok(root, 'ctx', 'done'))[0];
    if (/\[promoted → ADR 001\]$/.test(line)) return 'promoted';
    if (/\[candidate → /.test(line)) await ok(root, 'adr', 'new', 'Use pure message modules', '--source', '01:D-01');
    else if (/body needed/.test(line)) write(root, ADR, fillAdr(read(root, ADR)));
    else if (/history link needed/.test(line)) await ok(root, 'history', 'add', 'decision', 'ADR 001', /"(01:D-01: [^"]+)"/.exec(line)[1]);
    else if (/marker needed/.test(line)) write(root, CONTEXT, read(root, CONTEXT).replace('under src/.', 'under src/. → ADR 001'));
    else return `unexpected: ${line}`;
    if (stopAfter === step) return `interrupted after step ${step}`;
  }
  return 'no progress';
}

/** Play /telos:done on deep; every early return leaves the phase active without a phase entry. */
async function close(root, { manualVerified = true, review = 'PASS', failReverify = false, dirty, stopAfter } = {}) {
  const preview = await ok(root, 'ctx', 'done');
  if (/^REFUSED:|^Close: blocked/m.test(preview)) return 'blocked';
  assert.match(preview, /^Deep close: /m);
  if ((await telos(root, 'check', '--level', 'full', '--phase', '01')).code !== 0) return 'check failed';
  // The close bundle's own accept commands, run before and again after doc-sync.
  const accepts = [...preview.matchAll(/telos (accept \d{2}-\d{2} --close \d{2})/g)].map((m) => m[1].split(' '));
  assert.ok(accepts.length > 0, 'close bundle names its accept commands');
  const acceptAll = async () => {
    for (const args of accepts) if ((await telos(root, ...args)).code !== 0) return false;
    return true;
  };
  if (!await acceptAll()) return 'accept failed';
  if (!manualVerified) return 'manual unverified';
  if (/^Review: one phase review/m.test(preview)) {
    const result = reviewer(await ok(root, 'ctx', 'review', '01'), review, root);
    if (result.verdict !== 'PASS' && result.verdict !== 'PASS WITH NOTES') return 'review blocked';
  }
  // Doc-sync: only matched ranges, idempotent on retry.
  const scan = await ok(root, 'docs-scan', '01');
  assert.match(scan, /^- "docs\/api\.md":4-4 — /m);
  const api = read(root, 'docs/api.md');
  if (!api.includes('returns `Hello, <name>!`')) {
    write(root, 'docs/api.md', api.replace('exports `message(name)`.', 'exports `message(name)`; returns `Hello, <name>!`.'));
  }
  const draftLog = await ok(root, 'changelog', '01');
  const entries = [...draftLog.matchAll(/^- [0-9a-f]+ (feat)\("(\d{2}-\d{2})"\): "([^"]+)"$/gm)].map((m) => `- ${m[3]} (${m[2]})`);
  assert.ok(entries.length > 0 && entries.length <= 10);
  const log = existsSync(join(root, 'CHANGELOG.md')) ? read(root, 'CHANGELOG.md') : '# Changelog\n';
  if (!log.includes(`## ${today()}`)) write(root, 'CHANGELOG.md', log.replace('# Changelog\n', `# Changelog\n\n## ${today()}\n${entries.join('\n')}\n`));
  if (failReverify) write(root, '.telos/.cache/fail-test', 'x');
  if (dirty) write(root, dirty, 'export const stray = 1;\n');
  if ((await telos(root, 'check', '--level', 'full', '--phase', '01')).code !== 0) return 'reverify failed';
  if (!await acceptAll()) return 'reverify accept failed';
  const promoted = await promote(root, stopAfter);
  if (promoted !== 'promoted') return promoted;
  assert.match(await ok(root, 'ctx', 'done'), /^Close: ready$/m);
  if (!/^History: phase entry recorded/m.test(await ok(root, 'ctx', 'done'))) {
    await ok(root, 'history', 'add', 'phase', '01', 'closed 01-store: messages verified; retro: RED stubs caught the empty message early');
  }
  await ok(root, 'roadmap', 'set', '01', 'done');
  await ok(root, 'status', 'set', 'task=none', 'next=/telos:plan');
  await ok(root, 'status', 'add', 'recent', '01-store closed: messages verified');
  if (/^Auto-commit: yes$/m.test(preview)) {
    commit(root, 'docs(telos): close phase 01-store', [CONTEXT, HISTORY, ROADMAP, STATUS, ADR, 'docs/api.md', 'CHANGELOG.md']);
  }
  return 'closed';
}

/** Play /telos:undo: one confirmation covers the exact hashes and the selected ADR IDs. */
async function undo(root, id, { hashes = [], adrs = [] } = {}) {
  const preview = await ok(root, 'ctx', 'undo', id);
  assert.doesNotMatch(preview, /^REFUSED:/);
  const order = /^Revert order: (.+)$/m.exec(preview)[1].split(' ');
  if (order.join(' ') !== hashes.join(' ')) return { stopped: 'confirmation' };
  for (const hash of order) {
    const r = spawnSync('git', ['-C', root, 'revert', '--no-commit', hash], { encoding: 'utf8' });
    if (r.status !== 0) {
      const conflicts = git(root, 'diff', '--name-only', '--diff-filter=U').trim().split('\n').filter(Boolean);
      if (conflicts.some((p) => !p.startsWith('.telos/'))) return { stopped: 'conflict', conflicts };
      git(root, 'restore', '--source=HEAD', '--staged', '--worktree', '--', ...conflicts);
      git(root, 'revert', '--quit');
    }
  }
  const paths = /^Telos files in these commits: (.+)$/m.exec(preview)[1].split(', ');
  git(root, 'restore', '--source=HEAD', '--staged', '--worktree', '--', ...paths);
  if ((await telos(root, 'check', '--level', 'full')).code !== 0) return { stopped: 'check failed' };
  for (const n of adrs) await ok(root, 'adr', 'revert', n, '--task', id);
  await ok(root, 'task', 'set', id, 'status=reverted');
  const blocked = /^Block after undo: (.+)$/m.exec(preview)[1].split(', ').filter((b) => b !== 'none');
  if (blocked.length) await ok(root, 'task', 'set', ...blocked, 'status=blocked');
  if (/^Phase after undo: reopen/m.test(preview)) await ok(root, 'roadmap', 'set', '01', 'active');
  await ok(root, 'status', 'set', `next=/telos:revise <notes> to redo ${id}`,
    ...(blocked.length ? [`blockers=${blocked.join(', ')}: depend on reverted ${id}`] : []));
  await ok(root, 'history', 'add', 'revert', id, `reverted ${id} (${order.length} commits, ADR ${adrs.join(', ') || 'none'})`);
  const changed = git(root, 'diff', '--name-only').trim().split('\n').filter(Boolean);
  assert.ok(changed.every((p) => p.startsWith('.telos/')), changed.join(' '));
  commit(root, `revert(${id}): undo ${TASKS[id].name}`, changed);
  return { stopped: null, blocked };
}

const snapshot = (root) => ({ head: git(root, 'rev-parse', 'HEAD'), dirty: git(root, 'status', '--porcelain'),
  files: Object.fromEntries([STATUS, ROADMAP, HISTORY, CONTEXT, RESEARCH, LESSONS, taskPath('01-01'), taskPath('01-02'),
    ...readdirSync(join(root, '.telos/decisions')).map((f) => `.telos/decisions/${f}`)].map((p) => [p, read(root, p)])) });

test('a fresh deep phase runs research, confirmation, critical RED/GREEN/e2e/review, doc-sync, ADR and retro to a closed phase', async (t) => {
  const { root } = await completed(t);
  const done = await ok(root, 'ctx', 'done');
  assert.match(done, /^- 01-01: RED recorded · GREEN recorded · review PASS EvidenceId \S+ — stale or unavailable$/m);
  assert.match(done, /^Review: one phase review/m);
  assert.match(done, /^Doc-sync: `telos docs-scan 01` · `telos changelog 01`/m);
  assert.match(done, /^E2E: required for critical code 01-01: e2e=node src\/index\.mjs e2e$/m);
  const readme = read(root, 'README.md');
  assert.equal(await close(root), 'closed');
  assert.match(read(root, ROADMAP), /^- 01-store \[done\]/m);
  assert.equal(phaseEntries(root).length, 1);
  assert.match(phaseEntries(root)[0], /; retro: /);
  assert.match(read(root, HISTORY), /decision ADR 001: 01:D-01: Use pure message modules/);
  assert.match(read(root, ADR), /^Date: \S+ · Status: accepted · Source: 01:D-01$/m);
  assert.match(read(root, ADR), /^Reverse by: merge the modules into one catalog$/m);
  assert.ok(read(root, ADR).trimEnd().split('\n').length <= 30);
  assert.match(read(root, CONTEXT), /under src\/\. → ADR 001$/m);
  assert.match(read(root, 'docs/api.md'), /Hand-maintained paragraph; doc-sync must never rewrite it\./);
  assert.equal(read(root, 'README.md'), readme);
  assert.equal((read(root, 'CHANGELOG.md').match(/^## /gm) ?? []).length, 1);
  assert.equal(read(root, RESEARCH), REPORT);
  assert.equal(read(root, LESSONS), git(root, 'show', `telos/01-start:${LESSONS}`));
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.match(await ok(root, 'ctx', 'done'), /^REFUSED: .*already done/);
});

test('missing e2e, an environment failure instead of RED, unverified review or manual items never close', async (t) => {
  const { root } = await completed(t);
  const config = read(root, '.telos/config.json');
  write(root, '.telos/config.json', JSON.stringify({ ...JSON.parse(config), checks: { test: CHECKS.test } }));
  assert.equal(await close(root), 'blocked');
  write(root, '.telos/config.json', config);
  for (const [opts, outcome] of [[{ review: 'UNVERIFIED' }, 'review blocked'], [{ review: 'CHANGES REQUESTED' }, 'review blocked'],
    [{ manualVerified: false }, 'manual unverified']]) {
    assert.equal(await close(root, opts), outcome);
    assert.equal(phaseEntries(root).length, 0);
    assert.match(read(root, ROADMAP), /^- 01-store \[active\]/m);
  }
  const env = await completed(t, { red: 'syntax' });
  assert.match(await ok(env.root, 'ctx', 'done'), /^- 01-01: no recorded RED evidence in Result \(UNVERIFIED; accept PASS does not prove it\)$/m);
  assert.equal(await close(env.root), 'blocked');
  assert.equal(phaseEntries(env.root).length, 0);
});

test('a failed post-doc-sync verification keeps the phase active; the retry keeps unrelated docs and adds no duplicates', async (t) => {
  const { root } = await completed(t);
  assert.equal(await close(root, { failReverify: true }), 'reverify failed');
  assert.equal(phaseEntries(root).length, 0);
  assert.match(read(root, ROADMAP), /^- 01-store \[active\]/m);
  assert.ok(!existsSync(join(root, ADR)), 'promotion waits for verification');
  rmSync(join(root, '.telos/.cache/fail-test'));
  assert.equal(await close(root), 'closed');
  assert.equal((read(root, 'CHANGELOG.md').match(/^## /gm) ?? []).length, 1);
  assert.equal((read(root, 'CHANGELOG.md').match(/add greet \(01-01\)/g) ?? []).length, 1);
  assert.equal((read(root, 'docs/api.md').match(/returns `Hello, <name>!`/g) ?? []).length, 1);
  assert.match(read(root, 'docs/api.md'), /Hand-maintained paragraph; doc-sync must never rewrite it\./);
});

test('an interrupted ADR, HISTORY link or marker promotion resumes without duplicates or lost prose', async (t) => {
  const { root } = await completed(t);
  const prose = /^- D-01: .*$/m.exec(read(root, CONTEXT))[0];
  // Each interrupted attempt performs one promotion action, then the retry resumes from the tag.
  for (const next of [/body needed/, /history link needed/, /marker needed/]) {
    assert.equal(await close(root, { stopAfter: 0 }), 'interrupted after step 0');
    assert.match(/^- D-01: .*$/m.exec(await ok(root, 'ctx', 'done'))[0], next);
    assert.equal(phaseEntries(root).length, 0);
    assert.ok(read(root, CONTEXT).includes(prose));
  }
  assert.equal(await close(root), 'closed');
  assert.deepEqual(readdirSync(join(root, '.telos/decisions')), ['001-use-pure-message-modules.md']);
  assert.equal((read(root, HISTORY).match(/decision ADR 001:/g) ?? []).length, 1);
  assert.match(read(root, ADR), /^One pure module per message under src\/\.$/m);
  assert.match(await ok(root, 'adr', 'new', 'Use pure message modules', '--source', '01:D-01'), / · reused\n$/);
});

test('a confirmed ADR-aware undo changes only the selected ADR and intended tasks; cancel and conflict change nothing', async (t) => {
  const { root, hashes } = await completed(t);
  assert.equal(await close(root), 'closed');
  const before = snapshot(root);
  const preview = await ok(root, 'ctx', 'undo', '01-01');
  assert.match(preview, /^- ADR 001 \[accepted\] 01:D-01 "Use pure message modules" → revert on confirm: `telos adr revert 001 --task 01-01`$/m);
  assert.match(preview, /^Block after undo: 01-02$/m);
  assert.deepEqual(await undo(root, '01-01'), { stopped: 'confirmation' });
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(await undo(root, '01-01', { hashes: [hashes['01-01']], adrs: ['001'] }), { stopped: null, blocked: ['01-02'] });
  assert.ok(!existsSync(join(root, source('01-01'))));
  assert.equal(read(root, ADR), before.files[ADR].replace('Status: accepted', `Status: reverted (${today()}, 01-01)`));
  assert.equal(loadTask(root, '01-01').meta.status, 'reverted');
  assert.equal(loadTask(root, '01-02').meta.status, 'blocked');
  assert.match(read(root, ROADMAP), /^- 01-store \[active\]/m);
  for (const path of [CONTEXT, RESEARCH, LESSONS]) assert.equal(read(root, path), before.files[path], path);
  assert.equal(phaseEntries(root).length, 1, 'the close record stays');
  assert.equal((read(root, HISTORY).match(/ revert 01-01: /g) ?? []).length, 1);
  assert.equal(git(root, 'status', '--porcelain'), '');

  const other = await completed(t);
  assert.equal(await close(other.root), 'closed');
  write(other.root, source('01-01'), 'export const message = (name) => `Hello, ${name}!`; // tuned\n');
  commit(other.root, 'fix(quick): tune greet', [source('01-01')]);
  const kept = snapshot(other.root);
  const conflict = await undo(other.root, '01-01', { hashes: [other.hashes['01-01']], adrs: ['001'] });
  assert.equal(conflict.stopped, 'conflict');
  git(other.root, 'revert', '--abort');
  assert.deepEqual(snapshot(other.root), kept);
});

test('a downgrade keeps RESEARCH and ADRs but gates deep commands and reminders; the map prompt follows auto_commit', async (t) => {
  const { root } = await completed(t);
  assert.equal(await close(root), 'closed');
  write(root, '.telos/MAP.md', `<!-- telos-map: commit ${git(root, 'rev-parse', 'HEAD').trim()} · ${today()} · files 6 -->\n# Map\n`);
  write(root, 'tools/x.mjs', 'export {};\n');
  const reminder = hook(root, 'stop');
  assert.equal(reminder.code, 0, 'the reminder never blocks');
  assert.match(JSON.parse(reminder.stdout).systemMessage, /may be stale — new top-level tools\//);
  rmSync(join(root, 'tools'), { recursive: true });
  const research = read(root, RESEARCH);
  const adr = read(root, ADR);
  await ok(root, 'profile', 'standard');
  assert.equal(read(root, RESEARCH), research);
  assert.equal(read(root, ADR), adr);
  for (const bundle of ['research', 'review', 'docs']) assert.equal((await telos(root, 'ctx', bundle)).stdout, DEEP_GATE, bundle);
  for (const args of [['adr', 'new', 'X', '--source', '01:D-02'], ['docs-scan'], ['changelog']]) {
    const r = await telos(root, ...args);
    assert.equal(r.code, 1, args.join(' '));
    assert.equal(r.stderr, DEEP_GATE, args.join(' '));
  }
  write(root, 'tools/x.mjs', 'export {};\n');
  const quiet = hook(root, 'stop', { session_id: 'after-downgrade' });
  assert.deepEqual([quiet.code, quiet.stdout], [0, '']);
  rmSync(join(root, 'tools'), { recursive: true });
  assert.match(await ok(root, 'ctx', 'map'), /^Commit after PASS: ask once;/m);
  const cfg = JSON.parse(read(root, '.telos/config.json'));
  write(root, '.telos/config.json', JSON.stringify({ ...cfg, git: { ...cfg.git, auto_commit: false } }));
  assert.match(await ok(root, 'ctx', 'map'), /^Commit: none — git\.auto_commit is false; no git writes/m);
});

test('agent and variant contracts validate as files only, not as a live Claude host run', () => {
  const field = (text, key) => new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(text)?.[1].trim();
  for (const [agent, model] of [['reviewer', 'sonnet'], ['reviewer-hard', 'opus'], ['researcher', 'sonnet'], ['researcher-hard', 'opus']]) {
    const text = readFileSync(join(ROOT, 'agents', `${agent}.md`), 'utf8');
    assert.equal(field(text, 'model'), model, agent);
    assert.doesNotMatch(field(text, 'tools'), /\b(Edit|Write)\b/, agent);
  }
  for (const [skill, agent] of [['review', 'reviewer'], ['review-hard', 'reviewer-hard'], ['research', 'researcher'], ['research-hard', 'researcher-hard']]) {
    const text = readFileSync(join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8');
    assert.equal(field(text, 'context'), 'fork', skill);
    assert.equal(field(text, 'agent'), `telos:${agent}`, skill);
  }
  for (const skill of ['do', 'do-hard', 'done']) {
    assert.match(field(readFileSync(join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8'), 'allowed-tools'), /Agent\(telos:reviewer-hard\)/, skill);
  }
});

test('after doc-sync edits the close accept passes, while plain accept keeps strict scope', async (t) => {
  const { root } = await completed(t);
  assert.match(await ok(root, 'ctx', 'done'), /^Accept: telos accept 01-01 --close 01 · telos accept 01-02 --close 01$/m);
  assert.match(await ok(root, 'ctx', 'check'), /^Accept: telos accept 01-01 · telos accept 01-02$/m);
  write(root, 'docs/api.md', read(root, 'docs/api.md').replace('exports `message(name)`.', 'exports `message(name)`; returns `Hello, <name>!`.'));
  write(root, 'CHANGELOG.md', `# Changelog\n\n## ${today()}\n- add greet (01-01)\n`);
  assert.match(await ok(root, 'accept', '01-01', '--close', '01'), /accept 01-01: PASS/);
  const plain = await telos(root, 'accept', '01-01');
  assert.equal(plain.code, 1);
  assert.match(plain.stdout, /^SCOPE  FAIL docs\/api\.md \(not in scope, not in Deviations\)$/m);
});

test('the close accept still fails unrelated dirty source, out-of-scope task commits and wrong selectors', async (t) => {
  const { root } = await completed(t);
  write(root, 'docs/api.md', read(root, 'docs/api.md').replace('exports `message(name)`.', 'exports `message(name)`; returns `Hello, <name>!`.'));
  write(root, 'src/stray.mjs', 'export const stray = 1;\n');
  const dirty = await telos(root, 'accept', '01-01', '--close', '01');
  assert.equal(dirty.code, 1);
  assert.match(dirty.stdout, /^SCOPE  FAIL src\/stray\.mjs /m);
  assert.doesNotMatch(dirty.stdout, /FAIL docs\/api\.md/);
  rmSync(join(root, 'src/stray.mjs'));

  write(root, 'notes.txt', 'out of scope\n');
  commit(root, 'fix(01-02): sneak a note in', ['notes.txt']);
  const committed = await telos(root, 'accept', '01-02', '--close', '01');
  assert.equal(committed.code, 1);
  assert.match(committed.stdout, /^SCOPE  FAIL notes\.txt /m);

  for (const [args, code, text] of [
    [['01-01', '--close', '02'], 1, /not in phase 02/],
    [['01-01', '--close', '1'], 2, /usage/],
    [['01-01', '--close'], 2, /usage/],
    [['01-01', '--bogus', '01'], 2, /usage/],
  ]) {
    const r = await telos(root, 'accept', ...args);
    assert.equal(r.code, code, args.join(' '));
    assert.match(r.stderr, text, args.join(' '));
  }
});

test('unrelated dirty source after doc-sync blocks the close; the retry without it closes once', async (t) => {
  const { root } = await completed(t);
  assert.equal(await close(root, { dirty: 'src/stray.mjs' }), 'reverify accept failed');
  assert.equal(phaseEntries(root).length, 0);
  assert.match(read(root, ROADMAP), /^- 01-store \[active\]/m);
  assert.match(read(root, 'docs/api.md'), /returns `Hello, <name>!`/, 'doc edits stay for inspection');
  rmSync(join(root, 'src/stray.mjs'));
  assert.equal(await close(root), 'closed');
  assert.equal(phaseEntries(root).length, 1);
});

test('with auto_commit=false a failed reverify retries to a close without any intermediate commit', async (t) => {
  const { root } = await completed(t);
  const cfg = JSON.parse(read(root, '.telos/config.json'));
  write(root, '.telos/config.json', JSON.stringify({ ...cfg, git: { ...cfg.git, auto_commit: false } }, null, 2));
  const head = git(root, 'rev-parse', 'HEAD').trim();
  assert.equal(await close(root, { failReverify: true }), 'reverify failed');
  assert.equal(phaseEntries(root).length, 0);
  rmSync(join(root, '.telos/.cache/fail-test'));
  assert.equal(await close(root), 'closed');
  assert.equal(git(root, 'rev-parse', 'HEAD').trim(), head);
  assert.equal(phaseEntries(root).length, 1);
  assert.equal((read(root, 'CHANGELOG.md').match(/^## /gm) ?? []).length, 1);
  assert.match(git(root, 'status', '--porcelain'), /docs\/api\.md/);
});
