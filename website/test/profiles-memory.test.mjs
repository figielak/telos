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
  test('real table with three column headers and six row headers', () => {
    const s = section('profiles');
    assert.ok(s, '#profiles missing');
    assert.match(s, /<h2\b/);
    assert.match(s, /<table\b/);
    const cols = [...s.matchAll(/<th\b[^>]*scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) => strip(m[1]).trim().toLowerCase());
    for (const c of columns) assert.ok(cols.includes(c), `column ${c}`);
    const rowHeads = [...s.matchAll(/<th\b[^>]*scope="row"[^>]*>([\s\S]*?)<\/th>/g)].map((m) => strip(m[1]).trim());
    assert.deepEqual(rowHeads, rows.map((r) => r.label));
  });

  test('explicit ARIA table roles survive the stacked layout', () => {
    const s = section('profiles') ?? '';
    const n = (role) => (s.match(new RegExp(`role="${role}"`, 'g')) ?? []).length;
    assert.equal(n('table'), 1);
    assert.equal(n('row'), 7);
    assert.equal(n('columnheader'), 4);
    assert.equal(n('rowheader'), 6);
    assert.equal(n('cell'), 18);
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

  test('tree is a labelled scroll region', () => {
    const s = section('memory') ?? '';
    assert.match(s, /role="region"[^>]*aria-label="[^"]+"[^>]*tabindex="0"|tabindex="0"[^>]*role="region"/);
  });
});

describe('page', () => {
  test('sections appear in order', () => {
    const h = html();
    const at = ['workflow', 'features', 'profiles', 'memory'].map((id) => h.search(new RegExp(`<section\\b[^>]*\\bid="${id}"`)));
    assert.ok(at.every((i) => i > -1), `positions ${at}`);
    assert.deepEqual([...at].sort((a, b) => a - b), at);
  });

  test('shared content rules hold, and no cost targets appear', () => {
    const t = builtText();
    assert.deepEqual(contentViolations(t), []);
    assert.ok(!/Target cost/i.test(t));
  });
});
