---
id: 03-03
title: MAP format and token-budget validation
type: code
status: done
critical: false
effort: hard
depends: [03-02]
decisions: [D-02, D-04, D-05]
scope: [lib/map.mjs, templates/MAP.md, test/map.test.mjs]
---
## Goal
Give MAP generation and refresh one shared format model and a deterministic validator for
the configured token limit, fixed headings, provenance and independently editable Areas.

## Read first
- SPEC.md §4.1
- SPEC.md §6
- templates/MAP.md:1-22 (stub and stable section skeleton)
- lib/config.mjs:63-67 (positive integer limits)

## Files
- lib/map.mjs (create)
- templates/MAP.md (modify)
- test/map.test.mjs (create)

## Constraints
- Use estimateTokens from 03-02. MAP size includes all text, comments and final newline; do not silently truncate an authored map.
- Keep the init stub and five existing headings. Add only template guidance for backticked repo-relative references and bullet rows, usable by existing ctx do matching.
- Header: `<!-- telos-map: commit <full-hash> · YYYY-MM-DD · files <n> -->`; files n is eligible inventory count, not the refresh percentage denominator.
- Paths use `/`, optional `:start-end` ranges and trailing `/` for directories; retain raw block text/offsets so refresh can preserve unaffected bytes.
- This module parses MAP only, never task/frontmatter; source-reference correctness is also checked by targeted reads in skills/evidence.

## Tests (write first)
- Missing MAP and the exact init stub are not-built; a complete map has header metadata and the five headings in order.
- Exactly limit*4 chars pass; one extra code unit fails, including comments/newline/non-ASCII; tiny positive limits fail explicitly.
- Malformed hash/date/count, duplicate/missing/reordered headings or remaining Not built yet text yield actionable errors.
- Multiple Areas parse separately; file/range/directory refs and paths containing spaces remain intact; raw block concatenation preserves bytes.
- Empty optional sections remain valid; a map without usable references cannot support incremental refresh.

## Interface
- `inspectMap(text, { limit })` → `{ state, header, tokens, blocks, errors }`; state = not-built | built | invalid.
- `header` = `{ commit, date, files }` or null; tokens uses D-02, errors are deterministic strings.
- `blocks` contain `{ id, heading, start, end, text, refs }`; IDs distinguish fixed sections and individual Areas.
- `refs` contain normalized relative path, directory flag and optional start/end lines; preserve the original block text.
- `mapHeader({ commit, date, files })` formats the exact machine header; no clock/git calls in this pure module.

## Edge cases
- missing/stub map → not-built, never a false valid baseline
- limit boundary, extra code unit or tiny budget → exact pass/fail without truncating text
- malformed metadata/headings or leftover stub paragraph → invalid with named errors
- multiple Areas and spaced/ranged/directory refs → separate blocks and lossless raw text
- empty sections/no usable refs → valid skeleton but no incremental baseline

## Steps
1. test/map.test.mjs: table-driven format and estimator cases; check the actual rendered init template too.
2. lib/map.mjs: inspectMap — parse header, fixed sections and Area boundaries; extract refs and report structural/size errors.
3. lib/map.mjs: mapHeader — format validated metadata; expose raw offsets for refresh consumers.
4. templates/MAP.md: document reference syntax and separate Area blocks without changing the stub contract; run the suite.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] Tests demonstrate MAP limit enforcement at the exact boundary and preservation of each fixed heading and Area.

## Result
Added pure inspectMap/mapHeader validation for provenance, fixed headings and exact configured token budgets.
Parsed backticked file/range/directory references and separate Area blocks with lossless raw UTF-16 offsets.
Updated template guidance while preserving the init stub and all five stable headings.
Verified 221/221 tests (13 new), accept PASS and manual boundary/byte-preservation criteria; TMPDIR=/var/tmp avoids the environment synthetic /tmp/.git.
Deviations: none
