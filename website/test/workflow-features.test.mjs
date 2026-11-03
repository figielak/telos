import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readDist } from './helpers.mjs';
import { builtText, contentViolations } from './shared-content.mjs';

const html = () => readDist('index.html');
const section = (id) => html().match(new RegExp(`<section\\b[^>]*\\bid="${id}"[\\s\\S]*?</section>`))?.[0];
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');

describe('workflow section', () => {
  test('ordered list of five steps in the real order', () => {
    const s = section('workflow');
    assert.ok(s, '#workflow section missing');
    const ol = s.match(/<ol\b[\s\S]*?<\/ol>/)?.[0];
    assert.ok(ol, '<ol> missing');
    const items = [...ol.matchAll(/<li\b[\s\S]*?<\/li>/g)].map((m) => strip(m[0]));
    assert.equal(items.length, 5);
    const order = [/\/telos:plan/, /\/telos:approve/, /\/telos:do\b/, /telos accept/, /commit/i];
    order.forEach((re, i) => assert.match(items[i], re, `step ${i + 1}`));
    assert.match(items[2], /tests first/i);
  });

  test('states the auto_commit condition and that Telos does not push', () => {
    const t = strip(section('workflow') ?? '');
    assert.match(t, /git\.auto_commit/);
    assert.match(t, /does not push|never pushes/i);
    assert.match(t, /user-invoked/i);
  });

  test('has its own h2', () => {
    assert.match(section('workflow') ?? '', /<h2\b/);
  });
});

describe('features section', () => {
  test('exists with its own h2 and claims only shipped behavior', () => {
    const s = section('features');
    assert.ok(s, '#features section missing');
    assert.match(s, /<h2\b/);
    const t = strip(s);
    for (const must of ['git push', 'strict_scope', '6000', '1200', '/telos:undo', 'lint-plan']) {
      assert.ok(t.includes(must), `features lacks ${must}`);
    }
  });

  test('no equal three-column card row', () => {
    assert.ok(!/grid-cols-3/.test(html()));
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
