import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inspectMap, mapHeader } from '../lib/map.mjs';
import { estimateTokens } from '../lib/map-budget.mjs';
import { render } from '../lib/template.mjs';

const commit = '0123456789abcdef'.repeat(2) + '01234567';
const metadata = { commit, date: '2026-10-26', files: 42 };
const header = `<!-- telos-map: commit ${commit} · 2026-10-26 · files 42 -->`;
const inspect = (text, limit = 1500) => inspectMap(text, { limit });
const skeleton = `${header}\n# Map\n\n## Structure\n\n## Entry points\n\n## Flows\n\n## Areas\n\n## Find\n`;
const built = `${header}\n# Map\n<!-- keep this comment exactly -->\n\n## Structure\n- \`src/\` — application\n\n## Entry points\n- \`./src/main.ts:1-12\` — boot\n\n## Flows\n- UI → \`src/auth/login.ts:20-35\`\n\n## Areas\n<!-- area preface -->\n\n### Auth\n- \`src/auth/login.ts:20-35\` — log in\n- \`src/auth/\` — auth\n\n### Board\n- \`src/board/game state.ts:3-9\` — state\n\n## Find\n- Settings → \`src/settings.ts\`\n`;

test('missing MAP and the actual rendered init stub are not built', () => {
  for (const text of [undefined, null, '', ' \n\t', render('MAP.md', {})]) {
    const result = inspect(text);
    assert.equal(result.state, 'not-built');
    assert.equal(result.header, null);
    assert.equal(result.tokens, estimateTokens(text ?? ''));
    assert.deepEqual(result.errors, []);
  }
  const stub = render('MAP.md', {});
  assert.ok(stub.startsWith('<!-- telos-map: not built -->\n'));
  assert.match(stub, /Not built yet: run `\/telos:map`/);
  assert.deepEqual([...stub.matchAll(/^## (.+)$/gm)].map((m) => m[1]), ['Structure', 'Entry points', 'Flows', 'Areas', 'Find']);
});

test('a complete MAP has canonical provenance and fixed headings in order', () => {
  const result = inspect(built);
  assert.equal(result.state, 'built');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.header, metadata);
  assert.equal(result.tokens, estimateTokens(built));
  assert.deepEqual(result.blocks.filter((b) => ['Structure', 'Entry points', 'Flows', 'Areas', 'Find'].includes(b.heading)).map((b) => b.heading), ['Structure', 'Entry points', 'Flows', 'Areas', 'Find']);
  assert.equal(new Set(result.blocks.map((b) => b.id)).size, result.blocks.length);
  assert.deepEqual(inspect(built), result);
});

test('exact limit*4 boundary passes and one extra UTF-16 unit fails without truncation', () => {
  const limit = 200;
  const padded = `${skeleton}<!-- 😀界${'x'.repeat(limit * 4 - skeleton.length - '<!-- 😀界 -->\n'.length)} -->\n`;
  assert.equal(padded.length, limit * 4);
  const exact = inspect(padded, limit);
  assert.equal(exact.state, 'built');
  assert.equal(exact.tokens, limit);
  assert.equal(exact.blocks.map((b) => b.text).join(''), padded);
  const over = inspect(`${padded}\n`, limit);
  assert.equal(over.state, 'invalid');
  assert.equal(over.tokens, limit + 1);
  assert.match(over.errors.join('\n'), /token.*201.*200|201.*token.*200/i);
  assert.equal(over.blocks.map((b) => b.text).join(''), `${padded}\n`);
});

test('tiny positive limits fail explicitly and invalid limits have a named error', () => {
  assert.match(inspect(skeleton, 1).errors.join('\n'), /limit|budget/i);
  for (const limit of [0, -1, 1.5, NaN, Infinity, '1500', undefined]) {
    const result = inspectMap(skeleton, { limit });
    assert.equal(result.state, 'invalid');
    assert.match(result.errors.join('\n'), /limit.*positive integer/i);
  }
});

test('mapHeader formats only validated metadata, with no implicit clock or git', () => {
  assert.equal(mapHeader(metadata), header);
  assert.equal(mapHeader({ ...metadata, commit: 'a'.repeat(64), files: 0 }), `<!-- telos-map: commit ${'a'.repeat(64)} · 2026-10-26 · files 0 -->`);
  for (const values of [
    { ...metadata, commit: 'abc123' }, { ...metadata, commit: 'g'.repeat(40) },
    { ...metadata, date: '2026-02-29' }, { ...metadata, date: '2026-10-26T00:00:00Z' },
    { ...metadata, files: -1 }, { ...metadata, files: 1.5 }, { ...metadata, files: '42' },
    { ...metadata, files: Number.MAX_SAFE_INTEGER + 1 }, {},
  ]) assert.throws(() => mapHeader(values), /commit|date|files/i);
  assert.ok(mapHeader({ ...metadata, date: '2024-02-29' }).includes('2024-02-29'));
});

test('malformed commit/date/count, missing or duplicate headers are actionable', () => {
  const cases = [
    [header.replace(commit, 'abc123'), /commit|hash/i],
    [header.replace(commit, 'z'.repeat(40)), /commit|hash/i],
    [header.replace('2026-10-26', '2026-02-30'), /date/i],
    [header.replace('2026-10-26', '2026-13-01'), /date/i],
    [header.replace('files 42', 'files -1'), /files/i],
    [header.replace('files 42', 'files 1.5'), /files/i],
    [header.replace('files 42', 'files 9007199254740992'), /files/i],
    ['', /header/i],
    [`${header}\n${header}`, /header.*duplicate|duplicate.*header/i],
  ];
  for (const [replacement, message] of cases) {
    const result = inspect(skeleton.replace(header, replacement));
    assert.equal(result.state, 'invalid');
    assert.match(result.errors.join('\n'), message);
  }
  assert.equal(inspect(`intro\n${skeleton}`).state, 'invalid');
});

test('missing, duplicate, reordered or unexpected sections name the structural error', () => {
  const cases = [
    [skeleton.replace('## Flows\n', ''), /missing.*Flows/i],
    [skeleton.replace('## Flows', '## Flows\n\n## Flows'), /duplicate.*Flows/i],
    [skeleton.replace('## Flows\n\n## Areas', '## Areas\n\n## Flows'), /order/i],
    [skeleton.replace('## Flows', '## Other'), /unexpected.*Other/i],
    [skeleton.replace('## Areas', '### Misplaced\n\n## Areas'), /Area.*outside|outside.*Area/i],
    [built.replace('### Board', '### Auth'), /duplicate.*Auth/i],
  ];
  for (const [text, message] of cases) {
    const result = inspect(text);
    assert.equal(result.state, 'invalid');
    assert.match(result.errors.join('\n'), message);
  }
});

test('a built header with a remaining init paragraph is invalid', () => {
  const text = render('MAP.md', {}).replace('<!-- telos-map: not built -->', header);
  const result = inspect(text);
  assert.equal(result.state, 'invalid');
  assert.match(result.errors.join('\n'), /Not built yet|stub/i);
});

test('Areas are separate editable blocks; offsets and raw concatenation preserve every byte', () => {
  for (const text of [built, built.replaceAll('\n', '\r\n'), built.trimEnd()]) {
    const result = inspect(text);
    assert.equal(result.state, 'built');
    const areas = result.blocks.filter((b) => b.id.startsWith('area:'));
    assert.deepEqual(areas.map((b) => b.heading), ['Auth', 'Board']);
    assert.ok(result.blocks.some((b) => b.id === 'areas'));
    assert.equal(result.blocks[0].start, 0);
    assert.equal(result.blocks.at(-1).end, text.length);
    for (let i = 0; i < result.blocks.length; i++) {
      const block = result.blocks[i];
      assert.equal(block.text, text.slice(block.start, block.end));
      if (i) assert.equal(block.start, result.blocks[i - 1].end);
    }
    assert.equal(result.blocks.map((b) => b.text).join(''), text);
    assert.ok(areas[0].text.startsWith('### Auth'));
    assert.ok(!areas[0].text.includes('### Board'));
    assert.ok(!areas[1].text.includes('## Find'));
  }
});

test('file/range/directory refs normalize paths and keep spaces and line bounds intact', () => {
  const result = inspect(built);
  const block = (heading) => result.blocks.find((b) => b.heading === heading);
  assert.deepEqual(block('Structure').refs, [{ path: 'src/', directory: true }]);
  assert.deepEqual(block('Entry points').refs, [{ path: 'src/main.ts', directory: false, start: 1, end: 12 }]);
  assert.deepEqual(block('Auth').refs, [
    { path: 'src/auth/login.ts', directory: false, start: 20, end: 35 },
    { path: 'src/auth/', directory: true },
  ]);
  assert.deepEqual(block('Board').refs, [{ path: 'src/board/game state.ts', directory: false, start: 3, end: 9 }]);
  assert.deepEqual(block('Find').refs, [{ path: 'src/settings.ts', directory: false }]);
  const normalized = inspect(skeleton.replace('## Find\n', '## Find\n- `./src//auth/../main.ts:7`\n- `Dockerfile`\n'));
  assert.deepEqual(normalized.blocks.at(-1).refs, [
    { path: 'src/main.ts', directory: false, start: 7, end: 7 }, { path: 'Dockerfile', directory: false },
  ]);
});

test('unsafe paths and malformed line ranges never become usable references', () => {
  for (const ref of ['/etc/passwd', '../secret.ts', 'src/../../secret.ts', 'C:/code/a.ts', 'src\\a.ts', 'src/a.ts:0-2', 'src/a.ts:9-2', 'src/a.ts:1-no', 'src/:1-2', 'src/a.ts:9007199254740992-9007199254740993']) {
    const result = inspect(skeleton.replace('## Find\n', `## Find\n- \`${ref}\`\n`));
    assert.equal(result.blocks.at(-1).refs.length, 0, ref);
    assert.equal(result.state, 'invalid', ref);
    assert.match(result.errors.join('\n'), /reference/i);
  }
});

test('comments and fenced examples cannot create phantom sections, Areas or references', () => {
  const examples = '<!--\n## Find\n### Fake\n- `fake/comment.ts`\n-->\n```md\n## Find\n### Fake\n- `fake/fenced.ts`\n```\n~~~md\n## Structure\n- `fake/tilde.ts`\n~~~\n';
  const text = built.replace('<!-- area preface -->\n', examples);
  const result = inspect(text);
  assert.equal(result.state, 'built');
  assert.ok(!result.blocks.some((b) => b.heading === 'Fake'));
  assert.ok(!result.blocks.flatMap((b) => b.refs).some((r) => r.path.startsWith('fake/')));
  assert.equal(result.blocks.map((b) => b.text).join(''), text);
});

test('empty optional sections are valid but no usable refs means no incremental baseline', () => {
  const result = inspect(skeleton);
  assert.equal(result.state, 'built');
  assert.deepEqual(result.errors, []);
  assert.equal(result.blocks.flatMap((b) => b.refs).length, 0);
  assert.deepEqual(result.blocks.map((b) => b.id), ['header', 'structure', 'entry-points', 'flows', 'areas', 'find']);
});
