---
id: 07-10
title: Publish benchmark results
type: doc           # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [07-09]
decisions: [D-02, D-03, D-04, D-06, D-09]
scope: ["bench/RESULTS.md", "README.md", "SPEC.md"]
---
## Goal
Write the public results page source: when Telos pays off and when it does not, with every number traceable to bench/results/, and link it from README and SPEC §12.

## Read first
- bench/results/tables.md and bench/results/RUNLOG.md
- bench/PROTOCOL.md (hypotheses, Amendments, Known limitations)
- .telos/phases/06-measure/06-RESULTS.md (scorecard style, estimate vs usage wording)
- README.md §CLI
- SPEC.md §12. Token budget

## Files
- bench/RESULTS.md (create)
- README.md (modify)
- SPEC.md (modify)

## Constraints
- Sections in order: three-sentence summary (when it pays, when not); results table (variant × task type: USD per accepted task, acceptance n/N, fresh tokens, cache_read separate, wall time); break-even; exploration; pros and cons; method and limitations (F1–F5, F7, F8 per D-03, sample size, single host version); disclosure that the Telos author ran it; how to reproduce.
- Every number is copied from tables.md or RUNLOG.md; each hypothesis H1–H5 (H1–H4 for both C and D) gets the PROTOCOL verdict ("supported", "contradicted" or "inconclusive") with the number of agreeing units, including the ones that go against Telos.
- No significance or general claims beyond the measured repos, versions and models; say that 5 repetitions measure run variability, not repository diversity; ranges, not single headline percentages; cost per accepted task always next to the acceptance rate.
- Label the comparison "shipped default workflows" (D-09): per-model costs and Telos's skill model overrides are stated; B's preparation minutes are shown next to C/D setup cost.
- Link the per-run evidence (bench/results/runs/) and REDACTION.md so readers can recompute every metric.
- README gets a short "Benchmark" section linking bench/RESULTS.md and bench/README.md; SPEC §12 links the measured values without changing its targets.
- Round 2 (the user's own open-source project) is listed as future work, not as a result.
- The website page itself is outside this repository; RESULTS.md is its source.

## Steps
- Draft RESULTS.md from tables.md, hypothesis by hypothesis.
- Write pros/cons from observed failures, refusals and exploration data, not from expectations.
- Add the README section and the SPEC §12 link.
- Cross-check each number against tables.md.

## Acceptance
- [x] each hypothesis H1–H5 has a verdict backed by a tables.md row, with deep (C) and standard (D) reported side by side
- [x] RESULTS.md contains the limitations, disclosure and reproduce sections
- [x] `grep -q "bench/RESULTS.md" README.md` → exit 0
- [x] `npm test` → exit 0

## Result
bench/RESULTS.md reports all H1-H5 verdicts for C and D, limitations, deviations, disclosure and how to reproduce; README and SPEC 12 link it.
Telos cost more per accepted run in all 6 units and explored more; acceptance held against B (29/30 C, 28/30 D, 29/30 B). The summary says so first.
Numbers cross-checked by script: all 24 result rows and 6 exploration rows match tables.md; cost per model comes from rows/ and wall time from runs.csv.
Open: B preparation minutes were never recorded; no independent review of redaction or report; not pushed.
Deviations: none
