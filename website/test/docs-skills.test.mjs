import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { distPath, readDist, siteRoot } from './helpers.mjs';
import { builtText, contentViolations } from './shared-content.mjs';

const ADVANCED = ['discuss', 'lesson', 'check', 'done', 'undo', 'review', 'research', 'docs'];
const VARIANTS = { review: 'review-hard', research: 'research-hard' };
const load = async () => (await import('../src/data/docs/commands.mjs')).commands;
const page = (slug) => `docs/commands/${slug}/index.html`;
const text = (slug) => builtText(page(slug));
const skillDirs = () =>
  readdirSync(join(siteRoot, '..', 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

describe('skill inventory', () => {
  test('guide bases and variants equal the directories under skills/', async () => {
    const skills = (await load()).filter((c) => c.kind === 'skill');
    const covered = new Set();
    for (const c of skills) {
      covered.add(c.slug.replace(/^skill-/, ''));
      for (const v of c.variants ?? []) covered.add(v.id);
    }
    const dirs = skillDirs();
    const missing = dirs.filter((d) => !covered.has(d));
    const unknown = [...covered].filter((d) => !dirs.includes(d));
    assert.deepEqual(missing, [], `shipped skills missing from the guide: ${missing.join(', ')}`);
    assert.deepEqual(unknown, [], `guide entries without a skills/ directory: ${unknown.join(', ')}`);
  });

  test('every base and variant is reachable: page exists, index links it, variants have an anchor', async () => {
    const skills = (await load()).filter((c) => c.kind === 'skill');
    const index = readDist('docs', 'index.html');
    for (const c of skills) {
      assert.ok(existsSync(distPath(...page(c.slug).split('/'))), `${c.slug} page`);
      assert.match(index, new RegExp(`href="/docs/commands/${c.slug}/"`), `${c.slug} index link`);
      const html = readDist(...page(c.slug).split('/'));
      for (const v of c.variants ?? []) {
        assert.match(html, new RegExp(`<h3\\b[^>]*\\bid="variant-${v.id}"`), `${v.id} anchor`);
        assert.ok(index.includes(`href="/docs/commands/${c.slug}/#variant-${v.id}"`), `${v.id} index link`);
      }
    }
  });
});

describe('advanced skill records', () => {
  test('each has example, profile, use/avoid, linked alternative and source attribution', async () => {
    const commands = await load();
    const slugs = new Set(commands.map((c) => c.slug));
    for (const name of ADVANCED) {
      const c = commands.find((x) => x.slug === `skill-${name}`);
      assert.ok(c, `record skill-${name}`);
      assert.equal(c.kind, 'skill');
      assert.ok(c.invocation.startsWith(`/telos:${name}`), c.invocation);
      assert.ok(c.examples.length >= 1, name);
      for (const e of c.examples) {
        assert.ok(e.command.startsWith('/telos:'), `${name}: example is a skill call`);
        assert.ok(e.outcome.length >= 40, `${name}: outcome is concrete`);
      }
      assert.ok(c.use.length >= 2 && c.avoid.length >= 2, `${name} use/avoid`);
      assert.ok(c.alternatives.some((a) => a.slug && slugs.has(a.slug)), `${name} linked alternative`);
      assert.ok(c.alternatives.every((a) => !a.slug || slugs.has(a.slug)), `${name} alternatives resolve`);
      assert.ok(c.prerequisites.length >= 1, name);
      assert.ok(c.sources.some((s) => s.path === `skills/${name}/SKILL.md`), `${name} cites its skill`);
      assert.ok(c.sources.some((s) => s.path === 'README.md'), `${name} cites README`);
      const html = text(`skill-${name}`);
      assert.match(html, /Use when|When to use/i, `${name} use heading`);
      assert.deepEqual(contentViolations(html), [], name);
    }
  });

  test('profile gates are stated: standard for discuss/lesson/check/done/undo, deep for review/research/docs', async () => {
    const commands = await load();
    for (const name of ['discuss', 'lesson', 'check', 'done', 'undo']) {
      const c = commands.find((x) => x.slug === `skill-${name}`);
      assert.match(c.profiles, /standard/i, name);
      assert.match(c.profiles, /deep/i, name);
      assert.ok(!/minimal/.test(c.profiles.replace(/not minimal|minimal (prints|stops)|except minimal/gi, '')), `${name}: ${c.profiles}`);
      assert.match(text(`skill-${name}`), /Requires standard profile/, name);
    }
    for (const name of ['review', 'research', 'docs']) {
      const c = commands.find((x) => x.slug === `skill-${name}`);
      assert.match(c.profiles, /^Deep only/, name);
      assert.match(text(`skill-${name}`), /Requires deep profile/, name);
    }
  });

  test('review and research variants state a model difference and an anchor', async () => {
    const commands = await load();
    for (const [base, variant] of Object.entries(VARIANTS)) {
      const c = commands.find((x) => x.slug === `skill-${base}`);
      const v = c.variants.find((x) => x.id === variant);
      assert.ok(v, `${base} lists ${variant}`);
      assert.equal(v.name, `/telos:${variant}`);
      assert.ok(v.invocation.startsWith(`/telos:${variant}`), v.invocation);
      assert.ok(v.summary.includes(`/telos:${base}`) && v.summary.length <= 260, `${variant} summary`);
      for (const re of [/^Use when /, /^Avoid when /, /^Model: /]) assert.ok(v.notes.some((n) => re.test(n)), `${variant} ${re}`);
      assert.match([v.summary, ...v.notes].join(' '), /\b(Sonnet|Opus)\b/);
      assert.ok(!/\b(cheap\w*|cost\w*|saves?|faster|better|guarantee\w*)\b/i.test([v.summary, ...v.notes].join(' ')), variant);
      assert.deepEqual(contentViolations([v.summary, ...v.notes].join(' ')), [], variant);
      assert.ok(c.sources.some((s) => s.path === `skills/${variant}/SKILL.md`), `${variant} source`);
    }
  });
});

describe('explicit distinctions', () => {
  test('discuss: existing-phase requirements, proposed decisions, no commit', () => {
    const t = text('skill-discuss');
    assert.match(t, /\[proposed\]/);
    assert.match(t, /active/);
    assert.match(t, /\/telos:revise/);
    assert.match(t, /one (question )?round/i);
    assert.match(t, /does not commit|never commits|no commit/i);
  });

  test('check verifies and changes nothing; done closes and records', () => {
    const check = text('skill-check');
    const done = text('skill-done');
    assert.match(check, /changes nothing|read-only|edits nothing/i);
    assert.match(check, /manual/i);
    assert.match(check, /UNVERIFIED/);
    assert.match(check, /e2e/);
    assert.match(check, /\/telos:done/);
    assert.match(done, /Close: blocked/);
    assert.match(done, /manual/i);
    assert.match(done, /docs\(telos\): close phase/);
    assert.match(done, /\/telos:check/);
    assert.match(done, /never pushes|does not push/i);
    assert.match(done, /HISTORY/);
    assert.match(done, /RED/);
    assert.match(done, /e2e/);
  });

  test('review is read-only, reports UNVERIFIED and does not fix; research hands off a report', () => {
    const review = text('skill-review');
    assert.match(review, /read-only/i);
    assert.match(review, /UNVERIFIED/);
    assert.match(review, /does not fix|never fixes|no fixes/i);
    assert.match(review, /CHANGES REQUESTED/);
    assert.match(review, /one round|no re-review/i);
    const research = text('skill-research');
    assert.match(research, /Handoff/);
    assert.match(research, /--replace/);
    assert.match(research, /NN-RESEARCH\.md|RESEARCH\.md/);
    assert.match(research, /never decides|stays open|does not decide/i);
    assert.match(research, /\/telos:discuss/);
  });

  test('docs: scope rules and the no-op behaviour', () => {
    const t = text('skill-docs');
    assert.match(t, /Sync: NO-OP/);
    assert.match(t, /NOT VERIFIED/);
    assert.match(t, /repo-relative/);
    assert.match(t, /no git|does not commit|never commits/i);
  });

  test('undo: exact hashes are confirmed first and dependents are blocked, not reverted', () => {
    const t = text('skill-undo');
    assert.match(t, /confirm/i);
    assert.match(t, /hash/i);
    assert.match(t, /Cancel|cancel/);
    assert.match(t, /dependent/i);
    assert.match(t, /blocked/);
    assert.match(t, /never reverted|not reverted|never revert/i);
    assert.match(t, /reverted/);
    assert.match(t, /revert\(/);
    assert.match(t, /never (resets|pushes)|does not push/i);
  });

  test('deep critical work needs real RED, configured e2e and review evidence (stated on do/done pages)', () => {
    const done = text('skill-done');
    assert.match(done, /critical/i);
    assert.match(done, /RED/);
    assert.match(done, /review/i);
  });
});
