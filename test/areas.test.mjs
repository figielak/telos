import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AREA_SECTIONS, areaHeader, areasFor, isAreaName, lintArea, normalizeAreaPath, parseArea, pathMatches } from '../lib/areas.mjs';
import { DEFAULTS } from '../lib/config.mjs';
import { estimateTokens } from '../lib/map-budget.mjs';
import { render } from '../lib/template.mjs';

const commit = 'abcdef0123456789'.repeat(2) + 'abcdef01';
const header = `<!-- telos-area: commit ${commit} · 2026-11-16 · paths: src/auth/, lib/x.mjs -->`;
const LIMIT = 800;
const valid = `${header}\n# auth\n\n## Purpose\nLog users in.\n\n## Entry points\n- \`src/auth/login.ts:1-20\` — login\n\n## Invariants\n\n## Decisions\n- Magic links — no passwords to store\n\n## Rejected\n\n## Pitfalls\n`;
const lint = (text, name = 'auth', limit = LIMIT) => lintArea(text, { name, limit });

test('a valid area file parses its header, title and six sections and lints clean', () => {
  const area = parseArea(valid);
  assert.deepEqual(area.header, { commit, date: '2026-11-16', paths: ['src/auth/', 'lib/x.mjs'] });
  assert.equal(area.title, 'auth');
  assert.deepEqual(area.sections, AREA_SECTIONS);
  assert.equal(area.tokens, estimateTokens(valid));
  assert.deepEqual(lint(valid), []);
  assert.deepEqual(lint(valid.replaceAll('\n', '\r\n')), []);
});

test('the template renders a valid area and areaHeader writes the same header', () => {
  const text = render('area.md', { commit, date: '2026-11-16', paths: 'src/auth/, lib/x.mjs', name: 'auth' });
  assert.ok(text.startsWith(`${header}\n`));
  assert.deepEqual(lint(text), []);
  assert.equal(areaHeader({ commit, date: '2026-11-16', paths: ['src/auth/', 'lib/x.mjs'] }), header);
  assert.throws(() => areaHeader({ commit: 'abc', date: '2026-11-16', paths: ['a/'] }), /commit/);
  assert.throws(() => areaHeader({ commit, date: '2026-11-16', paths: [] }), /paths/);
  assert.equal(DEFAULTS.limits.area_tokens, 800);
});

test('a missing, duplicate, unknown or reordered section is one problem each', () => {
  const missing = lint(valid.replace('## Rejected\n\n', ''));
  assert.deepEqual(missing, ['missing section "## Rejected"']);
  assert.deepEqual(lint(valid.replace('## Pitfalls', '## Pitfalls\n\n## Pitfalls')), ['duplicate section "## Pitfalls"']);
  assert.match(lint(valid.replace('## Invariants', '## Rules')).join('\n'), /unexpected section "## Rules"[\s\S]*missing section "## Invariants"/);
  const swapped = valid.replace('## Decisions', '## TMP').replace('## Rejected', '## Decisions').replace('## TMP', '## Rejected');
  assert.deepEqual(lint(swapped), ['sections out of order; use Purpose → Entry points → Invariants → Decisions → Rejected → Pitfalls']);
  // Headings inside comments or fences are not sections.
  assert.deepEqual(lint(valid.replace('## Rejected\n', '<!--\n## Rejected\n-->\n')), ['missing section "## Rejected"']);
  assert.deepEqual(lint(valid.replace('## Rejected\n', '```md\n## Rejected\n```\n')), ['missing section "## Rejected"']);
});

test('an over-limit area fails with its size, never truncated; the exact limit passes', () => {
  const padded = `${valid}${'x'.repeat(LIMIT * 4 - valid.length - 1)}\n`;
  assert.equal(padded.length, LIMIT * 4);
  assert.deepEqual(lint(padded), []);
  const over = lint(`${padded}x`);
  assert.equal(over.length, 1);
  assert.match(over[0], new RegExp(`^${LIMIT + 1} estimated tokens > limit ${LIMIT}; .*split`));
});

test('a malformed header is reported with its cause', () => {
  const cases = [
    ['# auth\n', /missing or malformed header/],
    [header.replace('telos-area', 'telos-map'), /missing or malformed header/],
    [header.replace(commit, 'abc1234'), /commit/],
    [header.replace('2026-11-16', '2026-02-30'), /date/],
    [header.replace('src/auth/, lib/x.mjs', ''), /no paths/],
    [header.replace('lib/x.mjs', '../x.mjs'), /invalid path "\.\.\/x\.mjs"/],
    [header.replace('lib/x.mjs', '/etc/x'), /invalid path/],
    [header.replace('lib/x.mjs', 'src/*.ts'), /invalid path/],
    [header.replace('lib/x.mjs', './lib/x.mjs'), /invalid path/],
    [header.replace('lib/x.mjs', 'src/auth'), /duplicate path/],
  ];
  for (const [line, message] of cases) {
    const text = line.startsWith('#') ? valid.replace(`${header}\n`, line) : valid.replace(header, line);
    const problems = lint(text);
    assert.ok(problems.length >= 1, line);
    assert.match(problems.join('\n'), message, line);
    assert.equal(parseArea(text).header, null, line);
  }
});

test('names and titles follow the naming rule', () => {
  for (const name of ['auth', 'hooks-guards', 'a1', 'x'.repeat(30)]) assert.ok(isAreaName(name), name);
  for (const name of ['', 'Auth', 'a_b', 'a/b', '-a', 'x'.repeat(31), 'ą']) assert.ok(!isAreaName(name), name);
  assert.match(lint(valid, 'Auth').join('\n'), /invalid area name "Auth"/);
  assert.deepEqual(lint(valid, 'login'), ['title must be "# login", found "# auth"']);
  assert.deepEqual(lint(valid.replace('# auth\n', '')), ['title must be "# auth"']);
});

test('path matching uses the / boundary: src/a never matches src/ab/', () => {
  assert.ok(pathMatches('src/a', 'src/a'));
  assert.ok(pathMatches('src/a/x.ts', 'src/a'));
  assert.ok(pathMatches('src/a/x.ts', 'src/a/'));
  assert.ok(pathMatches('src/a/deep/x.ts', 'src/a/'));
  assert.ok(!pathMatches('src/ab/x.ts', 'src/a'));
  assert.ok(!pathMatches('src/ab/x.ts', 'src/a/'));
  assert.ok(!pathMatches('src/ab', 'src/a'));
  assert.ok(!pathMatches('src', 'src/a/'));
  assert.ok(pathMatches('lib/x.mjs', 'lib/x.mjs'));
  assert.ok(!pathMatches('lib/x.mjs.bak', 'lib/x.mjs'));
  const areas = [
    { name: 'a', header: { paths: ['src/a/'] } },
    { name: 'ab', header: { paths: ['src/ab/'] } },
    { name: 'broken', header: null },
  ];
  assert.deepEqual(areasFor(areas, ['src/ab/x.ts']), ['ab']);
  assert.deepEqual(areasFor(areas, ['src/a/x.ts', 'src/ab/y.ts']), ['a', 'ab']);
  assert.deepEqual(areasFor(areas, ['src/abc.ts']), []);
});

test('normalizeAreaPath keeps directories and rejects unsafe paths', () => {
  assert.equal(normalizeAreaPath(' src/a/ '), 'src/a/');
  assert.equal(normalizeAreaPath('./src//a'), 'src/a');
  for (const raw of ['', '.', './', '..', '../a', '/abs', 'a\\b', 'C:/a', 'a,b', 'src/*', 'a\nb', undefined]) {
    assert.equal(normalizeAreaPath(raw), null, String(raw));
  }
});
