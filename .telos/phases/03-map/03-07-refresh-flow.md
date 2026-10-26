---
id: 03-07
title: Refresh context and selective map editing
type: code
status: done
critical: false
effort: hard
depends: [03-04, 03-05, 03-06]
decisions: [D-02, D-04, D-05, D-06]
scope: [lib/ctx/map.mjs, shared/map.md, test/ctx-map.test.mjs, test/skills.test.mjs, README.md]
---
## Goal
Complete `/telos:map --refresh` and its hard variant with a bounded diff-aware bundle,
selective edits and verification that unaffected blocks remain byte-identical.

## Read first
- SPEC.md §6
- lib/ctx/index.mjs:65-79 (ctxCommand argument and cap boundary)
- test/skills.test.mjs:110-115 (raw arguments never enter injections)
- lib/ctx/shared.mjs:13-19 (shared body delivery)

## Files
- lib/ctx/map.mjs (modify)
- shared/map.md (modify)
- test/ctx-map.test.mjs (modify)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- Keep the initial injection argument-free. Shared body recognizes only empty Request or literal --refresh; for the latter call the fixed `telos ctx map --refresh` command.
- Use the deterministic impact plan, not a second model estimate; retain exactly the five fixed headings and preserve every unaffected Area/block byte-for-byte.
- Include full affected old blocks and relevant changed-file suggestions before optional scan data. Never clip a mandatory block; if these exceed the payload cap, refuse and suggest an explicit full /telos:map.
- A full fallback gets the ordinary full-build bundle with its reason; noop preserves body and may advance the header. Refusal performs no writes.
- Compare against the in-session original MAP after editing; a successful size/structure check alone is insufficient proof of preservation. At most two repair attempts, then restore the old MAP and report failure.
- Capture that original via the exact MAP pointer supplied by the bundle; this one-file preservation read does not authorize reading other `.telos/` files.
- Shared body remains ≤ 60 lines. PROJECT confirmation stays separate; refresh must not replace authored PROJECT text.

## Tests (write first)
- Literal --refresh yields plan mode/reason/ratio/affected block IDs and old text; empty args retain full mode; unknown/multiple args exit 2.
- Oversized optional scan shrinks without losing affected blocks/limits/header; oversized mandatory refresh content yields REFUSED within 6000 chars.
- Stub/unavailable baseline yields a full bundle; valid unchanged MAP yields noop; invalid diff/dirty source yields refusal.
- Refresh validation uses the whole saved MAP limit, including unchanged blocks; existing PROJECT sections remain marked preserve.
- Skill contract requires literal flag handling, affected-only edits, byte-preservation comparison, header update and validation/restore on failure.

## Interface
- `mapBundle({ root, args: ['--refresh'] })` adds Mode, Reason, Impact affected/total, changed-path evidence and affected blocks.
- All modes preserve the normal Map validation/Header to write/Map limit contract; default no-arg mode remains full.
- A preservation comparison uses the original raw blocks held by the skill, never re-generated summaries of unaffected content.
- No extra command, cache, hook or git mutation; README updates ctx map and both skill rows for the completed flag.

## Edge cases
- empty/literal --refresh/invalid args → full/refresh plan/UsageError
- large optional/mandatory content → optional trim/actionable refusal, never partial affected blocks
- missing baseline/no changes/diff failure/dirty source → full/noop/refused/refused
- unchanged sections consume the token budget → validate the whole result and preserve authored PROJECT
- model alters unaffected text or exceeds limits → repair then restore on continued failure

## Steps
1. test/ctx-map.test.mjs: add flag, mode, payload-size and whole-map validation cases; test/skills.test.mjs: add selective-edit/restore contracts.
2. lib/ctx/map.mjs: integrate diffNameStatus/planRefresh and reuse the full builder for genuine fallback modes.
3. lib/ctx/map.mjs: budget refresh payload with complete affected blocks; return a compact refusal if the mandatory payload cannot fit.
4. shared/map.md: replace the temporary refresh message with the fixed-command workflow and preservation/validation checks.
5. README.md: complete refresh semantics and thresholds for CLI/skills; run suite and plugin validation.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] `claude plugin validate .` → exit 0
- [x] `bin/telos ctx map --refresh` → exit 0
- [x] Context never truncates an affected block; headless proof of model edit preservation remains a 03-09 gate.

## Result
`telos ctx map --refresh` now runs diffNameStatus/planRefresh: noop (header only), incremental (Reason,
Impact, Changed, New Area candidates, every affected block whole) or full with the fallback Reason;
refused plans and affected blocks over the 6000-char payload are REFUSED, never clipped.
shared/map.md (45 lines) runs the fixed refresh command, edits only affected blocks, compares bytes with
the rollback copy, validates the whole MAP and restores after two failed repairs. 258 tests (7 new). Headless proof stays in 03-09.
Deviations: none
