import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// SKILL.md frontmatter exceeds the D-03 subset (quoted brackets, parens), so it is read with regexes.
const SKILLS = fileURLToPath(new URL('../skills/', import.meta.url));
const skills = readdirSync(SKILLS).filter((d) => existsSync(join(SKILLS, d, 'SKILL.md')));

function read(name) {
  const text = readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8');
  const [, fm, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text) ?? [];
  assert.ok(fm, `${name}: missing frontmatter`);
  const field = (key) => new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(fm)?.[1].trim();
  return { field, body };
}

test('at least the init skill exists', () => {
  assert.ok(skills.includes('init'), skills.join(', '));
});

test('every skill is user-invoked only and named after its directory', () => {
  for (const name of skills) {
    const { field } = read(name);
    assert.equal(field('disable-model-invocation'), 'true', name);
    assert.equal(field('name'), name, name);
    assert.ok(field('description'), `${name}: description`);
  }
});

test('every injected telos command is pre-approved in allowed-tools', () => {
  for (const name of skills) {
    const { field, body } = read(name);
    const allowed = (field('allowed-tools') ?? '').split(/,\s*/);
    for (const [, cmd] of body.matchAll(/!`(telos [^`]*)`/g)) {
      const covered = allowed.some((t) => {
        const prefix = /^Bash\((telos[^)]*?)(?: \*)?\)$/.exec(t)?.[1];
        return prefix !== undefined && (cmd === prefix || cmd.startsWith(`${prefix} `));
      });
      assert.ok(covered, `${name}: ${cmd}`);
    }
  }
});

test('init injects telos ctx init and stays short', () => {
  const { field, body } = read('init');
  assert.match(body, /!`telos ctx init \$ARGUMENTS`/);
  assert.equal(field('model'), 'sonnet');
  assert.ok(body.trim().split('\n').length <= 60, `${body.trim().split('\n').length} lines`);
});

// Variants (SPEC §5.0): same body as the base skill, which injects the shared instructions via
// `telos ctx shared <name>` (cat of plugin files is blocked outside the session's working dirs).
const VARIANTS = { 'plan-lite': 'plan', 'revise-lite': 'revise', 'do-hard': 'do', 'quick-hard': 'quick', 'map-hard': 'map', 'review-hard': 'review', 'research-hard': 'research' };
const MODELS = { plan: 'opus', 'plan-lite': 'sonnet', revise: 'opus', 'revise-lite': 'sonnet', do: 'sonnet', 'do-hard': 'opus', quick: 'sonnet', 'quick-hard': 'opus', map: 'sonnet', 'map-hard': 'opus', status: 'sonnet', profile: 'sonnet', discuss: 'opus', lesson: 'sonnet', check: 'sonnet', done: 'sonnet', undo: 'sonnet', review: 'sonnet', 'review-hard': 'opus', docs: 'sonnet', research: 'sonnet', 'research-hard': 'opus' };
const SHARED = fileURLToPath(new URL('../shared/', import.meta.url));
const FIELDS = ['disable-model-invocation', 'allowed-tools', 'argument-hint', 'context'];

test('variants share the base body and differ only in name, description and model', () => {
  for (const [variant, base] of Object.entries(VARIANTS)) {
    const v = read(variant);
    const b = read(base);
    assert.equal(v.body, b.body, variant);
    for (const key of FIELDS) assert.equal(v.field(key), b.field(key), `${variant}: ${key}`);
    assert.notEqual(v.field('model'), b.field('model'), variant);
  }
});

test('plan and revise skills use their models and the plan bundle', () => {
  for (const [name, model] of Object.entries(MODELS)) assert.equal(read(name).field('model'), model, name);
  assert.match(read('plan').body, /^!`telos ctx plan`$/m);
  assert.match(read('plan').body, /^## Request\n\$ARGUMENTS$/m);
  assert.match(read('revise').body, /^!`telos ctx plan`$/m);
  assert.match(read('revise').body, /^## Notes\n\$ARGUMENTS$/m);
  assert.match(read('plan').body, /^!`telos ctx shared plan`$/m);
  assert.match(read('revise').body, /^!`telos ctx shared revise`$/m);
});

test('every shared body a skill injects exists and stays short', () => {
  for (const name of skills) {
    for (const [, shared] of read(name).body.matchAll(/!`telos ctx shared ([a-z-]+)`/g)) {
      const path = join(SHARED, `${shared}.md`);
      assert.ok(existsSync(path), `${name}: shared/${shared}.md`);
      const max = shared === 'do' ? 70 : 60;
      assert.ok(readFileSync(path, 'utf8').trim().split('\n').length <= max, `shared/${shared}.md too long`);
    }
  }
});

test('the plan instructions use the telos commands and a short summary', () => {
  const plan = readFileSync(join(SHARED, 'plan.md'), 'utf8');
  for (const cmd of ['telos lint-plan', 'telos task new', 'telos roadmap set', 'telos roadmap add', 'telos status rm carry', 'telos status set']) {
    assert.ok(plan.includes(cmd), cmd);
  }
  assert.match(plan, /≤ 10 lines/);
  assert.match(plan, /AskUserQuestion/);
  const revise = readFileSync(join(SHARED, 'revise.md'), 'utf8');
  for (const cmd of ['telos lint-plan', 'telos task new', 'telos task rm', 'telos task set']) assert.ok(revise.includes(cmd), cmd);
});

test('telos ctx shared prints a shared body without comments; unknown names say so', async () => {
  const { main } = await import('../lib/cli.mjs');
  const run = async (...args) => {
    const out = { text: '', write(s) { out.text += s; } };
    const code = await main(['ctx', 'shared', ...args], { cwd: SHARED, stdout: out, stderr: out });
    return { code, text: out.text };
  };
  const plan = await run('plan');
  assert.equal(plan.code, 0);
  assert.match(plan.text, /telos lint-plan/);
  assert.doesNotMatch(plan.text, /<!--/);
  assert.equal((await run('nope')).text, "telos ctx: no shared instructions 'nope'\n");
  assert.equal((await run('../x')).code, 2);
});

test('free text never reaches a shell injection: $ARGUMENTS only for init (profile) and do (task id)', () => {
  for (const name of skills) {
    for (const [cmd] of read(name).body.matchAll(/!`[^`]*`/g)) {
      if (cmd.includes('$ARGUMENTS')) assert.ok(/^!`telos ctx (init|do) \$ARGUMENTS`$/.test(cmd), `${name}: ${cmd}`);
    }
  }
});

test('approve injects its bundle, runs on sonnet and may only commit and tag', () => {
  const { field, body } = read('approve');
  assert.match(body, /^!`telos ctx approve`$/m);
  assert.equal(field('model'), 'sonnet');
  const tools = field('allowed-tools');
  for (const t of ['Bash(telos *)', 'Bash(git status*)', 'Bash(git add *)', 'Bash(git commit *)', 'Bash(git tag telos/*)']) {
    assert.ok(tools.includes(t), t);
  }
  assert.doesNotMatch(tools, /push|Edit|Write/);
  for (const s of ['telos task set', 'telos roadmap set', 'telos status set', 'git tag telos/', 'docs(telos): plan phase']) {
    assert.ok(body.includes(s), s);
  }
  assert.doesNotMatch(body, /git add (-A|--all|\.\/?)(?=[\s`]|$)|git commit[^\n]*--no-verify/m);
  assert.ok(body.trim().split('\n').length <= 60);
});

test('do and do-hard inject the do bundle for a task id and the shared do body', () => {
  for (const name of ['do', 'do-hard']) {
    const { field, body } = read(name);
    assert.match(body, /^!`telos ctx do \$ARGUMENTS`$/m, name);
    assert.match(body, /^!`telos ctx shared do`$/m, name);
    for (const t of ['Bash(telos *)', 'Bash(git status*)', 'Bash(git diff*)', 'Bash(git add *)', 'Bash(git commit *)']) {
      assert.ok(field('allowed-tools').includes(t), `${name}: ${t}`);
    }
    assert.doesNotMatch(field('allowed-tools'), /push|reset/, name);
  }
});

test('the do instructions gate on accept, change state via telos and stage explicit paths', () => {
  const body = readFileSync(join(SHARED, 'do.md'), 'utf8');
  for (const s of ['telos accept', 'telos task set', 'telos status set', 'telos status add recent', 'telos roadmap set', 'Deviations:', '/telos:do-hard', 'blocked']) {
    assert.ok(body.includes(s), s);
  }
  assert.match(body, /git add <[^>]+>/);
  assert.doesNotMatch(body, /git add (-A|--all|\.\/?)(?=[\s`]|$)/m);
  assert.doesNotMatch(body, /--no-verify|git push/);
});

test('quick and quick-hard inject the quick bundle and show the change outside the injection', () => {
  for (const name of ['quick', 'quick-hard']) {
    const { field, body } = read(name);
    assert.match(body, /^!`telos ctx quick`$/m, name);
    assert.match(body, /^## Change\n\$ARGUMENTS$/m, name);
    assert.match(body, /^!`telos ctx shared quick`$/m, name);
    assert.doesNotMatch(field('allowed-tools'), /push|reset/, name);
  }
});

test('the quick instructions commit with scope quick, explicit paths and a plan fallback', () => {
  const body = readFileSync(join(SHARED, 'quick.md'), 'utf8');
  for (const s of ['(quick)', '/telos:plan', 'Change']) assert.ok(body.includes(s), s);
  assert.match(body, /git add <[^>]+>/);
  assert.doesNotMatch(body, /git add (-A|--all|\.\/?)(?=[\s`]|$)/m);
  assert.doesNotMatch(body, /--no-verify|git push/);
});

test('status injects its bundle and may only run telos', () => {
  const { field, body } = read('status');
  assert.match(body, /^!`telos ctx status`$/m);
  assert.equal(field('allowed-tools'), 'Bash(telos *)');
});

test('map skills inject the fixed bundle and shared body; arguments only appear under Request', () => {
  for (const name of ['map', 'map-hard']) {
    const { field, body } = read(name);
    assert.match(body, /^## Context\n!`telos ctx map`$/m, name);
    assert.match(body, /^## Request\n\$ARGUMENTS$/m, name);
    assert.match(body, /^## Instructions\n!`telos ctx shared map`$/m, name);
    assert.equal(body.split('$ARGUMENTS').length - 1, 1, name);
    const tools = field('allowed-tools');
    for (const t of ['Bash(telos *)', 'Read', 'Grep', 'Glob', 'Edit(.telos/MAP.md)', 'Edit(.telos/PROJECT.md)', 'Write(.telos/MAP.md)', 'Write(.telos/PROJECT.md)']) {
      assert.ok(tools.split(/,\s*/).includes(t), `${name}: ${t}`);
    }
    assert.doesNotMatch(tools, /git|push|Edit\(\.telos\/\*\*\)|Write\(\*|ROADMAP/, name);
  }
});

test('the map instructions require targeted reads, the full format and validated writes', () => {
  const map = readFileSync(join(SHARED, 'map.md'), 'utf8');
  assert.ok(map.trim().split('\n').length <= 60);
  for (const s of ['REFUSED:', 'Header to write', 'telos-map', 'Not built yet', 'telos ctx map', 'Map validation: PASS',
    '## Structure', '## Entry points', '## Flows', '## Areas', '## Find', '### ', '3–8', '--refresh', 'at most two', 'rollback']) {
    assert.ok(map.includes(s), s);
  }
  assert.match(map, /assum/i);
  assert.match(map, /never (?:read|enumerate)[^\n]*\.telos\//i);
});

test('the map instructions draft PROJECT for confirmation without needing questions', () => {
  const map = readFileSync(join(SHARED, 'map.md'), 'utf8');
  assert.match(map, /preserve/i);
  assert.match(map, /unconfirmed/i);
  assert.match(map, /Assumed:/);
  assert.match(map, /≤ 100/);
  assert.match(map, /≤ 10 lines/);
  assert.match(map, /≤ 60 lines/);
  assert.match(map, /no stack|stack or check/i);
  assert.match(map, /without asking|never ask|no questions/i);
  assert.doesNotMatch(map, /AskUserQuestion/);
});

test('the map instructions never touch git or ROADMAP and report unsupported arguments', () => {
  const map = readFileSync(join(SHARED, 'map.md'), 'utf8');
  assert.match(map, /never commit/i);
  assert.match(map, /ROADMAP/);
  assert.match(map, /usage/i);
  assert.doesNotMatch(map, /git (add|commit|push)/);
});

test('the map instructions run the fixed refresh command and prove byte preservation', () => {
  const map = readFileSync(join(SHARED, 'map.md'), 'utf8');
  assert.doesNotMatch(map, /not available yet/);
  for (const s of ['`--refresh`', '`telos ctx map --refresh`', 'Mode: incremental', 'Mode: noop', 'Mode: full', 'Affected blocks',
    'byte for byte', 'Header to write', 'restore']) {
    assert.ok(map.includes(s), s);
  }
  assert.match(map, /only the (?:listed|affected) blocks/i);
  assert.match(map, /compare/i);
  assert.match(map, /refresh[^\n]*PROJECT|PROJECT[^\n]*refresh/i);
});

test('profile injects its fixed bundle, keeps the requested profile in the body and switches via the CLI', () => {
  const { field, body } = read('profile');
  assert.match(body, /^## Context\n!`telos ctx profile`$/m);
  assert.match(body, /^## Request\n\$ARGUMENTS$/m);
  assert.equal(body.split('$ARGUMENTS').length - 1, 1);
  assert.equal((body.match(/!`/g) ?? []).length, 1);
  assert.equal(field('allowed-tools'), 'Bash(telos *)');
  assert.ok(body.includes('`telos profile <profile>`'));
  for (const s of ['REFUSED:', 'retained', 'CLAUDE.md', 'Exit 2', 'exit 1']) assert.ok(body.includes(s), s);
  assert.doesNotMatch(body, /init --force|git (add|commit|push) |--no-verify/);
  assert.ok(body.trim().split('\n').length <= 40);
});

test('discuss injects its fixed bundle, keeps arguments under Request and selects phases via a validated command', () => {
  const { field, body } = read('discuss');
  assert.equal(field('model'), 'opus');
  assert.match(body, /^## Context\n!`telos ctx discuss`$/m);
  assert.match(body, /^## Request\n\$ARGUMENTS$/m);
  assert.equal(body.split('$ARGUMENTS').length - 1, 1);
  assert.equal((body.match(/!`/g) ?? []).length, 1);
  assert.ok(body.includes('`telos ctx discuss <NN>`'));
  const tools = field('allowed-tools').split(/,\s*/);
  for (const t of ['Bash(telos *)', 'Read', 'Grep', 'Glob', 'Edit(.telos/phases/**)', 'Write(.telos/phases/**)']) assert.ok(tools.includes(t), t);
  assert.doesNotMatch(field('allowed-tools'), /git|STATUS|ROADMAP/);
  assert.ok(body.trim().split('\n').length <= 60);
});

test('the discuss instructions write all CONTEXT sections, keep IDs and change Awaiting user via the CLI', () => {
  const { body } = read('discuss');
  for (const s of ['## Goal', '## Decisions', '## Constraints', '## Open questions', '## Carried over', '## Links',
    '≤ 60 lines', '[proposed]', 'Q-NN', 'D-NN', 'AskUserQuestion', 'telos status set awaiting=', 'REFUSED:', 'Requires standard', '/telos:revise', '/telos:plan']) {
    assert.ok(body.includes(s), s);
  }
  assert.match(body, /never renumber/i);
  assert.match(body, /never (?:silently )?confirm/i);
  assert.match(body, /one (?:question )?round/i);
  assert.doesNotMatch(body, /git (add|commit|push)|--no-verify/);
});

test('plan and revise maintain phase CONTEXT on standard+ only and keep decision IDs', () => {
  const plan = readFileSync(join(SHARED, 'plan.md'), 'utf8');
  const revise = readFileSync(join(SHARED, 'revise.md'), 'utf8');
  for (const s of ['NN-CONTEXT.md', '≤ 60 lines', 'minimal', '[proposed]', 'telos status set awaiting=', 'decisions']) {
    assert.ok(plan.includes(s), `plan: ${s}`);
  }
  for (const s of ['CONTEXT', '[proposed]', 'telos status set awaiting=']) assert.ok(revise.includes(s), `revise: ${s}`);
  for (const text of [plan, revise]) assert.match(text, /never renumber/i);
  assert.match(revise, /never (?:silently )?confirm/i);
});

test('lesson injects its fixed bundle, keeps the lesson under Request and may edit only LESSONS and PROJECT', () => {
  const { field, body } = read('lesson');
  assert.equal(field('model'), 'sonnet');
  assert.match(body, /^## Context\n!`telos ctx lesson`$/m);
  assert.match(body, /^## Request\n\$ARGUMENTS$/m);
  assert.equal(body.split('$ARGUMENTS').length - 1, 1);
  assert.equal((body.match(/!`/g) ?? []).length, 1);
  const tools = field('allowed-tools').split(/,\s*/);
  for (const t of ['Bash(telos *)', 'Read', 'Edit(.telos/LESSONS.md)', 'Edit(.telos/PROJECT.md)']) assert.ok(tools.includes(t), t);
  assert.doesNotMatch(field('allowed-tools'), /Write|git|STATUS|ROADMAP|phases/);
  assert.ok(body.trim().split('\n').length <= 60);
});

test('the lesson instructions dedupe by area, never add a 21st and promote before removing', () => {
  const { body } = read('lesson');
  for (const s of ['- [area] lesson (ref)', 'NN-MM', 'quick', 'REFUSED:', 'Requires standard', 'AskUserQuestion', '§Conventions', '20']) {
    assert.ok(body.includes(s), s);
  }
  assert.match(body, /area first/i);
  assert.match(body, /duplicate/i);
  assert.match(body, /distinct[^\n]*(?:same area|separate)/i);
  assert.match(body, /never (?:add )?a 21st/i);
  assert.match(body, /never (?:delete|remove|drop)[^\n]*without/i);
  assert.match(body, /only after/i);
  assert.match(body, /re-?read/i);
  assert.doesNotMatch(body, /git (add|commit|push)|telos (task|status|roadmap) /);
});

test('quick derives safe --area selectors in an explicit rerun and plan turns memory into Constraints', () => {
  const quick = readFileSync(join(SHARED, 'quick.md'), 'utf8');
  for (const s of ["telos ctx quick --area '<selector>'", 'Lessons: none selected', 'clean', 'Removed approaches', 'A-Z a-z 0-9 . _ @ + / -']) {
    assert.ok(quick.includes(s), `quick: ${s}`);
  }
  assert.match(quick, /never paste the Change/i);
  assert.doesNotMatch(quick, /!`|\$ARGUMENTS|eval/);
  const plan = readFileSync(join(SHARED, 'plan.md'), 'utf8');
  for (const s of ['Lessons', 'Removed approaches', 'Constraint', 'omitted']) assert.ok(plan.includes(s), `plan: ${s}`);
  for (const name of ['quick', 'quick-hard', 'plan', 'plan-lite']) {
    for (const [cmd] of read(name).body.matchAll(/!`[^`]*`/g)) assert.doesNotMatch(cmd, /\$ARGUMENTS|--area/, `${name}: ${cmd}`);
  }
});

test('do and do-hard may hand off only to the named reviewer-hard agent', () => {
  for (const name of ['do', 'do-hard']) {
    const agents = read(name).field('allowed-tools').split(/,\s*/).filter((t) => /^(Agent|Task)\b/.test(t));
    assert.deepEqual(agents, ['Agent(telos:reviewer-hard)'], name);
  }
});

test('the do instructions gate deep critical code on real RED, targeted checks and one review before state changes', () => {
  const body = readFileSync(join(SHARED, 'do.md'), 'utf8');
  const at = (s) => { const i = body.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('Deep critical') < at('**Verify**'));
  assert.match(body, /At RED, before any\s+implementation, write `RED: <cmd> → exit <n>: <reason>`/);
  assert.ok(at('write `RED:') < at('telos check --level full --task <id>'));
  assert.ok(at('telos ctx review <id>') < at('telos task set <id> status=done'));
  assert.ok(at('telos:reviewer-hard') < at('**Commit**'));
  for (const s of ['already green', 'environment', 'never fabricate', 'telos check --level full --task <id>',
    'telos ctx shared review', 'CHANGES REQUESTED', 'UNVERIFIED', 'no re-review', 'Review:', 'GREEN:']) {
    assert.ok(body.includes(s), s);
  }
  assert.match(body, /only when the context has a `Deep critical` block/i);
  assert.match(body, /HIGH or CRITICAL[^.]*(cannot|can't)[^.]*→ step 6b/i);
  assert.match(body, /2 fix attempts/);
  assert.match(body, /`Auto-commit: no`/);
});

test('docs injects one fixed bundle, keeps scopes under Request and may edit only docs without touching state', () => {
  const { field, body } = read('docs');
  assert.equal(field('model'), 'sonnet');
  assert.equal(field('argument-hint'), '"[scope path…]"');
  assert.match(body, /^## Context\n!`telos ctx docs`$/m);
  assert.match(body, /^## Request\n\$ARGUMENTS$/m);
  assert.equal(body.split('$ARGUMENTS').length - 1, 1);
  assert.equal((body.match(/!`/g) ?? []).length, 1);
  const at = (s) => { const i = body.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('literal repo-relative') < at('telos ctx docs --scope <path>'));
  for (const s of ['Requires deep profile', 'REFUSED:', 'Sync: NO-OP', 'Sync: NOT VERIFIED', 'targeted', 'public', 'docstring',
    'telos check', 'never invent', 'Changed:', 'unrelated text']) assert.ok(body.includes(s), s);
  assert.match(body, /never (read|open) (all|every) doc/i);
  assert.match(body, /no (task|STATUS|ROADMAP)[^.]*git/i);
  const tools = field('allowed-tools').split(/,\s*/);
  assert.deepEqual(tools.filter((t) => t.startsWith('Bash')).sort(), ['Bash(telos check *)', 'Bash(telos ctx docs *)']);
  assert.doesNotMatch(field('allowed-tools'), /git|push|reset|Agent|Task/);
  assert.ok(body.trim().split('\n').length <= 60);
});

test('check and done inject one fixed bundle and keep the phase argument under Request', () => {
  for (const name of ['check', 'done']) {
    const { field, body } = read(name);
    assert.match(body, new RegExp(`^## Context\\n!\`telos ctx ${name}\`$`, 'm'), name);
    assert.match(body, /^## Request\n\$ARGUMENTS$/m, name);
    assert.equal(body.split('$ARGUMENTS').length - 1, 1, name);
    assert.equal((body.match(/!`/g) ?? []).length, 1, name);
    assert.ok(body.includes(`\`telos ctx ${name} <NN>\``), name);
    for (const s of ['telos check --level full', 'telos accept <id>', 'Requires standard', 'REFUSED:']) assert.ok(body.includes(s), `${name}: ${s}`);
    assert.match(body, /never proves/i, name);
    assert.doesNotMatch(field('allowed-tools'), /push|reset|tag|Write/, name);
    assert.ok(body.trim().split('\n').length <= 60, name);
  }
  assert.doesNotMatch(read('check').field('allowed-tools'), /git|Edit/);
  assert.doesNotMatch(read('check').body, /telos (task|status|roadmap|history) /);
});

test('done verifies before any state change, promotes once, records via telos and honors auto_commit', () => {
  const { field, body } = read('done');
  const at = (s) => { const i = body.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('telos check --level full') < at('telos history add decision'));
  assert.ok(at('telos accept <id>') < at('telos history add phase'));
  assert.ok(at('telos history add phase') < at('telos roadmap set <NN> done'));
  assert.ok(at('telos roadmap set <NN> done') < at('telos status set task=none'));
  for (const s of ['Close: blocked', '[candidate]', '[promoted]', '→ HISTORY', 'History: phase entry missing',
    'Auto-commit: yes', 'Auto-commit: no', 'docs(telos): close phase', '/compact', 'Next: /telos:plan']) {
    assert.ok(body.includes(s), s);
  }
  assert.match(body, /never mark tasks done/i);
  assert.match(body, /stays active, no history/i);
  for (const t of ['Bash(git add *)', 'Bash(git commit *)', 'Edit(.telos/phases/**)']) assert.ok(field('allowed-tools').includes(t), t);
  assert.doesNotMatch(body, /git add (-A|--all|\.\/?)(?=[\s`]|$)|git commit[^\n]*--no-verify|git push|git tag /m);
});

test('deep done reviews critical work and syncs docs after verification and before promotion, standard skips it', () => {
  const { field, body } = read('done');
  const at = (s) => { const i = body.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('telos accept <id>') < at('Deep only'));
  assert.ok(at('Deep only') < at('`Review:` line'));
  assert.ok(at('`Review:` line') < at('telos docs-scan <NN>'));
  assert.ok(at('telos docs-scan <NN>') < at('telos changelog <NN>'));
  assert.ok(at('telos changelog <NN>') < at('telos check --level full --phase <NN>'));
  assert.ok(at('telos check --level full --phase <NN>') < at('telos history add decision'));
  for (const s of ['Critical evidence', 'Review: reuse', 'no re-review', 'HIGH or CRITICAL', 'UNVERIFIED', 'telos:reviewer-hard',
    '≤ 10', 'never invent', 'no duplicate', 'Sync: NOT VERIFIED', 'behavior-neutral', 'standard profile skips',
    'each changed doc path']) assert.ok(body.includes(s), s);
  assert.match(body, /never (invoke|run) \/telos:review|not the user-only/i);
  const tools = field('allowed-tools').split(/,\s*/);
  assert.deepEqual(tools.filter((t) => /^(Agent|Task)\b/.test(t)), ['Agent(telos:reviewer-hard)']);
  assert.ok(tools.includes('Edit'));
});

test('undo injects a fixed bundle, validates the id from Request and confirms before any git revert', () => {
  const { field, body } = read('undo');
  assert.match(body, /^## Context\n!`telos ctx undo`$/m);
  assert.match(body, /^## Request\n\$ARGUMENTS$/m);
  assert.equal(body.split('$ARGUMENTS').length - 1, 1);
  assert.equal((body.match(/!`/g) ?? []).length, 1);
  const at = (s) => { const i = body.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('`telos ctx undo <NN-MM>`') < at('AskUserQuestion'));
  assert.ok(at('AskUserQuestion') < at('git revert --no-commit <hash>'));
  assert.ok(at('git revert --no-commit <hash>') < at('telos check --level full'));
  assert.ok(at('telos check --level full') < at('telos task set <NN-MM> status=reverted'));
  assert.ok(at('telos task set <NN-MM> status=reverted') < at('telos history add revert'));
  // Deep ADRs: chosen in the one confirmation, changed only after the verified revert, before task/history state.
  assert.ok(at('AskUserQuestion') < at('ADR selection'));
  assert.ok(at('telos check --level full') < at('telos adr revert <NNN> --task <NN-MM>'));
  assert.ok(at('telos adr revert <NNN> --task <NN-MM>') < at('telos task set <NN-MM> status=reverted'));
  for (const s of ['explicitly selected', 'never reactivate', 'no second question']) assert.ok(body.includes(s), s);
  assert.match(body, /adr revert[^\n]*\n?[^\n]*non-zero[^.]*stop before any task, STATUS or HISTORY change/i);
  for (const s of ['REFUSED:', 'Revert order', 'Block after undo', 'status=blocked', 'telos roadmap set <NN> active',
    '--diff-filter=U', 'git revert --abort', 'Auto-commit: no', 'revert(<NN-MM>)']) assert.ok(body.includes(s), s);
  assert.match(body, /never reverted/i);
  assert.match(body, /write no HISTORY/i);
  const tools = field('allowed-tools');
  assert.doesNotMatch(tools, /reset|stash|push|Edit|Write|git revert \*|git checkout/);
  assert.ok(tools.includes('Bash(git revert --no-commit *)'));
  assert.ok(body.trim().split('\n').length <= 60);
});

test('review skills fork the matching reviewer agent and inject only fixed commands', () => {
  const agentModel = (name) => /^model:\s*(.*)$/m.exec(readFileSync(join(SKILLS, '..', 'agents', `${name}.md`), 'utf8'))[1].trim();
  for (const [name, agent] of [['review', 'reviewer'], ['review-hard', 'reviewer-hard']]) {
    const { field, body } = read(name);
    assert.equal(field('context'), 'fork', name);
    assert.equal(field('agent'), `telos:${agent}`, name);
    assert.equal(field('model'), agentModel(agent), name);
    assert.equal(field('argument-hint'), '"[NN-MM|NN]"', name);
    assert.match(body, /^## Context\n!`telos ctx review`$/m, name);
    assert.match(body, /^## Request\n\$ARGUMENTS$/m, name);
    assert.match(body, /^## Instructions\n!`telos ctx shared review`$/m, name);
    assert.equal(body.split('$ARGUMENTS').length - 1, 1, name);
    assert.deepEqual(field('allowed-tools').split(/,\s*/).sort(),
      ['Bash(git diff *)', 'Bash(git log *)', 'Bash(telos ctx review *)', 'Bash(telos ctx shared *)', 'Glob', 'Grep', 'Read'], name);
  }
  assert.notEqual(read('review').field('agent'), read('review-hard').field('agent'));
});

test('the review instructions stop on the profile gate and validate the selector before any rerun', () => {
  const body = readFileSync(join(SHARED, 'review.md'), 'utf8');
  const gate = body.indexOf('Requires deep profile');
  const valid = body.indexOf('exactly `NN-MM` or `NN`');
  const rerun = body.indexOf('telos ctx review <selector>');
  assert.ok(gate >= 0 && valid > gate && rerun > valid, `${gate} ${valid} ${rerun}`);
  assert.match(body, /REFUSED:/);
  assert.match(body, /\/telos:review \[NN-MM\|NN\]/);
});

test('research skills fork the matching researcher agent with the fixed research bundle', () => {
  const agentModel = (name) => /^model:\s*(.*)$/m.exec(readFileSync(join(SKILLS, '..', 'agents', `${name}.md`), 'utf8'))[1].trim();
  for (const [name, agent] of [['research', 'researcher'], ['research-hard', 'researcher-hard']]) {
    const { field, body } = read(name);
    assert.equal(field('context'), 'fork', name);
    assert.equal(field('agent'), `telos:${agent}`, name);
    assert.equal(field('model'), agentModel(agent), name);
    assert.equal(field('argument-hint'), '"[NN] [--replace] [focus]"', name);
    assert.match(body, /^## Context\n!`telos ctx research`$/m, name);
    assert.match(body, /^## Request\n\$ARGUMENTS$/m, name);
    assert.match(body, /^## Instructions\n!`telos ctx shared research`$/m, name);
    assert.equal(body.split('$ARGUMENTS').length - 1, 1, name);
    assert.deepEqual(field('allowed-tools').split(/,\s*/).sort(),
      ['Bash(telos ctx research *)', 'Bash(telos ctx shared *)', 'Glob', 'Grep', 'Read', 'WebFetch', 'WebSearch'], name);
  }
});

test('plan and revise share one deep self-critique pass that adds no research, agent or question round', () => {
  const plan = readFileSync(join(SHARED, 'plan.md'), 'utf8');
  const revise = readFileSync(join(SHARED, 'revise.md'), 'utf8');
  for (const [name, body] of [['plan', plan], ['revise', revise]]) {
    assert.ok(body.trim().split('\n').length <= 60, `${name}: too long`);
    assert.equal(body.match(/self-critique/g).length, 1, `${name}: exactly one self-critique pass`);
    for (const s of ['Profile deep', 'risks', 'missing tests', 'task size', 'edge cases']) assert.ok(body.includes(s), `${name}: ${s}`);
    assert.match(body, /no extra agent|no agent/i, name);
    assert.match(body, /no second question round|no second round/i, name);
    assert.match(body, /never (run|start|invoke) research|no automatic research/i, name);
    assert.match(body, /evidence/i, name);
    assert.match(body, /Awaiting user|awaiting=/, name);
  }
  assert.match(plan, /Research \(/);
  assert.match(plan, /not (a|an) (gate|approval)/i);
  assert.match(plan, /proposed/);
  assert.match(plan, /\*\*Critique\*\* \(Profile deep only\)/);
  assert.match(revise, /same (deep )?self-critique/i);
  assert.match(plan, /unresolved/i);
  assert.ok(plan.indexOf('**Critique** (Profile deep only)') < plan.indexOf('telos lint-plan <NN>'), 'critique edits get linted');
  assert.ok(plan.indexOf('**Critique** (Profile deep only)') < plan.indexOf('Summary'));
});

test('the check skill runs the exact targeted full check and treats missing e2e as unverified', () => {
  const { body } = read('check');
  assert.match(body, /`telos check --level full --phase <NN>`/);
  assert.match(body, /`Full checks \(…\)` line/);
  assert.match(body, /E2E:/);
  assert.match(body, /UNVERIFIED/);
  assert.match(body, /never proves/i);
});
