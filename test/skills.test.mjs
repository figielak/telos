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

const MODELS = { plan: 'opus', map: 'sonnet', status: 'sonnet', close: 'sonnet' };
const SHARED = fileURLToPath(new URL('../shared/', import.meta.url));

test('exactly four skills remain, one per memory step, each on its model', () => {
  assert.deepEqual([...skills].sort(), ['close', 'map', 'plan', 'status']);
  for (const [name, model] of Object.entries(MODELS)) assert.equal(read(name).field('model'), model, name);
});

test('plan injects the plan bundle and the shared plan body', () => {
  assert.match(read('plan').body, /^!`telos ctx plan`$/m);
  assert.match(read('plan').body, /^## Request\n\$ARGUMENTS$/m);
  assert.match(read('plan').body, /^!`telos ctx shared plan`$/m);
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

// 06-TUNING baseline: rendered per-run bodies at HEAD f1b1b10; growth needs a new measurement.
test('the per-run plan body stays short and keeps its gates', async () => {
  const { main } = await import('../lib/cli.mjs');
  const shared = async (name) => {
    const out = { text: '', write(s) { out.text += s; } };
    assert.equal(await main(['ctx', 'shared', name], { cwd: SHARED, stdout: out, stderr: out }), 0);
    return out.text;
  };
  const baseline = { plan: 2600 };
  const gates = {
    plan: ['AskUserQuestion', 'No second round', '≤ 80 lines', 'telos roadmap set <NN> active', 'Auto-commit: yes'],
  };
  for (const [name, max] of Object.entries(baseline)) {
    const text = await shared(name);
    assert.ok(text.length <= max, `shared ${name}: ${text.length} chars > baseline ${max}`);
    for (const gate of gates[name]) assert.ok(text.includes(gate), `shared ${name} lost '${gate}'`);
  }
});

test('the plan instructions use the telos commands and a short summary', () => {
  const plan = readFileSync(join(SHARED, 'plan.md'), 'utf8');
  for (const cmd of ['telos roadmap set', 'telos roadmap add', 'telos status rm carry', 'telos status set', 'telos ctx plan NN']) {
    assert.ok(plan.includes(cmd), cmd);
  }
  for (const gone of ['telos lint-plan', 'telos task new', '/telos:approve', 'CONTEXT']) assert.ok(!plan.includes(gone), gone);
  assert.match(plan, /≤ 8 lines/);
  assert.match(plan, /AskUserQuestion/);
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
  assert.match(plan.text, /telos roadmap set <NN> active/);
  assert.doesNotMatch(plan.text, /<!--/);
  assert.equal((await run('nope')).text, "telos ctx: no shared instructions 'nope'\n");
  assert.equal((await run('../x')).code, 2);
});

test('free text never reaches a shell injection', () => {
  for (const name of skills) {
    for (const [cmd] of read(name).body.matchAll(/!`[^`]*`/g)) assert.doesNotMatch(cmd, /\$ARGUMENTS/, `${name}: ${cmd}`);
  }
});

test('status injects its bundle and may only run telos', () => {
  const { field, body } = read('status');
  assert.match(body, /^!`telos ctx status`$/m);
  assert.equal(field('allowed-tools'), 'Bash(telos *)');
});

test('the map skill injects the fixed bundle and shared body; arguments only appear under Request', () => {
  for (const name of ['map']) {
    const { field, body } = read(name);
    assert.match(body, /^## Context\n!`telos ctx map`$/m, name);
    assert.match(body, /^## Request\n\$ARGUMENTS$/m, name);
    assert.match(body, /^## Instructions\n!`telos ctx shared map`$/m, name);
    assert.equal(body.split('$ARGUMENTS').length - 1, 1, name);
    const tools = field('allowed-tools');
    for (const t of ['Bash(telos *)', 'Read', 'Grep', 'Glob', 'Edit(.telos/MAP.md)', 'Edit(.telos/PROJECT.md)', 'Edit(.telos/areas/*)', 'Write(.telos/MAP.md)', 'Write(.telos/PROJECT.md)', 'Write(.telos/areas/*)']) {
      assert.ok(tools.split(/,\s*/).includes(t), `${name}: ${t}`);
    }
    assert.doesNotMatch(tools, /push|reset|Edit\(\.telos\/\*\*\)|Write\(\*|ROADMAP/, name);
    assert.deepEqual(tools.split(/,\s*/).filter((t) => /git/.test(t)).sort(),
      ['Bash(git add .telos/MAP.md*)', 'Bash(git commit *)', 'Bash(git diff --cached*)', 'Bash(git status*)'], name);
    assert.ok(tools.split(/,\s*/).includes('AskUserQuestion'), name);
  }
});

test('the map instructions require targeted reads, the full format and validated writes', () => {
  const map = readFileSync(join(SHARED, 'map.md'), 'utf8');
  assert.ok(map.trim().split('\n').length <= 60);
  for (const s of ['REFUSED:', 'Header to write', 'telos-map', 'Not built yet', 'telos ctx map', 'Map validation: PASS',
    '## Structure', '## Areas', '## Find', '.telos/areas/', 'telos area new', 'Affected areas', '3–8', '--refresh', 'at most two', 'rollback']) {
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
  // The only question is the commit confirmation after a successful validation.
  assert.equal(map.match(/AskUserQuestion/g).length, 1);
  assert.ok(map.indexOf('Map validation: PASS') < map.indexOf('AskUserQuestion'));
});

test('the map instructions commit only a confirmed validated map with explicit paths and never touch ROADMAP', () => {
  const map = readFileSync(join(SHARED, 'map.md'), 'utf8');
  assert.match(map, /ROADMAP/);
  assert.match(map, /usage/i);
  const at = (s) => { const i = map.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('Map validation: PASS') < at('Commit after PASS'));
  assert.ok(at('Commit after PASS') < at('git diff --cached --name-only'));
  assert.ok(at('git diff --cached --name-only') < at('git add .telos/MAP.md'));
  assert.ok(at('git add .telos/MAP.md') < at('git commit -m "docs(telos): map" --'));
  for (const s of ['Auto-commit: no', 'headless', 'declined']) assert.ok(map.includes(s), s);
  assert.match(map, /no git (writes|command)/i);
  assert.doesNotMatch(map, /git (add (-A|--all|\.\/?(?=[\s`]|$))|push)|--no-verify/m);
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

test('close injects one fixed bundle, runs the checks before the closing commands and honors auto_commit', () => {
  const { field, body } = read('close');
  assert.match(body, /^## Context\n!`telos ctx close`$/m);
  assert.match(body, /^## Request\n\$ARGUMENTS$/m);
  assert.equal((body.match(/!`/g) ?? []).length, 1);
  assert.ok(body.includes('`telos ctx close <NN>`'));
  const at = (s) => { const i = body.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('REFUSED:') < at('Close: blocked'));
  assert.ok(at('Close: blocked') < at('`Checks:`'));
  assert.ok(at('`Checks:`') < at('`Closing commands`'));
  assert.ok(at('`Closing commands`') < at('Auto-commit: yes'));
  assert.doesNotMatch(field('allowed-tools'), /push|reset|tag|Write|Edit|Agent/);
  assert.ok(body.trim().split('\n').length <= 40);
});

