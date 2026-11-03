import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { distCss, readDist, readSite, siteRoot } from './helpers.mjs';
import { lines } from '../src/data/terminal.mjs';

const html = () => readDist('index.html');
const GITHUB = 'https://github.com/figielak/telos';
const text = () => lines.map((l) => l.t).join('\n');
const strip = (x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const hero = () => {
  const h = html();
  return h.slice(h.indexOf('<main'), h.search(/<section\b[^>]*\bid="workflow"/));
};
/** Last max-w-[<n>rem|px] utility in a class string or markup, in px. */
const maxWidthPx = (x) => {
  const all = [...x.matchAll(/max-w-\[(\d+(?:\.\d+)?)(rem|px)\]/g)];
  const m = all.at(-1);
  return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : 0;
};

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

  test('eyebrow, description and both CTA labels are exactly as specified', () => {
    const t = strip(hero());
    assert.ok(t.includes('PURPOSE-BUILT FOR CLAUDE CODE'));
    assert.ok(t.includes('Plan, approve, implement, verify. A lightweight workflow that keeps you in control.'));
    assert.ok(/>\s*Get started\s*</.test(hero()));
    assert.ok(/>\s*View on GitHub\s*</.test(hero()));
  });

  test('the pre-alpha status stays visible in the hero, after the CTAs', () => {
    const h = hero();
    assert.ok(h.includes('Pre-alpha'));
    assert.ok(h.indexOf('Pre-alpha') > h.indexOf('View on GitHub'));
    assert.ok(html().indexOf('Pre-alpha') < html().search(/<section\b[^>]*\bid="workflow"/));
  });

  test('centered stack: no two-column grid, no meander, no full-height hero', () => {
    const h = hero();
    assert.match(h, /text-center/);
    assert.ok(!/grid-cols-/.test(h), 'hero must not be a grid');
    assert.ok(!/meander/i.test(h));
    assert.ok(!/min-h-\[100dvh\]/.test(h));
    assert.match(h, /section-y/);
  });

  test('description is 600 to 680 px wide', () => {
    const p = hero().match(/<p\b[^>]*class="([^"]*)"[^>]*>\s*Plan, approve, implement, verify\./)?.[1];
    assert.ok(p, 'description paragraph not found');
    const px = maxWidthPx(p);
    assert.ok(px >= 600 && px <= 680, `description max width ${px}px`);
  });

  test('terminal wrapper is 900 to 1000 px wide and follows the CTAs', () => {
    const h = hero();
    const at = h.indexOf('<figure');
    assert.ok(at > h.indexOf('View on GitHub'), 'terminal must come after the CTAs');
    const px = maxWidthPx(h.slice(Math.max(0, at - 400), at));
    assert.ok(px >= 900 && px <= 1000, `terminal wrapper max width ${px}px`);
  });
});

describe('navigation', () => {
  test('primary nav lists the five anchors in order, memory before profiles', () => {
    const nav = html().match(/<nav\b[^>]*aria-label="[^"]+"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, 'labelled <nav> missing');
    const order = ['workflow', 'features', 'memory', 'profiles', 'getting-started'].map((id) => nav.indexOf(`href="#${id}"`));
    assert.ok(order.every((i) => i > -1), `anchors ${order}`);
    assert.deepEqual([...order].sort((x, y) => x - y), order);
  });

  test('the header has a GitHub link outside the small-screen menu', () => {
    const header = html().match(/<header\b[\s\S]*?<\/header>/)?.[0];
    assert.ok(header, '<header> missing');
    assert.ok(html().indexOf('<header') < html().indexOf('<main'));
    const outside = header.replace(/<details\b[\s\S]*?<\/details>/, '');
    assert.ok(outside.includes(`href="${GITHUB}"`), 'GitHub link outside <details>');
    assert.match(header, /<details\b[\s\S]*<summary\b/);
    assert.ok(!/<script\b[^>]*\bsrc=/.test(html()), 'no external script expected');
  });

  test('the monogram is decorative', () => {
    assert.match(readSite('src', 'components', 'Monogram.astro'), /aria-hidden="true"/);
    assert.match(readSite('src', 'components', 'Monogram.astro'), /currentColor/);
    assert.match(readSite('public', 'favicon.svg'), /<circle\b/);
  });
});

describe('layout tokens', () => {
  test('global.css defines the page width and the section spacing', () => {
    const css = readSite('src', 'styles', 'global.css');
    assert.match(css, /--container-page:\s*75rem/);
    assert.match(css, /@utility section-y/);
    assert.match(css, /2\.5rem/);
    assert.match(css, /4\.25rem/);
  });

  test('DESIGN.md names the 1200 px width and both section spacings, and drops the asymmetry rule', () => {
    const md = readSite('DESIGN.md');
    const rules = md.slice(md.indexOf('## Layout rules'), md.indexOf('## Components'));
    assert.match(rules, /1200 px/);
    assert.match(rules, /80 px/);
    assert.match(rules, /136 px/);
    assert.ok(!/Asymmetric from/i.test(rules));
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
  });

  test('reveal is CSS only and reduced motion is respected', () => {
    const css = distCss();
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /@keyframes/);
  });
});
