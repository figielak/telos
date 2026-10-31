---
id: 06-01
title: Deterministic budget report
type: code
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard
depends: []
decisions: [D-01]
scope: ["lib/budget.mjs","lib/cli.mjs","test/budget.test.mjs","test/cli.test.mjs","README.md"]
---
## Goal
Add the read-only `telos budget` report required by SPEC §12, separating deterministic size estimates from actual model usage.

## Read first
- SPEC.md §12. Token budget
- lib/cli.mjs:29-45 (command registry)
- lib/map-budget.mjs:1-4 (estimateTokens)
- lib/ctx/index.mjs:25-55 (bundle registry and cap)
- lib/ctx/index.mjs:85-98 (rendered output and final newline)
- lib/session.mjs:34-52 (sessionText)
- lib/ctx/shared.mjs:13-18 (sharedBundle)

## Files
- lib/budget.mjs (create)
- lib/cli.mjs (modify)
- test/budget.test.mjs (create)
- test/cli.test.mjs (modify)
- README.md (modify)

## Constraints
- D-01 [proposed]: use the existing UTF-16 length / 4 estimate, label it as estimated, and measure rendered injections separately from stored files.
- Node >=20.10, no dependencies; reuse tasks/frontmatter parsers and existing renderers. Never run checks, shells, models or git writes.
- Bound traversal and reads; exclude caches, archives and symlinks from live-memory totals with explicit omissions. Do not treat every skill body as always-on.
- README CLI row must document included paths, units, limits, exclusions, selector and exit codes.

## Tests (write first)
- Default report is deterministic on minimal/standard/deep fixtures; stored and rendered rows and totals are distinct.
- Unicode and final newlines use the existing estimate consistently; comment stripping changes only rendered counts.
- Selected ctx output matches the real renderer, including profile gates, refusals and truncation; refused context is not a successful budget measurement.
- Missing optional memory/block is reported as missing; missing .telos exits 1; malformed selector/arguments exit 2.
- Oversized or excessive files and symlinks produce bounded explicit omissions without reading external targets; before/after snapshots show no writes.

## Interface
- `telos budget` reports bounded live Telos file sizes, the installed CLAUDE Telos block and rendered SessionStart; each row has bytes, UTF-16 chars and estimated tokens.
- `telos budget --ctx <bundle> [args...]` additionally measures one explicitly selected rendered bundle; use known bundle dispatch without shell interpolation.
- Exit 0 = report generated (omissions remain visible), 1 = unavailable required input or refused measurement, 2 = usage error. Estimates never prove SPEC workflow-token targets.

## Edge cases
- Unicode or trailing newline → stable documented units, no byte/token confusion.
- Missing optional file → explicit missing row; absent initialization → exit 1.
- Malformed or refused ctx selection → exit 2 or 1 respectively, no fabricated zero-cost success.
- Symlink, oversize or traversal limit → skip with visible reason and unchanged repository.

## Steps
1. lib/budget.mjs: collect/report — build bounded, sorted file rows and live SessionStart/CLAUDE rows using existing parsers and estimateTokens.
2. lib/budget.mjs: selected context — invoke the existing bundle renderer with validated argv and measure exactly the emitted representation.
3. lib/cli.mjs: commands — register budget and its usage/error behavior.
4. test/budget.test.mjs: fixtures — prove units, limits, refusals and read-only behavior; document the contract in README.md.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] `bin/telos budget` → exit 0
- [x] Every estimate is labeled; stored memory, injected text and unmeasured host usage cannot be confused.

## Result
Built read-only `telos budget [--ctx <bundle> [args...]]` (lib/budget.mjs): stored `.telos/` rows (raw) with explicit missing core/standard files, rendered rows for the CLAUDE.md block, SessionStart hook output and an optional bundle rendered through the real `ctxCommand`; bytes, UTF-16 chars and `~N est. tokens`, separate totals, `Omitted:` reasons and a `Host usage: not measured` line.
Limits: 256 KiB/file, 1000 entries, depth 6, 200 listed rows (rest counted); `.cache`, archives, symlinks and non-regular files are omitted without reading. Refusals (`REFUSED:`, profile gate, unknown shared name) exit 1 with `not measured`; malformed selection exits 2.
Tests: 8 in test/budget.test.mjs + 1 in test/cli.test.mjs; full suite 576 pass, 1 todo (06-02 known defect).
Surprise: a 1000-entry tree printed ~1000 rows, so listed rows got their own cap. This repo: stored ~71.5K est. tokens (79 files, mostly closed phases), injected ~270 (CLAUDE block ~166, SessionStart ~104); `ctx do` hits the 6000-char cap.
Deviations: none
