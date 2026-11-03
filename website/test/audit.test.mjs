import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { distCss, distPath, readDist, siteRoot } from './helpers.mjs';

const html = () => readDist('index.html');
const REPO = 'https://github.com/figielak/telos';
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tags = (name) => [...html().matchAll(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?</${name}>`, 'g'))].map((m) => m[0]);

describe('structure', () => {
  test('one h1, heading levels never skip, one title, lang and description', () => {
    const h = html();
    const levels = [...h.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    assert.equal(levels.filter((l) => l === 1).length, 1);
    assert.equal(levels[0], 1);
    levels.forEach((l, i) => i && assert.ok(l <= levels[i - 1] + 1, `h${l} after h${levels[i - 1]}`));
    assert.equal((h.match(/<title>/g) ?? []).length, 1);
    assert.match(h, /<html[^>]*\blang="en"/);
    assert.match(h, /<meta name="description" content="[^"]{40,}"/);
  });

  test('landmarks: header, nav, main and footer, each once or labelled', () => {
    const h = html();
    for (const l of ['header', 'main', 'footer']) assert.equal((h.match(new RegExp(`<${l}\\b`, 'g')) ?? []).length, 1, l);
    const navs = [...h.matchAll(/<nav\b[^>]*>/g)].map((m) => m[0]);
    assert.ok(navs.length >= 2);
    for (const n of navs) assert.match(n, /aria-label="[^"]+"/, 'every nav is labelled');
    assert.equal(new Set(navs.map((n) => n.match(/aria-label="([^"]+)"/)[1])).size, navs.length, 'nav labels are distinct');
  });

  test('sections appear in order: hero, workflow, features, memory, profiles, getting-started, final-cta', () => {
    const main = html().match(/<main\b[\s\S]*?<\/main>/)[0];
    const ids = [...main.matchAll(/<section\b([^>]*)>/g)].map((m) => m[1].match(/\bid="([^"]+)"/)?.[1] ?? 'hero');
    assert.deepEqual(ids, ['hero', 'workflow', 'features', 'memory', 'profiles', 'getting-started', 'final-cta']);
  });

  test('ids are unique and every anchor resolves', () => {
    const h = html();
    const ids = [...h.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const a of new Set([...h.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))) assert.ok(ids.includes(a), `#${a}`);
  });
});

describe('accessible names', () => {
  test('every svg is hidden or named', () => {
    for (const svg of html().matchAll(/<svg\b[^>]*>/g)) {
      assert.ok(/aria-hidden="true"/.test(svg[0]) || /role="img"[^>]*aria-label=/.test(svg[0]), svg[0]);
    }
  });

  test('every link and button has a name', () => {
    for (const el of [...tags('a'), ...tags('button')]) {
      const open = el.match(/^<[^>]+>/)[0];
      const named = /aria-label="[^"]+"/.test(open) || strip(el.replace(/<svg\b[\s\S]*?<\/svg>/g, '')).length > 0;
      assert.ok(named, `unnamed: ${open}`);
    }
  });

  test('no generic link text', () => {
    for (const a of tags('a')) assert.ok(!/^(click here|here|more|link)$/i.test(strip(a)), strip(a));
  });

  test('scroll regions are focusable and labelled; the menu has a summary', () => {
    const regions = [...html().matchAll(/<div\b[^>]*role="region"[^>]*>/g)].map((m) => m[0]);
    assert.ok(regions.length >= 2, 'hero terminal and memory tree');
    for (const r of regions) {
      assert.match(r, /tabindex="0"/);
      assert.match(r, /aria-label="[^"]+"/);
    }
    assert.match(html(), /<details\b[\s\S]*?<summary\b/);
  });

  test('buttons have an explicit type', () => {
    for (const b of html().matchAll(/<button\b[^>]*>/g)) assert.match(b[0], /\btype="button"/);
  });
});

describe('budgets and hosts', () => {
  const inlineJs = () => [...html().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].reduce((n, m) => n + Buffer.byteLength(m[1]), 0);
  const total = (dir, ext) => readdirSync(dir).filter((f) => f.endsWith(ext)).reduce((n, f) => n + statSync(join(dir, f)).size, 0);

  test('client JavaScript is at most 2 KB and nothing ships as a separate script', () => {
    assert.ok(inlineJs() <= 2048, `${inlineJs()} bytes`);
    assert.ok(!/<script\b[^>]*\bsrc=/.test(html()));
    assert.deepEqual(readdirSync(distPath('_astro')).filter((f) => f.endsWith('.js')), []);
  });

  test('CSS is at most 40 KB and fonts at most 250 KB', () => {
    assert.ok(Buffer.byteLength(distCss()) <= 40 * 1024, `${Buffer.byteLength(distCss())} bytes of CSS`);
    assert.ok(total(distPath('fonts'), '.woff2') <= 250 * 1024);
  });

  test('no images, no external script, stylesheet or font host', () => {
    const h = html();
    assert.ok(!/<img\b|<picture\b|<video\b|<iframe\b/.test(h));
    for (const l of h.matchAll(/<link\b[^>]*>/g)) assert.ok(!/href="https?:/.test(l[0]), l[0]);
    assert.ok(!/@import\s+url\(|url\(["']?https?:/.test(distCss()));
  });

  test('only the first-view font is preloaded', () => {
    const pre = [...html().matchAll(/<link\b[^>]*rel="preload"[^>]*>/g)];
    assert.ok(pre.length <= 1);
  });
});

describe('links', () => {
  test('every external link targets the Telos repository', () => {
    const hrefs = [...html().matchAll(/<a\b[^>]*\bhref="(https?:[^"]+)"/g)].map((m) => m[1]);
    assert.ok(hrefs.length >= 5);
    for (const h of hrefs) assert.ok(h === REPO || h.startsWith(`${REPO}#`) || h.startsWith(`${REPO}/`), h);
  });

  test('external links open in the same tab, so no rel noopener risk', () => {
    assert.ok(!/target="_blank"/.test(html()));
  });
});

describe('truthfulness', () => {
  const readme = () => readFileSync(join(siteRoot, '..', 'README.md'), 'utf8');

  test('"the README documents every command" holds: each skill has a README row', () => {
    assert.match(html().replace(/<[^>]+>/g, ' '), /README documents every command/);
    const skills = readdirSync(join(siteRoot, '..', 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory());
    assert.ok(skills.length >= 20);
    for (const d of skills) assert.match(readme(), new RegExp(`\`/telos:${d.name}[ \`\\]\\[]`), `README lacks /telos:${d.name}`);
  });

  test('the only recommendation is Standard, and the README install example uses it', () => {
    const profiles = html().match(/<section\b[^>]*\bid="profiles"[\s\S]*?<\/section>/)[0];
    const cards = [...profiles.matchAll(/<article\b[\s\S]*?<\/article>/g)].map((m) => m[0]);
    const flagged = cards.filter((c) => /Recommended/.test(c));
    assert.equal(flagged.length, 1);
    assert.match(flagged[0], /<h3\b[^>]*>\s*standard\s*<\/h3>/i);
    assert.ok(readme().includes('/telos:init standard'));
  });

  test('inline scripts: at most two, copy buttons and mobile menu only', () => {
    const scripts = [...html().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(scripts.length <= 2, `${scripts.length} scripts`);
    for (const code of scripts) {
      assert.ok(/clipboard/.test(code) || /mobile-menu/.test(code), 'unexpected script');
      assert.ok(!/fetch\(|XMLHttpRequest|localStorage|document\.cookie|eval\(/.test(code));
    }
  });
});
