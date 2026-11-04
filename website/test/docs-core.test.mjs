import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { distPath, readDist, siteRoot } from './helpers.mjs';
import { builtText, contentViolations } from './shared-content.mjs';

const BASE = ['init', 'profile', 'map', 'plan', 'approve', 'revise', 'do', 'quick', 'status'];
const VARIANTS = { map: 'map-hard', plan: 'plan-lite', revise: 'revise-lite', do: 'do-hard', quick: 'quick-hard' };
const load = async () => (await import('../src/data/docs/commands.mjs')).commands;
const page = (slug) => `docs/commands/${slug}/index.html`;
const text = (slug) => builtText(page(slug));

describe('base skills', () => {
  test('all nine everyday skills have a record, an index link and a rendered page', async () => {
    const commands = await load();
    const index = readDist('docs', 'index.html');
    for (const name of BASE) {
      const c = commands.find((x) => x.slug === `skill-${name}`);
      assert.ok(c, `record skill-${name}`);
      assert.equal(c.kind, 'skill');
      assert.ok(c.invocation.startsWith(`/telos:${name}`), c.invocation);
      assert.ok(existsSync(join(siteRoot, '..', 'skills', name, 'SKILL.md')), name);
      assert.match(index, new RegExp(`href="/docs/commands/skill-${name}/"`));
      assert.ok(existsSync(distPath(...page(`skill-${name}`).split('/'))), name);
    }
  });

  test('each record has concrete examples with expected outcomes, use/avoid advice, a linked alternative and sources', async () => {
    const commands = await load();
    const slugs = new Set(commands.map((c) => c.slug));
    for (const name of BASE) {
      const c = commands.find((x) => x.slug === `skill-${name}`);
      assert.ok(c.examples.length >= 1, name);
      for (const e of c.examples) {
        assert.ok(e.command.startsWith('/telos:'), `${name}: example is a skill call`);
        assert.ok(e.outcome.length >= 40, `${name}: outcome is concrete`);
      }
      assert.ok(c.use.length >= 2 && c.avoid.length >= 2, `${name} use/avoid`);
      assert.ok(c.alternatives.some((a) => a.slug && slugs.has(a.slug)), `${name} has a linked alternative`);
      assert.ok(c.sources.some((s) => s.path === `skills/${name}/SKILL.md`), `${name} cites its skill`);
      assert.ok(c.sources.length >= 2, `${name} sources`);
    }
  });

  test('profile values are valid and every record states its state prerequisites', async () => {
    const commands = await load();
    for (const name of BASE) {
      const c = commands.find((x) => x.slug === `skill-${name}`);
      const named = [...c.profiles.toLowerCase().matchAll(/\b(minimal|standard|deep)\b/g)].map((m) => m[1]);
      assert.ok(/^All profiles/.test(c.profiles) || named.length > 0, `${name}: ${c.profiles}`);
      assert.ok(c.prerequisites.length >= 1, name);
    }
  });

  test('rendered pages use only known commands and avoid banned wording', async () => {
    for (const name of BASE) assert.deepEqual(contentViolations(text(`skill-${name}`)), [], name);
  });
});

describe('model variants', () => {
  test('each variant has an anchor, an invocation example and Use/Avoid guidance', async () => {
    const commands = await load();
    for (const [base, variant] of Object.entries(VARIANTS)) {
      const c = commands.find((x) => x.slug === `skill-${base}`);
      const v = c.variants?.find((x) => x.id === variant);
      assert.ok(v, `${base} lists ${variant}`);
      assert.ok(existsSync(join(siteRoot, '..', 'skills', variant, 'SKILL.md')), variant);
      assert.equal(v.name, `/telos:${variant}`);
      assert.ok(v.invocation.startsWith(`/telos:${variant}`), v.invocation);
      assert.ok(v.notes.some((n) => /^Use when /.test(n)), `${variant} Use when`);
      assert.ok(v.notes.some((n) => /^Avoid when /.test(n)), `${variant} Avoid when`);
      assert.ok(v.notes.some((n) => /^Model: /.test(n)), `${variant} Model`);
      assert.ok(c.sources.some((s) => s.path === `skills/${variant}/SKILL.md`), `${variant} source`);
    }
  });

  test('the rendered base page has the variant anchor and the index links to it', () => {
    const index = readDist('docs', 'index.html');
    for (const [base, variant] of Object.entries(VARIANTS)) {
      const h = readDist(...page(`skill-${base}`).split('/'));
      assert.match(h, new RegExp(`<h3\\b[^>]*\\bid="variant-${variant}"`), variant);
      assert.ok(index.includes(`href="/docs/commands/skill-${base}/#variant-${variant}"`), `index links ${variant}`);
    }
  });

  test('variant text states the model difference without promising cost or quality gains', async () => {
    const commands = await load();
    for (const [base, variant] of Object.entries(VARIANTS)) {
      const v = commands.find((x) => x.slug === `skill-${base}`).variants.find((x) => x.id === variant);
      const all = [v.summary, ...v.notes].join(' ');
      assert.match(all, /\b(Sonnet|Opus)\b/);
      assert.ok(!/\b(cheap\w*|cost\w*|saves?|savings?|faster|quicker|better|higher quality|more accurate|guarantee\w*)\b/i.test(all), `${variant}: ${all}`);
      assert.deepEqual(contentViolations(all), [], variant);
    }
  });

  test('variants do not repeat the base behavior: their summaries point back to the base skill', async () => {
    const commands = await load();
    for (const [base, variant] of Object.entries(VARIANTS)) {
      const v = commands.find((x) => x.slug === `skill-${base}`).variants.find((x) => x.id === variant);
      assert.ok(v.summary.includes(`/telos:${base}`), `${variant} refers to /telos:${base}`);
      assert.ok(v.summary.length <= 260, `${variant} summary stays short`);
    }
  });
});

describe('distinctions between neighbouring commands', () => {
  test('plan is for a new or drafted phase; revise edits the existing plan and sends approved tasks back to draft', () => {
    const plan = text('skill-plan');
    const revise = text('skill-revise');
    assert.match(plan, /new phase/i);
    assert.match(plan, /active/);
    assert.match(plan, /\/telos:revise/);
    assert.match(plan, /never commits|does not commit/i);
    assert.match(revise, /back to draft/i);
    assert.match(revise, /in-progress/);
    assert.match(revise, /\/telos:plan/);
    assert.match(revise, /never renumber|not renumber|never renumbered/i);
  });

  test('quick has no phase, task or STATUS change and hands larger work to plan; do runs an approved task only', () => {
    const quick = text('skill-quick');
    const run = text('skill-do');
    assert.match(quick, /no (plan file|phase)/i);
    assert.match(quick, /five files/i);
    assert.match(quick, /\/telos:plan/);
    assert.match(quick, /\(quick\)/);
    assert.match(run, /approved/);
    assert.match(run, /\/telos:approve/);
    assert.match(run, /git\.auto_commit/);
    assert.match(run, /blocked/);
    assert.match(run, /\/telos:do-hard/);
  });

  test('approve commits the plan and runs nothing; do is the step that executes', () => {
    const approve = text('skill-approve');
    assert.match(approve, /does not run any task|runs no task|executes nothing/i);
    assert.match(approve, /telos\/\d\d-start|telos\/NN-start/);
    assert.match(approve, /never pushes|does not push/i);
    assert.match(approve, /\/telos:do/);
  });

  test('map: a full build differs from --refresh, and the PROJECT draft stays unconfirmed', () => {
    const map = text('skill-map');
    assert.match(map, /--refresh/);
    assert.match(map, /full build/i);
    assert.match(map, /incremental/i);
    assert.match(map, /noop/i);
    assert.match(map, /unconfirmed/i);
    assert.match(map, /Map validation: PASS/);
  });

  test('no do example implies that an unapproved or draft task can run', async () => {
    const run = (await load()).find((c) => c.slug === 'skill-do');
    assert.ok(run.prerequisites.some((p) => /approved/.test(p)));
    assert.ok(run.avoid.some((a) => /draft|approve/.test(a)));
    for (const e of run.examples) assert.ok(/approved|\/telos:approve/.test(`${e.title} ${e.outcome}`), e.title);
  });

  test('profile and init stay separate: init sets a profile once, profile switches it later', () => {
    const init = text('skill-init');
    const profile = text('skill-profile');
    assert.match(init, /\/telos:profile/);
    assert.match(init, /git init/);
    assert.match(profile, /HISTORY/);
    assert.match(profile, /retain/i);
  });
});
