import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDist, siteRoot } from './helpers.mjs';
import { builtText, contentViolations } from './shared-content.mjs';
import { columns, rows } from '../src/data/profiles.mjs';

const html = () => readDist('index.html');
const section = (id) => html().match(new RegExp(`<section\\b[^>]*\\bid="${id}"[\\s\\S]*?</section>`))?.[0];
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');

describe('profiles data', () => {
  test('three profiles and the six SPEC rows, each with a cell per profile', () => {
    assert.deepEqual(columns, ['minimal', 'standard', 'deep']);
    assert.deepEqual(rows.map((r) => r.label), ['Workflow', 'Files', 'Tests', 'Docs', 'Subagents', 'Hooks']);
    for (const r of rows) assert.equal(r.cells.length, 3, r.label);
  });

  test('cost targets are not part of the data', () => {
    const src = readFileSync(join(siteRoot, 'src', 'data', 'profiles.mjs'), 'utf8');
    assert.ok(!/Target cost|1\.1×|2\.5×|1\.3/.test(src));
    assert.ok(!rows.some((r) => /cost/i.test(r.label)));
  });
});

describe('profiles section', () => {
  test('cards, not a table: three h3 in order, each with a dl of the six labels', () => {
    const s = section('profiles');
    assert.ok(s, '#profiles missing');
    assert.match(s, /<h2\b/);
    assert.ok(!/<table\b/.test(s), 'the table is replaced by cards');
    const names = [...s.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => strip(m[1]).trim().toLowerCase());
    assert.deepEqual(names, columns);
    const dls = [...s.matchAll(/<dl\b[\s\S]*?<\/dl>/g)].map((m) => m[0]);
    assert.equal(dls.length, 3);
    for (const dl of dls) {
      const labels = [...dl.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>/g)].map((m) => strip(m[1]).trim());
      assert.deepEqual(labels, rows.map((r) => r.label));
    }
  });

  test('every cell of profiles.mjs appears in its card', () => {
    const s = section('profiles') ?? '';
    const dls = [...s.matchAll(/<dl\b[\s\S]*?<\/dl>/g)].map((m) => strip(m[0]));
    columns.forEach((c, i) => rows.forEach((r) => assert.ok(dls[i].includes(r.cells[i]), `${c} / ${r.label}: ${r.cells[i]}`)));
  });

  test('profiles offer audience guidance and recommend Standard', () => {
    const s = section('profiles') ?? '';
    assert.match(s, /lg:grid-cols-3/);
    assert.match(s, /\bsection-y\b/);
    assert.match(s, /\bmax-w-page\b/);
    const cards = s.match(/<article\b[\s\S]*?<\/article>/g);
    assert.equal(cards.length, 3);
    assert.match(cards[1], /Recommended start/);
    assert.match(cards[1], /border-accent/);
    for (const card of cards) {
      const detail = card.match(/<details\b[\s\S]*?<\/details>/)?.[0];
      assert.ok(detail);
      assert.ok(!/<details[^>]*\bopen\b/.test(detail));
      assert.match(detail, /<dl\b/);
      assert.match(strip(card.replace(detail, '')), /For /);
    }
  });

  test('states the superset rule and how to switch', () => {
    const t = strip(section('profiles') ?? '');
    assert.match(t, /superset/i);
    assert.match(t, /\/telos:profile/);
  });
});

describe('memory section', () => {
  test('names every file and directory of the .telos tree', () => {
    const s = section('memory');
    assert.ok(s, '#memory missing');
    assert.match(s, /<h2\b/);
    assert.match(s, /<pre\b/);
    const t = strip(s);
    for (const f of ['PROJECT.md', 'MAP.md', 'ROADMAP.md', 'STATUS.md', 'HISTORY.md', 'LESSONS.md', 'decisions/']) {
      assert.ok(t.includes(f), `memory lacks ${f}`);
    }
  });

  test('every named file has a template (decisions/ is exempt)', () => {
    for (const f of ['PROJECT.md', 'MAP.md', 'ROADMAP.md', 'STATUS.md', 'HISTORY.md', 'LESSONS.md']) {
      assert.ok(existsSync(join(siteRoot, '..', 'templates', f)), `templates/${f} missing`);
    }
  });

  test('real limits and plain-file statement', () => {
    const t = strip(section('memory') ?? '');
    for (const lim of ['60 lines', '1500 tokens', '80 lines', '40 lines']) assert.ok(t.includes(lim), lim);
    assert.match(t, /plain files/i);
    assert.match(t, /repository/i);
  });

  test('text comes before the tree, and the layout does not reorder with CSS', () => {
    const s = section('memory') ?? '';
    assert.ok(s.search(/<h2\b/) < s.indexOf('<figure'), 'heading before the tree in the HTML');
    assert.ok(!/md:order-/.test(readFileSync(join(siteRoot, 'src', 'components', 'Memory.astro'), 'utf8')));
    assert.match(s, /\bsection-y\b/);
    assert.match(s, /\bmax-w-page\b/);
  });

  test('tree is a labelled scroll region', () => {
    const s = section('memory') ?? '';
    assert.match(s, /role="region"[^>]*aria-label="[^"]+"[^>]*tabindex="0"|tabindex="0"[^>]*role="region"/);
  });
});

describe('page', () => {
  test('memory comes before profiles, and both follow features', () => {
    const h = html();
    const at = ['workflow', 'features', 'memory', 'profiles'].map((id) => h.search(new RegExp(`<section\\b[^>]*\\bid="${id}"`)));
    assert.ok(at.every((i) => i > -1), `positions ${at}`);
    assert.deepEqual([...at].sort((a, b) => a - b), at);
  });

  test('shared content rules hold, and no cost targets appear', () => {
    const t = builtText();
    assert.deepEqual(contentViolations(t), []);
    assert.ok(!/Target cost/i.test(t));
  });
});
