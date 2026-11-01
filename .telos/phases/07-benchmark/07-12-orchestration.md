---
id: 07-12
title: Run orchestration, hidden acceptance and spend accounting
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: true
effort: hard        # normal | hard
depends: [07-11]    # task IDs, e.g. [01-01]
decisions: [D-06, D-08, D-11, D-12]
scope: ["bench/lib/orchestrate.mjs", "bench/run.mjs", "bench/README.md", ".gitignore", "test/bench-orchestrate.test.mjs", "test/fixtures/bench/"]
---
## Goal
Drive the matrix: per cell prepare the workspace, run the trajectory, mount and run the hidden acceptance only after the agent exits, write one record atomically, and keep total spend under the cap by reserving a bounded budget per cell before it starts. Critical because it spends money and decides what counts as accepted.

## Read first
- bench/PROTOCOL.md (acceptance, cap, resume and cache rules)
- bench/lib/workspace.mjs, bench/lib/session.mjs, bench/lib/transitions.mjs (07-04, 07-11)
- bench/lib/matrix.mjs (resume input `done`)

## Files
- bench/lib/orchestrate.mjs (create)
- bench/run.mjs (create)
- bench/README.md (modify)
- .gitignore (modify)
- test/bench-orchestrate.test.mjs (create)
- test/fixtures/bench/ (modify)

## Constraints
- D-06 [proposed]: acceptance material is copied from outside the sandbox's readable set into a fresh dir only after every session of the cell has exited, runs with cwd = copy, and is deleted afterwards; result = exit code, output tail, patch of the copy vs start.
- D-12 [proposed]: a cell starts only if `spent + reservation ≤ cap`; its sessions share that reservation; spend counts every attempt, retry, timeout and setup; stop without dropping repetitions and list cells not run.
- D-11 [proposed]: log wall-clock gaps between cells for the cache report.
- Records are written atomically (temp file + rename) with an in-progress marker; on resume a cell with a marker but no record is rerun once and the abandoned attempt's spend is still counted.
- Raw records and transcripts go to `--out <dir>` outside the repo; `bench/results/raw/` is gitignored.

## Tests (write first)
- acceptance material is absent from the workspace and readable set while the fake host runs, present only during grading, removed after
- record holds status, acceptance result, patch, changed paths, sessions and versions
- cap: reservation that would exceed the cap → cell not started, listed as skipped, exit 1; spend never exceeds the cap in a fake run
- crash after sessions but before the record → resume reruns that cell once, no duplicate record, both attempts' spend counted
- a completed record is never rerun on resume
- grading script missing for a cell → record `failed: no-acceptance` and the run stops
- `--dry-run` prints ordered cells and argv without spawning; usage errors → exit 2

## Interface
- `runMatrix(cells, manifest, { outDir, capUsd, reservation, deps })` → `{ records, skipped, spentUsd }`
- `bench/run.mjs --manifest <dir> --out <dir> --seed <n> [--reps <n>] [--only <task>] [--variant <V>] --cap-usd <n> --cell-usd <n> [--dry-run]` → exit 0 all cells ran, 1 any cell refused/skipped, 2 usage

## Edge cases
- reservation exceeds remaining cap → skipped, exit 1
- crash mid-cell → one rerun, spend kept
- acceptance material visible during a session → refused (test asserts it never is)
- grading script missing → record `failed: no-acceptance`, run stops

## Steps
1. test/fixtures/bench/: fake deps (workspace, trajectory) and a grading script; write the tests.
2. bench/lib/orchestrate.mjs: per-cell flow, atomic records, markers, spend ledger.
3. bench/lib/orchestrate.mjs: acceptance mount/run/cleanup and patch capture.
4. bench/run.mjs: flags, dry run, resume; .gitignore `bench/results/raw/`; bench/README.md usage.
5. Run `npm test`.

## Acceptance
- [ ] all listed tests pass
- [ ] `node bench/run.mjs --manifest test/fixtures/bench/manifest --dry-run --seed 1 --cap-usd 1 --cell-usd 0.1 --out /tmp/telos-bench-dry` → exit 0
- [ ] `npm test` → exit 0

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
