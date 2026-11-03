import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { distCss, readDist, siteRoot } from './helpers.mjs';
import { lines } from '../src/data/terminal.mjs';

const html = () => readDist('index.html');
const GITHUB = 'https://github.com/figielak/telos';
const text = () => lines.map((l) => l.t).join('\n');

describe('headline and calls to action', () => {
  test('exactly one h1 with the exact text', () => {
    const h1 = html().match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) ?? [];
    assert.equal(h1.length, 1);
    assert.match(h1[0].replace(/<[^>]+>/g, '').trim(), /^From intent to completion\.$/);
  });

  test('primary CTA goes to #getting-started and secondary to GitHub', () => {
    const h = html();
    assert.match(h, /<a[^>]*href="#getting-started"[^>]*class="[^"]*bg-accent/);
    assert.match(h, new RegExp(`<a[^>]*href="${GITHUB}"[^>]*>\\s*View on GitHub`));
  });

  test('pre-alpha status is shown near the headline', () => {
    const h = html();
    assert.ok(h.indexOf('pre-alpha') > -1 && h.indexOf('pre-alpha') < h.indexOf('<h1'));
  });
});

describe('navigation', () => {
  test('nav is labelled and holds the five anchors and the GitHub link', () => {
    const nav = html().match(/<nav\b[^>]*aria-label="[^"]+"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, 'labelled <nav> missing');
    for (const id of ['workflow', 'features', 'profiles', 'memory', 'getting-started']) {
      assert.ok(nav.includes(`href="#${id}"`), `nav lacks #${id}`);
    }
    assert.ok(nav.includes(`href="${GITHUB}"`));
  });

  test('nav sits in a <header> before <main>, with a details disclosure for small screens', () => {
    const h = html();
    const header = h.match(/<header\b[\s\S]*?<\/header>/)?.[0];
    assert.ok(header, '<header> missing');
    assert.ok(h.indexOf('<header') < h.indexOf('<main'));
    assert.match(header, /<details\b[\s\S]*<summary\b/);
    assert.ok(!/<script\b/.test(h), 'no client script expected');
  });
});

describe('terminal transcript data', () => {
  test('every /telos:* command has a skills/ directory', () => {
    const names = [...text().matchAll(/\/telos:([a-z-]+)/g)].map((m) => m[1]);
    assert.ok(names.length >= 3);
    for (const n of new Set(names)) {
      assert.ok(existsSync(join(siteRoot, '..', 'skills', n)), `skills/${n} missing`);
    }
  });

  test('transcript follows the real accept and commit shapes with one task id', () => {
    const t = text();
    assert.match(t, /^SCOPE {2}ok \(\d+ files?\)$/m);
    const accept = /^accept (\d{2}-\d{2}): PASS$/m.exec(t);
    assert.ok(accept, 'accept line missing');
    assert.match(t, new RegExp(`^(feat|fix|refactor|test)\\(${accept[1]}\\): .+$`, 'm'));
    assert.match(t, /^PASS {3}`[^`]+` → exit 0$/m);
    assert.match(t, /^Next: \/telos:approve or \/telos:revise <notes>$/m);
  });

  test('transcript carries no figures or comparisons', () => {
    assert.ok(!/\d\s?%|×|faster|cheaper|saves?\b|tokens?\b/i.test(text()));
  });
});

describe('terminal markup', () => {
  test('figure with illustrative caption, labelled scroll region and pre', () => {
    const fig = html().match(/<figure\b[\s\S]*?<\/figure>/)?.[0];
    assert.ok(fig, '<figure> missing');
    assert.match(fig, /<figcaption\b[^>]*>[\s\S]*Illustrative/);
    assert.match(fig, /<div[^>]*role="region"[^>]*aria-label="[^"]+"[^>]*tabindex="0"|<div[^>]*tabindex="0"[^>]*role="region"[^>]*aria-label="[^"]+"/);
    assert.match(fig, /<pre\b/);
    assert.ok(fig.includes('/telos:plan'));
  });

  test('page has no images and no h-screen', () => {
    const h = html();
    assert.ok(!/<img\b/.test(h));
    assert.ok(!/\bh-screen\b/.test(h + distCss()));
    assert.match(h, /min-h-\[100dvh\]/);
  });

  test('reveal is CSS only and reduced motion is respected', () => {
    const css = distCss();
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /@keyframes/);
  });
});
