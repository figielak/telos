import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { distPath, readDist, siteRoot } from './helpers.mjs';
import { builtText, contentViolations } from './shared-content.mjs';

const root = join(siteRoot, '..');
const MULTI = new Set(['adr', 'history', 'status', 'roadmap', 'task', 'ctx']);
const load = async () => (await import('../src/data/docs/commands.mjs')).commands;
const cliRecords = async () => (await load()).filter((c) => c.kind === 'cli');
const page = (slug) => ['docs', 'commands', slug, 'index.html'];
const text = (slug) => builtText(page(slug).join('/'));

/** README CLI table rows → { cmd, id } where id is the subsection id (null for a plain command). */
function readmeSignatures() {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const section = readme.slice(readme.indexOf('\n## CLI'), readme.indexOf('\n## Hooks'));
  const out = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^\| `(telos [^`]*)`/);
    if (!m) continue;
    const tokens = m[1].replace(/\\\|/g, '|').split(/\s+/).slice(1);
    const cmd = tokens[0];
    if (cmd.startsWith('-')) { out.push({ cmd: cmd === '-h' || cmd === '--help' ? 'help' : 'version', id: null }); continue; }
    const subs = [];
    if (MULTI.has(cmd)) for (const t of tokens.slice(1)) { if (/^[a-z][a-z-]*$/.test(t)) subs.push(t); else break; }
    out.push({ cmd, id: subs.length ? `${cmd}-${subs.join('-')}` : null, row: m[1] });
  }
  return out;
}

describe('CLI inventory', () => {
  test('guide commands equal the exported registry plus help and version', async () => {
    const { commands: registry } = await import('../../lib/cli.mjs');
    const expected = new Set([...Object.keys(registry), 'help', 'version']);
    const have = new Set((await cliRecords()).map((c) => c.slug.replace(/^cli-/, '')));
    const missing = [...expected].filter((n) => !have.has(n));
    const invented = [...have].filter((n) => !expected.has(n));
    assert.deepEqual(missing, [], `CLI commands without a guide entry: ${missing.join(', ')}`);
    assert.deepEqual(invented, [], `guide entries without a CLI command: ${invented.join(', ')}`);
  });

  test('every README CLI signature maps to an entry or an anchored subsection', async () => {
    const records = await cliRecords();
    const rows = readmeSignatures();
    assert.ok(rows.length >= 30, `README rows parsed: ${rows.length}`);
    const gaps = [];
    for (const { cmd, id, row } of rows) {
      const rec = records.find((c) => c.slug === `cli-${cmd}`);
      if (!rec) { gaps.push(`no entry for telos ${cmd}`); continue; }
      if (id && !(rec.subcommands ?? []).some((s) => s.id === id)) gaps.push(`no subsection ${id} (${row})`);
    }
    assert.deepEqual(gaps, []);
  });

  test('slugs are CLI prefixed, unique and distinct from skill slugs; pages, index links and anchors exist', async () => {
    const all = await load();
    const slugs = all.map((c) => c.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    const index = readDist('docs', 'index.html');
    for (const c of await cliRecords()) {
      assert.match(c.slug, /^cli-[a-z-]+$/);
      assert.ok(c.name.startsWith('telos'), `${c.slug}: terminal name, not a slash command (${c.name})`);
      assert.ok(!c.name.startsWith('/'), c.name);
      assert.ok(existsSync(distPath(...page(c.slug))), c.slug);
      assert.match(index, new RegExp(`href="/docs/commands/${c.slug}/"`), `${c.slug} index link`);
      const html = readDist(...page(c.slug));
      for (const s of c.subcommands ?? []) assert.match(html, new RegExp(`<h3\\b[^>]*\\bid="sub-${s.id}"`), `${c.slug} anchor sub-${s.id}`);
    }
  });
});

describe('CLI records', () => {
  test('each entry has syntax, entry point, profile/state context, effects label, examples, use/avoid, linked alternative and sources', async () => {
    const all = await load();
    const slugs = new Set(all.map((c) => c.slug));
    for (const c of await cliRecords()) {
      assert.ok(c.invocation.startsWith('telos'), `${c.slug} syntax`);
      assert.ok(c.profiles.length > 0, `${c.slug} profiles`);
      assert.match(c.prerequisites[0], /^Run in a terminal/, `${c.slug}: says where to enter it`);
      assert.match(c.effects[0], /^(Read-only|Runs checks|Changes project state|Prints)/, `${c.slug}: first effect classifies it`);
      assert.ok(c.examples.length >= 1, c.slug);
      for (const e of c.examples) {
        assert.ok(e.command.startsWith('telos '), `${c.slug}: example is a shell command`);
        assert.ok(e.outcome.length >= 40, `${c.slug}: outcome is concrete`);
      }
      assert.ok(c.use.length >= 2 && c.avoid.length >= 2, `${c.slug} use/avoid`);
      assert.ok(c.alternatives.length >= 1 && c.alternatives.every((a) => !a.slug || slugs.has(a.slug)), `${c.slug} alternatives`);
      assert.ok(c.alternatives.some((a) => a.slug), `${c.slug} has a linked alternative`);
      assert.ok(c.sources.length >= 2 && c.sources.every((s) => existsSync(join(root, s.path))), `${c.slug} sources exist`);
      assert.deepEqual(contentViolations(text(c.slug)), [], c.slug);
    }
  });

  test('every subsection has profile, example, outcome and applicability guidance', async () => {
    let count = 0;
    for (const c of await cliRecords()) {
      for (const s of c.subcommands ?? []) {
        count++;
        const ctx = `${c.slug}/${s.id}`;
        assert.ok(s.invocation.startsWith('telos '), `${ctx} syntax`);
        for (const re of [/^Profile: /, /^Example: telos /, /^Outcome: /, /^Use when /, /^Avoid when /]) {
          assert.ok(s.notes.some((n) => re.test(n)), `${ctx} lacks ${re}`);
        }
        assert.ok(s.notes.find((n) => /^Outcome: /.test(n)).length >= 40, `${ctx} outcome is concrete`);
      }
    }
    assert.ok(count >= 25, `subsections: ${count}`);
  });
});

describe('boundaries stated in the rendered pages', () => {
  test('a CLI page tells terminal commands from /telos:* prompts', () => {
    const t = text('cli-status');
    assert.match(t, /terminal/i);
    assert.match(t, /\/telos:status/);
    assert.match(text('cli-help'), /not a Claude Code/i);
  });

  test('ctx can refuse with exit 0; exit codes are separate from REFUSED and UNVERIFIED', () => {
    const t = text('cli-ctx');
    assert.match(t, /REFUSED/);
    assert.match(t, /exit 0/);
    assert.match(t, /UNVERIFIED/);
    assert.match(t, /read-only/i);
    const check = text('cli-check');
    assert.match(check, /UNVERIFIED/);
    assert.match(check, /exit 1/);
  });

  test('accept runs machine-checkable items, manual items stay manual', () => {
    const t = text('cli-accept');
    assert.match(t, /MANUAL/);
    assert.match(t, /not (a )?proof|never proves|does not prove/i);
    assert.match(t, /scope/i);
  });

  test('state setters do not replace skill checks, confirmations or commits', () => {
    for (const slug of ['cli-status', 'cli-task', 'cli-roadmap']) {
      const t = text(slug);
      assert.match(t, /does not (replace|run|commit)|never commits|no git/i, slug);
    }
    assert.match(text('cli-task'), /\/telos:do|\/telos:approve/);
    assert.match(text('cli-roadmap'), /\/telos:done|\/telos:approve/);
  });

  test('budget is an estimate, not measured savings', () => {
    const t = text('cli-budget');
    assert.match(t, /estimate/i);
    assert.match(t, /not (a )?(measured|host)|does not measure|proxy/i);
  });
});
