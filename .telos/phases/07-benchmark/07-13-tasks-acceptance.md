---
id: 07-13
title: Benchmark tasks, behavioural acceptance and calibration
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [07-14, 07-12]
decisions: [D-05, D-06]
scope: ["bench/corpus/", "bench/calibrate.mjs", "bench/README.md", "test/bench-calibrate.test.mjs", "test/fixtures/bench/"]
---
## Goal
Write the task texts and hidden behavioural acceptance for every selected commit, and prove by calibration that each acceptance fails at start, passes at the reference, and is not tied to the reference implementation.

## Read first
- bench/PROTOCOL.md (task rules, step texts for multi-session scenarios, acceptance rules)
- bench/corpus/ selection output and REVIEW.md (from 07-14)
- bench/lib/manifest.mjs (task JSON format)

## Files
- bench/corpus/ (modify)
- bench/calibrate.mjs (create)
- bench/README.md (modify)
- test/bench-calibrate.test.mjs (create)
- test/fixtures/bench/ (modify)

## Constraints
- D-05 [proposed]: one multi-session scenario per repo (3 step texts for A/B; the C/D plan gets the scenario goal) plus single tasks; mix bugfix, feature, refactor; task text from the commit intent, never quoting the diff.
- D-06 [proposed]: acceptance checks public behaviour (CLI output, HTTP responses, rendered pages, public API tests) plus a regression check (existing tests or build); each runs offline in < 2 min; the independent reviewer checks every script for coupling to the reference implementation, recorded in REVIEW.md.
- Acceptance lives only under `bench/corpus/<repo>/acceptance/`, outside every sandbox readable set (D-08).

## Tests (write first)
- calibrate on a fixture repo: fails at start + passes at reference → OK; passes at start → `invalid: passes at start`; fails at reference → `invalid: fails at reference`
- an alternative fixture implementation of the same behaviour passes the same acceptance
- calibrate exits 1 if any task is invalid and lists them
- `loadManifest(bench/corpus)` validates the real corpus

## Steps
- Write task JSON and acceptance per selected commit; tests for calibrate first.
- bench/calibrate.mjs: run each acceptance at start and at reference in `prepareCopy` copies; print a table.
- Run calibration on the real corpus; copy the table into bench/corpus/README.md.
- Record the reviewer's coupling check in REVIEW.md; run `npm test`.

## Acceptance
- [ ] all listed tests pass
- [ ] `node bench/calibrate.mjs --manifest bench/corpus` → exit 0
- [ ] `node bench/run.mjs --manifest bench/corpus --dry-run --seed 1 --cap-usd 1 --cell-usd 0.1 --out /tmp/telos-bench-dry` → exit 0
- [ ] `npm test` → exit 0

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
