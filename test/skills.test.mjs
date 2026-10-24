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
const VARIANTS = { 'plan-lite': 'plan', 'revise-lite': 'revise' };
const MODELS = { plan: 'opus', 'plan-lite': 'sonnet', revise: 'opus', 'revise-lite': 'sonnet' };
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
      assert.ok(readFileSync(path, 'utf8').trim().split('\n').length <= 60, `shared/${shared}.md too long`);
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
