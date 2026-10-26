---
id: 03-04
title: Bounded map context and post-write validation feedback
type: code
status: draft
critical: false
effort: hard
depends: [03-02, 03-03]
decisions: [D-02, D-04, D-06]
scope: [lib/ctx/map.mjs, lib/ctx/index.mjs, lib/ctx/do.mjs, test/ctx-map.test.mjs, test/ctx-do.test.mjs, README.md]
---
## Goal
Provide `telos ctx map` with scan evidence, exact output requirements, PROJECT draft state
and MAP validation, keeping mandatory instructions inside the context cap.

## Read first
- lib/ctx/index.mjs:15-35 (registry and cap)
- lib/ctx/index.mjs:65-79 (ctxCommand output contract)
- lib/ctx/plan.mjs:27-38 (PROJECT extraction and check formatting)
- lib/ctx/do.mjs:143-149 (mapLines and stub behavior)
- lib/init.mjs:15-18 (existing-code Next hint)
- templates/PROJECT.md:1-20 (stable PROJECT headings)

## Files
- lib/ctx/map.mjs (create)
- lib/ctx/index.mjs (modify)
- lib/ctx/do.mjs (modify)
- test/ctx-map.test.mjs (create)
- test/ctx-do.test.mjs (modify)
- README.md (modify)

## Constraints
- Fixed data precedes scan evidence: refusal/validation, mode, header to write, budget, fixed headings/ref syntax, PROJECT section state, source suggestions, optional scan rows.
- Read MAP metadata before stripping comments; preserve the exact header to write in output. Never lose validation or limits through cap().
- PROJECT state identifies template-empty sections; authored sections are protected and represented by bounded excerpts/pointers. No invented rules from stack detection.
- Include exact MAP/PROJECT output pointers; a targeted read of the existing MAP for rollback/preservation is permitted, never a directory-wide `.telos/` read.
- Dirty paths outside excluded scan content and init-managed files refuse mapping; no HEAD refuses with a first-commit hint. The scan itself still works.
- Update ctx do's stub omission to the SPEC's Not built yet hint; preserve its existing ten matching MAP-lines limit.

## Tests (write first)
- Fresh minimal/standard/deep init yields full mode, exact HEAD/date/count header, configured limit, headings, source suggestions and PROJECT-empty state.
- Missing init, absent HEAD or dirty source yields an actionable REFUSED; init-only output changes do not refuse.
- Long scan/PROJECT inputs keep mandatory fields intact within a 6000-char payload; stdout is payload plus the existing terminal newline.
- Oversized or structurally invalid MAP yields `Map validation: FAIL` with reasons; rewriting a valid MAP yields PASS with measured tokens.
- Authored PROJECT sections are marked preserve; missing/template-empty sections are draftable; low MAP budgets yield an explicit refusal when the skeleton cannot fit.
- Stub MAP in ctx do shows the Not built yet hint; built maps still include at most ten scope-matching lines.
- Unknown arguments are UsageError exit 2; recognized bundle refusals/validation reports remain exit 0.

## Interface
- `mapBundle({ root, args })` → bounded string; initially no args; register `map` in bundles.
- `Map validation: NOT BUILT | PASS <tokens>/<limit> | FAIL <reasons>` is based on the entire current MAP.
- `Mode: full`, `Header to write: …`, `Map limit: …`, `Project: …` and scan suggestions precede optional detail.
- `REFUSED: <reason>` stops the skill but exits 0 like ctx do; validation failure is feedback for repair, not a truncated success.
- Re-running `telos ctx map` after writing provides fresh validation without a separate command or file mutation.

## Edge cases
- uninitialized/no HEAD/dirty source → REFUSED; only init-managed changes → usable bundle
- oversized scan/PROJECT → optional evidence reduced, mandatory fields intact under cap
- invalid/over-limit then corrected MAP → FAIL then PASS using actual saved text
- authored/template-empty PROJECT or impossible MAP limit → preserve/draft state or explicit refusal
- stub/built MAP in ctx do → helpful hint or bounded scope-matching lines
- unknown arguments / normal refusal → exit 2 / exit 0

## Steps
1. test/ctx-map.test.mjs and test/ctx-do.test.mjs: create temp initialized git repos and budget/provenance/PROJECT cases.
2. lib/ctx/map.mjs: mapBundle — load config, scan, inspect MAP, classify PROJECT sections and format mandatory context.
3. lib/ctx/map.mjs: budget optional scan rows with renderScan; reserve space before cap and produce explicit refusal if mandatory content cannot fit.
4. lib/ctx/index.mjs: register map; lib/ctx/do.mjs: return the stub hint while retaining built-map selection.
5. README.md: add ctx map row and clarify preserved machine metadata/stub hint; run the suite.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] `bin/telos ctx map` → exit 0
- [ ] Saved MAP validation and mandatory map context survive worst-case inputs without exceeding the payload cap.

## Result
