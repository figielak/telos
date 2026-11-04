import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { distCss, distPath, readDist, siteRoot } from './helpers.mjs';

const REPO = 'https://github.com/figielak/telos';
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const index = () => readDist('docs', 'index.html');
const detail = (slug = 'skill-status') => readDist('docs', 'commands', slug, 'index.html');
const loadCommands = () => import('../src/data/docs/commands.mjs');

describe('record contract', () => {
  test('slugs are unique, kind-prefixed and URL safe; every record has the required fields', async () => {
    const { commands } = await loadCommands();
    assert.ok(commands.length >= 1);
    assert.equal(new Set(commands.map((c) => c.slug)).size, commands.length);
    for (const c of commands) {
      assert.match(c.slug, /^(skill|cli)-[a-z0-9]+(-[a-z0-9]+)*$/, c.slug);
      assert.ok(c.slug.startsWith(`${c.kind}-`), `${c.slug} must start with its kind`);
      for (const f of ['name', 'invocation', 'summary', 'profiles']) assert.equal(typeof c[f], 'string', `${c.slug}.${f}`);
      for (const f of ['prerequisites', 'explanation', 'effects', 'examples', 'use', 'avoid', 'alternatives', 'sources']) {
        assert.ok(Array.isArray(c[f]) && c[f].length > 0, `${c.slug}.${f}`);
      }
      for (const e of c.examples) {
        assert.ok(e.title && e.command && e.outcome, `${c.slug} example needs title, command and outcome`);
      }
      for (const s of c.sources) assert.match(s.path, /^[A-Za-z0-9._/-]+$/, s.path);
    }
  });

  test('alternatives that name a slug point to an existing record, and the sources exist in the repository', async () => {
    const { commands } = await loadCommands();
    const slugs = new Set(commands.map((c) => c.slug));
    for (const c of commands) {
      for (const a of c.alternatives) {
        assert.ok(a.note, `${c.slug} alternative needs a note`);
        if (a.slug) assert.ok(slugs.has(a.slug), `${c.slug} -> ${a.slug}`);
      }
      for (const s of c.sources) assert.ok(existsSync(join(siteRoot, '..', s.path)), `${c.slug}: ${s.path}`);
    }
  });

  test('the first entry is /telos:status, documented as a skill', async () => {
    const { commands } = await loadCommands();
    const status = commands.find((c) => c.slug === 'skill-status');
    assert.ok(status);
    assert.equal(status.kind, 'skill');
    assert.equal(status.invocation, '/telos:status');
  });
});

describe('built guide pages', () => {
  test('the index lists every record and links to its detail page', async () => {
    const { commands } = await loadCommands();
    const h = index();
    for (const c of commands) {
      assert.match(h, new RegExp(`href="/docs/commands/${c.slug}/"`), c.slug);
      assert.ok(existsSync(distPath('docs', 'commands', c.slug, 'index.html')), c.slug);
    }
    assert.equal((h.match(/<h1\b/g) ?? []).length, 1);
    assert.match(h, /<title>[^<]{5,}<\/title>/);
    assert.match(h, /<meta name="description" content="[^"]{40,}"/);
  });

  test('the status page renders every required content field', async () => {
    const { commands } = await loadCommands();
    const c = commands.find((x) => x.slug === 'skill-status');
    const h = detail();
    const text = strip(h);
    assert.equal((h.match(/<h1\b/g) ?? []).length, 1);
    assert.match(h, /<h1\b[^>]*>[\s\S]*\/telos:status[\s\S]*<\/h1>/);
    assert.match(h, /<title>[^<]*\/telos:status[^<]*<\/title>/);
    assert.match(h, /<meta name="description" content="[^"]{40,}"/);
    for (const section of ['what-it-does', 'effects', 'examples', 'when-to-use', 'when-to-avoid', 'alternatives', 'sources']) {
      assert.match(h, new RegExp(`<h2\\b[^>]*\\bid="${section}"`), `section ${section}`);
    }
    assert.ok(text.includes(c.profiles), 'profiles');
    for (const p of c.prerequisites) assert.ok(text.includes(p), p);
    for (const e of c.effects) assert.ok(text.includes(e), e);
    for (const e of c.examples) assert.ok(text.includes(e.outcome), e.outcome);
    for (const u of [...c.use, ...c.avoid]) assert.ok(text.includes(u), u);
    for (const s of c.sources) assert.ok(h.includes(`href="${REPO}/blob/HEAD/${s.path}"`), s.path);
  });

  test('ids are unique, in-page anchors resolve, headings never skip a level', () => {
    for (const h of [index(), detail()]) {
      const ids = [...h.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
      for (const a of new Set([...h.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))) assert.ok(ids.includes(a), `#${a}`);
      const levels = [...h.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
      assert.equal(levels[0], 1);
      levels.forEach((l, i) => i && assert.ok(l <= levels[i - 1] + 1, `h${l} after h${levels[i - 1]}`));
    }
  });

  test('landmarks: skip link, one header, main and footer, distinct labelled navs', () => {
    for (const h of [index(), detail()]) {
      assert.match(h, /<a\b[^>]*href="#main"[^>]*>\s*Skip to content/);
      for (const l of ['header', 'main', 'footer']) assert.equal((h.match(new RegExp(`<${l}\\b`, 'g')) ?? []).length, 1, l);
      const labels = [...h.matchAll(/<nav\b[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(labels.length, (h.match(/<nav\b/g) ?? []).length, 'every nav is labelled');
      assert.equal(new Set(labels).size, labels.length, 'nav labels are distinct');
    }
  });

  test('example commands are escaped text inside focusable, labelled scroll regions', async () => {
    const { commands } = await loadCommands();
    const c = commands.find((x) => x.slug === 'skill-status');
    const h = detail();
    const regions = [...h.matchAll(/<div\b[^>]*role="region"[^>]*>/g)].map((m) => m[0]);
    assert.ok(regions.length >= c.examples.length);
    for (const r of regions) {
      assert.match(r, /tabindex="0"/);
      assert.match(r, /aria-label="[^"]+"/);
    }
    assert.ok(!/<script\b[^>]*>[\s\S]*?<\/script>/.test(h.replace(/<script\b[^>]*>[\s\S]*?mobile-menu[\s\S]*?<\/script>/, '')), 'only the menu script');
    const raw = '<img src=x onerror=alert(1)>';
    assert.ok(!h.includes(raw));
  });

  test('guide content is static HTML: no client script beyond the menu, no external hosts', () => {
    for (const h of [index(), detail()]) {
      const scripts = [...h.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
      assert.ok(scripts.length <= 1);
      for (const code of scripts) assert.ok(/mobile-menu/.test(code) && Buffer.byteLength(code) <= 2048);
      assert.ok(!/<script\b[^>]*\bsrc=/.test(h));
      assert.ok(!/<img\b|<picture\b|<video\b|<iframe\b/.test(h));
      for (const l of h.matchAll(/<link\b[^>]*>/g)) assert.ok(!/href="https?:/.test(l[0]), l[0]);
      for (const a of h.matchAll(/<a\b[^>]*\bhref="(https?:[^"]+)"/g)) {
        assert.ok(a[1] === REPO || a[1].startsWith(`${REPO}/`) || a[1].startsWith(`${REPO}#`), a[1]);
      }
    }
  });

  test('CSS stays within 40 KB and fonts within 250 KB', () => {
    assert.ok(Buffer.byteLength(distCss()) <= 40 * 1024, `${Buffer.byteLength(distCss())} bytes of CSS`);
    const dir = distPath('fonts');
    const total = readdirSync(dir).filter((f) => f.endsWith('.woff2')).reduce((n, f) => n + statSync(join(dir, f)).size, 0);
    assert.ok(total <= 250 * 1024);
  });
});

describe('navigation to the guide', () => {
  test('the landing page links the guide from the header (both menus) and the footer', () => {
    const h = readDist('index.html');
    const navs = [...h.matchAll(/<nav\b[^>]*>[\s\S]*?<\/nav>/g)].map((m) => m[0]);
    const withGuide = navs.filter((n) => /href="\/docs\/"/.test(n));
    assert.ok(withGuide.length >= 3, `guide link in ${withGuide.length} navs (desktop, mobile, footer)`);
  });

  test('guide pages link the landing sections as /#section and never as bare in-page anchors', () => {
    for (const h of [index(), detail()]) {
      const header = h.match(/<header\b[\s\S]*?<\/header>/)[0];
      for (const id of ['workflow', 'features', 'memory', 'profiles', 'getting-started']) {
        assert.match(header, new RegExp(`href="/#${id}"`), id);
        assert.ok(!new RegExp(`href="#${id}"`).test(header), `bare #${id} in guide header`);
      }
      assert.match(header, /href="\/docs\/"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/docs\/"/);
    }
  });

  test('the landing page keeps its own same-page anchors', () => {
    const header = readDist('index.html').match(/<header\b[\s\S]*?<\/header>/)[0];
    for (const id of ['workflow', 'features', 'memory', 'profiles', 'getting-started']) {
      assert.match(header, new RegExp(`href="#${id}"`), id);
    }
  });

  test('the status page is reachable from the index, which is reachable from the landing page', () => {
    assert.match(readDist('index.html'), /href="\/docs\/"/);
    assert.match(index(), /href="\/docs\/commands\/skill-status\/"/);
    assert.match(detail(), /href="\/docs\/"/);
  });
});
