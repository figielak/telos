import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readDist } from './helpers.mjs';
import { builtText, contentViolations } from './shared-content.mjs';

const html = () => readDist('index.html');
const section = (id) => html().match(new RegExp(`<section\\b[^>]*\\bid="${id}"[\\s\\S]*?</section>`))?.[0];
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');

describe('workflow section', () => {
  test('ordered list of four stages in the real order, tests first in the third', () => {
    const s = section('workflow');
    assert.ok(s, '#workflow section missing');
    const ol = s.match(/<ol\b[\s\S]*?<\/ol>/)?.[0];
    assert.ok(ol, '<ol> missing');
    const items = [...ol.matchAll(/<li\b[\s\S]*?<\/li>/g)].map((m) => strip(m[0]));
    assert.equal(items.length, 4);
    const order = [/\/telos:plan/, /\/telos:approve/, /\/telos:do\b/, /telos accept/];
    order.forEach((re, i) => assert.match(items[i], re, `stage ${i + 1}`));
    assert.match(items[2], /tests first/i);
  });

  test('stage names are Plan, Approve, Implement, Verify', () => {
    const names = [...(section('workflow') ?? '').matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => strip(m[1]).trim());
    assert.deepEqual(names, ['Plan', 'Approve', 'Implement', 'Verify']);
  });

  test('Verify names the commit and git.auto_commit; the section says Telos does not push', () => {
    const s = section('workflow') ?? '';
    const verify = strip(s.match(/<li\b[\s\S]*?<\/li>/g)?.[3] ?? '');
    assert.match(verify, /commit/i);
    assert.match(verify, /git\.auto_commit/);
    const t = strip(s);
    assert.match(t, /does not push|never pushes/i);
    assert.match(t, /user-invoked/i);
  });

  test('horizontal from lg, drawn with CSS lines, no meander', () => {
    const s = section('workflow') ?? '';
    assert.match(s.match(/<ol\b[^>]*>/)?.[0] ?? '', /lg:grid-cols-4/);
    assert.ok(!/meander/i.test(s));
    assert.match(s, /\bsection-y\b/);
    assert.match(s, /\bmax-w-page\b/);
    assert.match(s, /<h2\b/);
  });
});

describe('features section', () => {
  test('h2 and exactly four h3 items', () => {
    const s = section('features');
    assert.ok(s, '#features section missing');
    assert.equal((s.match(/<h2\b/g) ?? []).length, 1);
    assert.equal((s.match(/<h3\b/g) ?? []).length, 4);
  });

  test('2 x 2 grid with unequal fractional columns', () => {
    const s = section('features') ?? '';
    const grids = [...s.matchAll(/grid-cols-\[(\d+(?:\.\d+)?)fr_(\d+(?:\.\d+)?)fr\]/g)];
    assert.ok(grids.length >= 2, 'one asymmetric grid per row');
    assert.ok(grids.every((g) => g[1] !== g[2]), 'columns must be unequal');
    assert.ok(!/grid-cols-3/.test(s));
  });

  test('keeps every claim and stays within the shared spacing', () => {
    const s = section('features') ?? '';
    const t = strip(s);
    for (const must of ['git push', '--no-verify', 'strict_scope', '6000', '1200', '/telos:undo', 'lint-plan', 'telos accept', 'tests first']) {
      assert.ok(t.includes(must), `features lacks ${must}`);
    }
    assert.ok(!/meander/i.test(s));
    assert.match(s, /\bsection-y\b/);
    assert.match(s, /\bmax-w-page\b/);
  });

  test('item titles cover control, memory, tests and commits', () => {
    const titles = [...(section('features') ?? '').matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => strip(m[1]).toLowerCase());
    for (const k of ['control', 'memory', 'tests', 'commit']) {
      assert.ok(titles.some((t) => t.includes(k)), `no item about ${k}: ${titles}`);
    }
  });
});

describe('whole page', () => {
  test('heading levels never skip', () => {
    const levels = [...html().matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    assert.equal(levels[0], 1);
    levels.forEach((l, i) => i && assert.ok(l <= levels[i - 1] + 1, `h${l} after h${levels[i - 1]}`));
  });

  test('shared content rules hold over all built text', () => {
    assert.deepEqual(contentViolations(builtText()), []);
  });

  test('the content check itself catches violations', () => {
    const bad = contentViolations('We elevate builds, 40% faster, /telos:nonexistent');
    assert.ok(bad.length >= 3, bad.join('; '));
  });
});
