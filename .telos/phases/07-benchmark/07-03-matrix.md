---
id: 07-03
title: Benchmark task manifest and run matrix
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [07-02]    # task IDs, e.g. [01-01]
decisions: [D-01, D-02, D-05, D-11]
scope: ["bench/lib/manifest.mjs", "bench/lib/matrix.mjs", "bench/README.md", "test/bench-matrix.test.mjs", "test/fixtures/bench/"]
---
## Goal
Load and validate the benchmark manifest (repositories and tasks as JSON) and expand it into a deterministic, block-randomized run matrix of task × variant × repetition, with setup cells keyed by `(repo, start, profile)`, that a later run can resume.

## Read first
- bench/PROTOCOL.md (task fields, variants, randomization and setup rules)
- lib/errors.mjs (UsageError and exit-code convention)
- lib/budget.mjs (style of a read-only, dependency-free module)

## Files
- bench/lib/manifest.mjs (create)
- bench/lib/matrix.mjs (create)
- bench/README.md (create)
- test/bench-matrix.test.mjs (create)
- test/fixtures/bench/ (create)

## Constraints
- D-01: dependency-free Node ESM `.mjs`; tests with `node:test` under `test/`, so `npm test` runs them.
- D-02: variants exactly `A`, `B`, `C` (Telos deep), `D` (Telos standard); repetitions default 5 from the manifest, overridable with `reps` (the pilot uses 1).
- D-05 [proposed]: a task is single (`prompt`) or multi-session (`steps[]`); setup cells are keyed `(repo, start, profile)` and shared by every C/D cell with that key; the setup's cost is charged to each trajectory in the report, not here.
- D-11 [proposed]: blocked randomization — cells grouped by `(task, rep)`, the four variants in a seeded random order inside each block, block order also seeded; no `Math.random`.
- JSON manifest only; invalid manifests fail before any run with a message naming file and field. Exit codes follow PROJECT rules.

## Tests (write first)
- a valid fixture manifest loads; commits are 40-hex; each task names repo, start, reference, type, expectedPaths, acceptance and its B file
- missing field, unknown variant, duplicate task id, non-hex commit or task with both `prompt` and `steps` → error naming file and field
- same seed → same order; different seed → different order; every cell appears exactly once
- inside every `(task, rep)` block all four variants appear consecutively
- two tasks with different starts in one repo → two setup keys per profile; equal starts share one key; each setup cell precedes its first dependent cell
- cell ids are stable `<task>.<variant>.<rep>`; finished ids are skipped on resume; `reps: 1`, `only` and `variant` filters keep ids unchanged

## Steps
- Write the fixtures and tests first.
- bench/lib/manifest.mjs: `loadManifest(dir)` → `{ repos, tasks, repetitions }` with field-level validation.
- bench/lib/matrix.mjs: `expandMatrix(manifest, { seed, reps, only, variant, done })` → ordered cells plus setup cells with their keys.
- bench/README.md: manifest format, cell ids, setup keys, block order and how to resume.
- Run `npm test`.

## Acceptance
- [ ] all listed tests pass
- [ ] `node --test test/bench-matrix.test.mjs` → exit 0
- [ ] `npm test` → exit 0

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
