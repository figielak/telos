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
    if (/!`telos /.test(body)) assert.match(field('allowed-tools') ?? '', /Bash\(telos \*\)/, name);
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
const VARIANTS = { 'plan-lite': 'plan', 'revise-lite': 'revise', 'do-hard': 'do', 'quick-hard': 'quick', 'map-hard': 'map' };
const MODELS = { plan: 'opus', 'plan-lite': 'sonnet', revise: 'opus', 'revise-lite': 'sonnet', do: 'sonnet', 'do-hard': 'opus', quick: 'sonnet', 'quick-hard': 'opus', map: 'sonnet', 'map-hard': 'opus', status: 'sonnet', profile: 'sonnet' };
const SHARED = fileURLToPath(new URL('../shared/', import.meta.url));
const FIELDS = ['disable-model-invocation', 'allowed-tools', 'argument-hint'];

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
