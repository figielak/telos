---
id: 07-06
title: Aggregate results and render the report
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [07-05]    # task IDs, e.g. [01-01]
decisions: [D-01, D-02, D-05, D-06, D-11]
scope: ["bench/lib/report.mjs", "bench/report.mjs", "bench/README.md", "test/bench-report.test.mjs", "test/fixtures/bench/"]
---
## Goal
Aggregate metric rows into a CSV and the Markdown tables of the report: per-cell medians and IQR, acceptance rates next to cost per accepted task, paired differences, descriptive hypothesis verdicts and break-even over the deployment horizon, with missing cells shown explicitly.

## Read first
- bench/PROTOCOL.md (analysis plan, weighting, verdict thresholds, deployment horizon)
- bench/lib/metrics.mjs (row shape from 07-05)
- .telos/phases/06-measure/06-RESULTS.md §Follow-ups (F3)

## Files
- bench/lib/report.mjs (create)
- bench/report.mjs (create)
- bench/README.md (modify)
- test/bench-report.test.mjs (create)
- test/fixtures/bench/ (modify)

## Constraints
- D-06 [proposed]: primary table = USD per accepted task with acceptance n/N in the same cell; cost includes failed attempts, retries, timeouts and setup; cache_read in its own column.
- D-05 [proposed]: each trajectory (repetition) of C/D is charged its full setup cost; B is charged its recorded preparation effort as a separate column (minutes, not USD).
- D-11 [proposed]: break-even over the protocol's deployment horizon: first crossover and sustained break-even (C/D cumulative ≤ B from that point to the horizon end), or "not reached".
- Verdicts H1–H5 use the PROTOCOL thresholds and weighting (each task and each scenario = one unit); the table shows how many units agree.
- F3 carry-over: per task C−B, C−A, D−B, D−A, C−D labelled "difference vs baseline", not per-step attribution.
- Medians and IQR only; deterministic output (stable sort, fixed decimals); missing, skipped, refused or infra-failed cells appear with their reason.

## Tests (write first)
- median and IQR for odd and even n, including n = 1
- cost per accepted task with zero accepted → "no accepted run", not Infinity; failed-run cost still in the numerator
- setup cost added to every C/D trajectory, not divided by repetitions
- paired difference uses tasks present in both variants and lists excluded tasks
- verdict: 3 of 4 units agreeing with a favourable median → "supported"; 2 of 4 → "inconclusive"; 3 of 4 against → "contradicted"
- break-even: a series crossing then crossing back → first crossover reported, sustained "not reached"
- identical input → byte-identical CSV and Markdown

## Steps
- Fixture rows and tests first.
- bench/lib/report.mjs: `aggregate(rows, matrix, protocol)`, `verdicts`, `breakEven`, `toCsv`, `toMarkdown`.
- bench/report.mjs: `--rows <dir> --manifest <dir> --out <dir>` writes `runs.csv` and `tables.md`; exit 2 on usage errors.
- bench/README.md: how to regenerate the report.
- Run `npm test`.

## Acceptance
- [x] all listed tests pass
- [x] `node --test test/bench-report.test.mjs` → exit 0
- [x] `npm test` → exit 0

## Result
Built `bench/lib/report.mjs` (`aggregate`, `verdicts`, `breakEven`/`cumulative`, `median`/`quartiles`, `toCsv`, `toMarkdown`) and `bench/report.mjs` (`--rows --manifest --out [--protocol]` → `runs.csv`, `tables.md`). USD per accepted run with acc n/N, full setup charged to every C/D run, H1–H5 per PROTOCOL §2.3–§2.4 (ties, n/a as +∞, exclusions listed), signed differences vs baseline, per-group break-even (first and sustained, measured vs extrapolated), missing and non-completed cells. 19 tests in `bench-report` (717 total), all green.
Choices the task left open: IQR by Tukey hinges; break-even uses PROTOCOL's strict "cheaper" (the task text says ≤); break-even groups are `<repo>.<start>`; setup tokens/exploration not supplied → C/D fresh and exploration are n/a, not 0. The metric rows carry no `reason`/setup exploration, so the 07-09 run feeds `--protocol` setup entries.
Deviations: none
