import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { TOKENS, contrast, distCss, distPath, exists, readDist, readSite } from './helpers.mjs';

const html = () => readDist('index.html');
const count = (s, re) => (s.match(re) ?? []).length;

describe('document shell', () => {
  test('index.html carries the required head and landmarks', () => {
    assert.ok(exists(distPath('index.html')), 'dist/index.html missing: run astro build');
    const h = html();
    assert.match(h, /<html[^>]*\slang="en"/);
    assert.equal(count(h, /<title>[^<]+<\/title>/g), 1);
    assert.match(h, /<meta name="description" content="[^"]{20,}"/);
    assert.match(h, /<meta name="viewport" content="width=device-width/);
    assert.match(h, /<a[^>]*href="#main"[^>]*>/);
    assert.equal(count(h, /<main\b[^>]*id="main"/g), 1);
  });
});

describe('tokens', () => {
  test('global.css defines all five colors', () => {
    const css = readSite('src', 'styles', 'global.css').toLowerCase();
    for (const v of Object.values(TOKENS)) assert.ok(css.includes(v.toLowerCase()), `missing ${v}`);
  });

  test('DESIGN.md names the same values and required sections', () => {
    const md = readSite('DESIGN.md');
    for (const v of Object.values(TOKENS)) assert.ok(md.toLowerCase().includes(v.toLowerCase()), `DESIGN.md lacks ${v}`);
    for (const s of ['Color', 'Typography', 'Spacing', 'Components']) {
      assert.match(md, new RegExp(`^##+ .*${s}`, 'm'), `section ${s}`);
    }
  });

  test('text pairs meet WCAG AA (4.5:1)', () => {
    const pairs = [
      ['text', 'bg'], ['text', 'surface'], ['muted', 'bg'], ['muted', 'surface'],
      ['accent', 'bg'], ['accent', 'surface'], ['bg', 'accent'],
    ];
    for (const [fg, bg] of pairs) {
      const r = contrast(TOKENS[fg], TOKENS[bg]);
      assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}`);
    }
  });
});

describe('fonts', () => {
  test('three families resolve to local files, with no external host', () => {
    const css = distCss();
    for (const family of ['Manrope', 'Inter', 'JetBrains Mono']) {
      assert.ok(css.includes(family), `${family} not declared`);
    }
    const files = [...css.matchAll(/url\(([^)]*\.woff2)\)/g)].map((m) => m[1].replace(/["']/g, ''));
    assert.ok(files.length >= 3, 'expected at least three woff2 urls');
    for (const f of files) {
      assert.ok(f.startsWith('/fonts/'), `font url ${f} is not local`);
      assert.ok(exists(distPath(f.slice(1))), `${f} not copied to dist`);
    }
    const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
    assert.equal(faces.length, 3, 'expected three @font-face rules');
    const display = faces.map((f) => /font-display:\s*([a-z-]+)/.exec(f)?.[1]);
        assert.ok(display.every((d) => d === 'swap'), `font-display values: ${display}`);
    assert.ok(!/https?:\/\/[^"')\s]*(fonts\.googleapis|fonts\.gstatic|fontsource|cdn)/i.test(css + html()));
  });

  test('font files total at most 250 KB', () => {
    const dir = distPath('fonts');
    const total = readdirSync(dir).filter((f) => f.endsWith('.woff2'))
      .reduce((n, f) => n + readDirSize(dir, f), 0);
    assert.ok(total <= 250 * 1024, `fonts are ${total} bytes`);
  });
});

import { statSync } from 'node:fs';
import { join } from 'node:path';
function readDirSize(dir, f) {
  return statSync(join(dir, f)).size;
}

describe('dependencies', () => {
  test('website lists exactly the three allowed packages, pinned', () => {
    const pkg = JSON.parse(readSite('package.json'));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.deepEqual(Object.keys(all).sort(), ['@tailwindcss/vite', 'astro', 'tailwindcss']);
    for (const [name, v] of Object.entries(all)) assert.match(v, /^\d+\.\d+\.\d+$/, `${name} is not pinned`);
    assert.equal(pkg.engines.node, '>=22.23.4');
  });

  test('root package.json has no dependencies', () => {
    const root = JSON.parse(readSite('..', 'package.json'));
    assert.equal(root.dependencies, undefined);
    assert.equal(root.devDependencies, undefined);
    assert.equal(root.workspaces, undefined);
  });
});

describe('base layout', () => {
  test('reduced motion and focus ring are defined', () => {
    const css = distCss();
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /:focus-visible/);
  });

  test('meander is decorative', () => {
    assert.match(readSite('src', 'components', 'Meander.astro'), /aria-hidden="true"/);
    assert.match(readSite('src', 'components', 'Meander.astro'), /currentColor/);
  });
});
