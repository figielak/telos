import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readDist, read, siteRoot } from './helpers.mjs';
import { builtText, contentViolations } from './shared-content.mjs';

const html = () => readDist('index.html');
const section = (id) => html().match(new RegExp(`<section\\b[^>]*\\bid="${id}"[\\s\\S]*?</section>`))?.[0];
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const COMMANDS = ['/plugin marketplace add figielak/telos', '/plugin install telos@telos', '/telos:init standard'];
const REPO = 'https://github.com/figielak/telos';

describe('getting started section', () => {
  test('holds the three install commands verbatim and the three requirements', () => {
    const s = section('getting-started');
    assert.ok(s, '#getting-started missing');
    assert.match(s, /<h2\b/);
    const t = strip(s);
    for (const c of COMMANDS) assert.ok(t.includes(c), `missing ${c}`);
    assert.match(t, /Claude Code with plugin support/);
    assert.match(t, /\bGit\b/);
    assert.match(t, /Node\.js ≥ 20\.10/);
  });

  test('the install commands also appear in the root README', () => {
    const readme = read(join(siteRoot, '..', 'README.md'));
    for (const c of COMMANDS) assert.ok(readme.includes(c), `README lacks ${c}`);
  });

  test('first steps name plan, approve, do, and map for existing repositories', () => {
    const t = strip(section('getting-started') ?? '');
    for (const c of ['/telos:plan Add a greeting helper with tests', '/telos:approve', '/telos:do', '/telos:map']) assert.ok(t.includes(c), c);
  });

  test('commands are selectable text in <code>', () => {
    const s = section('getting-started') ?? '';
    for (const c of COMMANDS) assert.ok(new RegExp(`<code\\b[^>]*>${c.replace(/[/.]/g, '\\$&')}</code>`).test(s), c);
  });
});

describe('install block', () => {
  const block = () => html().match(/<figure\b[^>]*data-install-block[\s\S]*?<\/figure>/)?.[0];

  test('all three commands, all three copy buttons and the status sit in one block', () => {
    const b = block();
    assert.ok(b, 'install block (figure data-install-block) missing');
    for (const c of COMMANDS) assert.ok(strip(b).includes(c), `block lacks ${c}`);
    assert.equal((b.match(/<button\b/g) ?? []).length, 3);
    assert.equal((b.match(/aria-live="/g) ?? []).length, 1);
    assert.match(b, /id="copy-status"/);
  });

  test('requirements and the next steps are outside the block', () => {
    const outside = strip((section('getting-started') ?? '').replace(block() ?? '', ''));
    assert.match(outside, /Node\.js ≥ 20\.10/);
    assert.match(outside, /\/telos:plan/);
    assert.ok(!/\/plugin install/.test(outside), 'install commands only in the block');
  });

  test('section uses the shared width and spacing', () => {
    const s = section('getting-started') ?? '';
    assert.match(s, /\bsection-y\b/);
    assert.match(s, /\bmax-w-page\b/);
    assert.ok(!/meander/i.test(s));
  });
});

describe('final CTA', () => {
  const cta = () => section('final-cta');

  test('follows getting started, comes before the footer, has an h2', () => {
    const h = html();
    assert.ok(cta(), '#final-cta missing');
    assert.match(cta(), /<h2\b/);
    assert.ok(h.search(/<section\b[^>]*\bid="getting-started"/) < h.search(/<section\b[^>]*\bid="final-cta"/));
    assert.ok(h.search(/<section\b[^>]*\bid="final-cta"/) < h.indexOf('<footer'));
  });

  test('links to the repository and the README, and promises nothing', () => {
    const c = cta() ?? '';
    assert.ok(c.includes(`href="${REPO}"`));
    assert.match(c, /href="[^"]*#readme"/);
    assert.ok(!/guarantee|always|never fail|best|fastest/i.test(strip(c)));
    assert.match(c, /\bsection-y\b/);
    assert.match(c, /\bmax-w-page\b/);
  });
});

describe('copy buttons', () => {
  test('one named button per command, hidden until the script enables them', () => {
    const s = section('getting-started') ?? '';
    const buttons = [...s.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    assert.equal(buttons.length, 3);
    buttons.forEach((b, i) => {
      assert.match(b, /\bhidden\b/, 'hidden without JavaScript');
      assert.match(b, /aria-label="Copy [^"]+"/);
      assert.ok(b.includes(`data-copy="${COMMANDS[i]}"`), `data-copy ${i}`);
    });
  });

  test('exactly one aria-live status element', () => {
    assert.equal((html().match(/aria-live="/g) ?? []).length, 1);
  });

  test('small inline scripts within the combined budget, with copy feedback', () => {
    const scripts = [...html().matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 2);
    assert.ok(scripts.every((s) => !/\bsrc=/.test(s[1])), 'scripts must be inline');
    assert.ok(Buffer.byteLength(scripts.map((s) => s[2]).join('')) <= 2048);
    const code = scripts.find((s) => s[2].includes('navigator.clipboard'))[2];
    assert.ok(Buffer.byteLength(code) <= 2048, `script is ${Buffer.byteLength(code)} bytes`);
    assert.match(code, /navigator\.clipboard/);
    assert.match(code, /Copied/);
    assert.match(code, /Copy failed/);
    assert.match(code, /catch/);
  });

  test('press feedback uses transform only', () => {
    const s = section('getting-started') ?? '';
    assert.match(s, /active:translate-y-px/);
  });
});

describe('footer', () => {
  const footer = () => html().match(/<footer\b[\s\S]*?<\/footer>/)?.[0];

  test('links to the repository, README and SPEC, with status and licence text', () => {
    const f = footer();
    assert.ok(f, '<footer> missing');
    assert.ok(f.includes(`href="${REPO}"`));
    assert.match(f, /href="[^"]*#readme"/);
    assert.match(f, /href="[^"]*SPEC\.md"/);
    const t = strip(f);
    assert.match(t, /pre-alpha/i);
    assert.match(t, /MIT/);
  });

  test('uses the monogram', () => {
    assert.match(footer() ?? '', /<circle\b/);
  });

  test('does not link a LICENSE file', () => {
    assert.ok(!/href="[^"]*LICENSE/i.test(footer() ?? ''));
  });

  test('footer follows main', () => {
    const h = html();
    assert.ok(h.indexOf('</main>') < h.indexOf('<footer'));
  });
});

describe('page', () => {
  test('every #anchor resolves to an id', () => {
    const h = html();
    const ids = new Set([...h.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const anchors = [...new Set([...h.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))];
    assert.ok(anchors.length >= 6);
    for (const a of anchors) assert.ok(ids.has(a), `#${a} has no target`);
  });

  test('ids are unique', () => {
    const ids = [...html().matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, ids.join(','));
  });

  test('shared content rules hold over the whole page', () => {
    assert.deepEqual(contentViolations(builtText()), []);
  });
});
