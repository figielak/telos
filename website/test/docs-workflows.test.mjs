import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { distPath, readDist } from './helpers.mjs';
import { builtText, contentViolations } from './shared-content.mjs';

const SLUGS = ['quick-fix', 'onboard-existing-repo', 'standard-feature', 'deep-critical-feature', 'change-resume-undo'];
const WHERE = new Set(['Claude Code', 'Bash', 'You decide']);
const loadRecipes = async () => (await import('../src/data/docs/workflows.mjs')).workflows;
const loadCommands = async () => (await import('../src/data/docs/commands.mjs')).commands;
const route = (slug) => ['docs', 'workflows', slug, 'index.html'];
const cmdText = (s) => s.command ?? '';
const has = (recipe, re) => recipe.steps.some((s) => re.test(cmdText(s)));
const indexOf = (recipe, re) => recipe.steps.findIndex((s) => re.test(cmdText(s)));

describe('recipe set', () => {
  test('exactly the five agreed recipes with unique slugs', async () => {
    const recipes = await loadRecipes();
    assert.deepEqual(recipes.map((r) => r.slug), SLUGS);
    assert.equal(new Set(recipes.map((r) => r.slug)).size, 5);
  });

  test('each recipe has when to choose/avoid, start state, artifacts, steps and stop conditions', async () => {
    for (const r of await loadRecipes()) {
      assert.ok(r.title && r.summary, r.slug);
      assert.ok(r.choose.length >= 2 && r.avoid.length >= 2, `${r.slug} choose/avoid`);
      for (const k of ['profile', 'repository', 'phase', 'task']) assert.ok(r.start[k], `${r.slug} start.${k}`);
      assert.ok(r.artifacts.length >= 2, `${r.slug} artifacts`);
      assert.ok(r.steps.length >= 4, `${r.slug} steps`);
      assert.ok(r.stops.length >= 2, `${r.slug} stops`);
      assert.ok(r.alternatives.length >= 1, `${r.slug} alternatives`);
    }
  });
});

describe('steps', () => {
  test('every step names where to run it, an outcome and a checkpoint, and links an existing guide entry or is a user action', async () => {
    const slugs = new Set((await loadCommands()).map((c) => c.slug));
    for (const r of await loadRecipes()) {
      for (const [i, s] of r.steps.entries()) {
        const id = `${r.slug} step ${i + 1}`;
        assert.ok(s.title, id);
        assert.ok(WHERE.has(s.where), `${id}: where ${s.where}`);
        assert.ok(s.outcome && s.outcome.length >= 30, `${id} outcome`);
        assert.ok(s.checkpoint && s.checkpoint.length >= 15, `${id} checkpoint`);
        if (s.where === 'You decide') {
          assert.ok(!s.command || !/^\/telos:/.test(s.command), `${id}: a user action is not a skill call`);
          continue;
        }
        assert.ok(s.command, `${id} command`);
        assert.ok(s.link && slugs.has(s.link), `${id}: link ${s.link} resolves to a guide entry`);
        if (s.where === 'Claude Code') assert.match(s.command, /^\/telos:/, id);
        if (s.where === 'Bash') assert.match(s.command, /^(telos|git|npm|node) /, id);
        assert.ok((s.where === 'Claude Code') === s.link.startsWith('skill-'), `${id}: ${s.where} links a ${s.link}`);
      }
    }
  });

  test('conditional steps are marked and say what to do when blocked, refused or UNVERIFIED', async () => {
    for (const r of await loadRecipes()) {
      for (const [i, s] of r.steps.entries()) {
        if (s.optional || s.condition) assert.ok(s.condition && /^If /.test(s.condition), `${r.slug} step ${i + 1} condition`);
      }
      const stops = r.stops.join(' ');
      assert.match(stops, /Stop|stop/, r.slug);
    }
    const all = JSON.stringify(await loadRecipes());
    assert.match(all, /UNVERIFIED/);
    assert.match(all, /REFUSED/);
    assert.match(all, /blocked/);
  });

  test('all text uses known commands and avoids banned wording; scenarios are labelled illustrative; nothing pushes', async () => {
    for (const r of await loadRecipes()) {
      const all = JSON.stringify(r);
      assert.deepEqual(contentViolations(all), [], r.slug);
      assert.match(r.illustration ?? '', /illustrative/i, `${r.slug} illustration label`);
      assert.ok(!/git push/.test(all.replace(/never (runs )?git push|does not push|never pushes|no recipe pushes/gi, '')), `${r.slug} pushes`);
    }
  });
});

describe('prerequisite regressions', () => {
  test('discuss and research come only after a phase exists; research only after discuss wrote the CONTEXT', async () => {
    const byslug = Object.fromEntries((await loadRecipes()).map((r) => [r.slug, r]));
    for (const slug of ['standard-feature', 'deep-critical-feature']) {
      const r = byslug[slug];
      const phase = indexOf(r, /^telos roadmap add /);
      const discuss = indexOf(r, /^\/telos:discuss/);
      assert.ok(phase >= 0 && discuss > phase, `${slug}: phase created before discuss`);
      assert.match(r.start.phase, /no phase|none|not yet/i, slug);
    }
    const deep = byslug['deep-critical-feature'];
    const research = indexOf(deep, /^\/telos:research/);
    assert.ok(research > indexOf(deep, /^\/telos:discuss/), 'research after discuss');
  });

  test('deep critical recipe configures e2e before do, and states RED, e2e and one review', async () => {
    const deep = (await loadRecipes()).find((r) => r.slug === 'deep-critical-feature');
    const config = deep.steps.findIndex((s) => s.where === 'You decide' && /e2e/.test(`${s.title} ${s.outcome}`));
    const run = indexOf(deep, /^\/telos:do/);
    assert.ok(config >= 0 && config < run, 'e2e configured before do');
    assert.match(deep.start.profile, /deep/i);
    const text = JSON.stringify(deep);
    assert.match(text, /RED/);
    assert.match(text, /e2e/);
    assert.match(text, /review/i);
    assert.match(text, /\/telos:do-hard/);
  });

  test('profile-gated commands never appear in recipes that start on minimal and do not switch profile', async () => {
    for (const r of await loadRecipes()) {
      if (!/minimal/i.test(r.start.profile)) continue;
      const switched = has(r, /^\/telos:profile|^telos profile/);
      if (switched) continue;
      for (const [i, s] of r.steps.entries()) {
        assert.ok(!/^\/telos:(check|done|discuss|lesson|undo|review|research|docs)\b/.test(cmdText(s)), `${r.slug} step ${i + 1} is gated: ${s.command}`);
      }
    }
    const onboard = (await loadRecipes()).find((r) => r.slug === 'onboard-existing-repo');
    assert.ok(!has(onboard, /^\/telos:(check|done)/), 'onboarding ends before check/done');
    assert.match(onboard.start.profile, /minimal/i);
  });

  test('do is repeated for the actual planned task ids, never promised', async () => {
    for (const slug of ['standard-feature', 'deep-critical-feature']) {
      const r = (await loadRecipes()).find((x) => x.slug === slug);
      const runs = r.steps.filter((s) => /^\/telos:do/.test(cmdText(s)));
      assert.ok(runs.length >= 1);
      assert.match(JSON.stringify(r), /task ids? (come|comes|are|is) from|your plan|actual (planned )?(task )?ids?/i, slug);
    }
  });

  test('undo is optional and confirmed; revise sends changed approved tasks back to approve; blocked work stops', async () => {
    const r = (await loadRecipes()).find((x) => x.slug === 'change-resume-undo');
    const undo = r.steps.find((s) => /^\/telos:undo/.test(cmdText(s)));
    assert.ok(undo && undo.optional === true && /^If /.test(undo.condition));
    assert.match(`${undo.outcome} ${undo.checkpoint}`, /confirm/i);
    assert.match(`${undo.outcome} ${undo.checkpoint}`, /dependent/i);
    const revise = r.steps.find((s) => /^\/telos:revise/.test(cmdText(s)));
    assert.match(`${revise.outcome} ${revise.checkpoint}`, /draft/);
    assert.ok(r.steps.some((s) => /^\/telos:approve/.test(cmdText(s))));
    assert.match(r.stops.join(' '), /blocked/);
    for (const other of (await loadRecipes()).filter((x) => x.slug !== r.slug)) {
      assert.ok(!has(other, /^\/telos:undo/) || other.steps.find((s) => /^\/telos:undo/.test(cmdText(s))).optional, other.slug);
    }
  });
});

describe('built pages', () => {
  test('index and detail routes exist and are reachable from the docs index and the landing workflow', async () => {
    assert.ok(existsSync(distPath('docs', 'workflows', 'index.html')));
    const wfIndex = readDist('docs', 'workflows', 'index.html');
    const docsIndex = readDist('docs', 'index.html');
    const landing = readDist('index.html');
    assert.match(docsIndex, /href="\/docs\/workflows\/"/);
    assert.match(landing, /href="\/docs\/workflows\/"/);
    for (const slug of SLUGS) {
      assert.ok(existsSync(distPath(...route(slug))), slug);
      assert.match(wfIndex, new RegExp(`href="/docs/workflows/${slug}/"`), `${slug} in index`);
      assert.match(docsIndex, new RegExp(`href="/docs/workflows/${slug}/"`), `${slug} in docs index`);
    }
  });

  test('detail pages are readable without JavaScript: ordered steps, step headings, code as text, resolving links', async () => {
    const commands = await loadCommands();
    const recipes = await loadRecipes();
    for (const r of recipes) {
      const html = readDist(...route(r.slug));
      assert.match(html, /<ol\b/, `${r.slug} ordered steps`);
      for (const [i, s] of r.steps.entries()) {
        assert.match(html, new RegExp(`<h3\\b[^>]*\\bid="step-${i + 1}"`), `${r.slug} step-${i + 1} anchor`);
        if (s.link) assert.ok(html.includes(`href="/docs/commands/${s.link}/"`), `${r.slug} links ${s.link}`);
      }
      const text = builtText(route(r.slug).join('/'));
      assert.match(text, /Illustrative/);
      assert.match(text, /Bash|Claude Code/);
      assert.deepEqual(contentViolations(text), [], r.slug);
      const hrefs = [...html.matchAll(/href="(\/docs\/[^"#]*)"/g)].map((m) => m[1]);
      for (const h of hrefs) assert.ok(existsSync(distPath(...h.split('/').filter(Boolean), 'index.html')), `${r.slug}: ${h}`);
    }
    assert.ok(commands.length > 0);
  });
});
