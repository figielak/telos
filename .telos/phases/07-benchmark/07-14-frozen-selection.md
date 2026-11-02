---
id: 07-14
title: "Measured selection, B files and model check"
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [07-07, 07-15]
decisions: [D-02, D-04, D-10]
scope: ["bench/corpus/", "bench/select.mjs", "bench/README.md", "test/bench-select.test.mjs", "test/fixtures/bench/"]
---
## Goal
Run the rules frozen in 07-07 once, from scratch: measure the suites of the qualifying candidates, commit `selection.json`, write the B file per selected `(repo, start)` and record the Codex model check in REVIEW.md. This task's commit freezes selection and B.

## Read first
- bench/PROTOCOL.md §3.2–§3.5, §4.3 (as amended in 07-07)
- bench/corpus/measure-suite.sh, bench/corpus/suites.json (reuse)
- bench/lib/workspace.mjs (prepareCopy, the view the B author gets)

## Files
- bench/corpus/ (modify: suites.json, suites.jsonl, exclusions.json, selection.json, `<repo>/<start>/CLAUDE.md`, b-effort.json, REVIEW.md)
- bench/select.mjs (modify, only if `--check-b` needs the new layout)
- bench/README.md (modify)
- test/bench-select.test.mjs (modify)
- test/fixtures/bench/ (modify)

## Constraints
- D-04: no rule, threshold or select.mjs logic change in this task; a defect in the rules found here stops the task (blocked), it is not patched in place. Suite recipes per new candidate are added to suites.json before measuring and are not tuned after a failing measurement.
- Measure only candidates that pass the static and history rules (`--gather` output), with `bench/corpus/measure-suite.sh` (user's permission rule); every run appended to suites.jsonl, failures included.
- D-10: each B file is written by a fresh Claude subagent that gets only the `prepareCopy` view of the start and PROTOCOL §4.3; no task subjects, no human edits; ≤ 400 words; subagent wall-clock minutes go to b-effort.json.
- Review: Codex CLI, fresh context, read-only, no network, one round over the frozen material; reported as "model check". Findings and responses go to REVIEW.md; objections not fixable without a rule change are listed as report limitations (§12), not fixed.

## Tests (write first)
- `--check-b` fails a B file over 400 words or missing for a selected start, and passes otherwise
- `--check-b` fails when b-effort.json lacks minutes for a selected start
- same candidates, suites.jsonl and exclusions → identical selection.json

## Steps
- Add suite recipes for the gathered qualifying candidates; run measure-suite.sh at each earliest usable start.
- Run selection; commit-ready selection.json with derived tasks per start.
- Spawn one fresh subagent per selected start for its B file; record minutes.
- Run the Codex model check once; record reviewer, session id, findings and responses in REVIEW.md.
- Run `npm test`.

## Acceptance
- [ ] all listed tests pass
- [ ] `node bench/select.mjs --manifest bench/corpus --check-b` → exit 0
- [ ] bench/corpus/REVIEW.md names the reviewer, its kind and its findings
- [ ] `npm test` → exit 0

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
BLOCKED (D-04): the frozen rules leave the python slot empty — `select.mjs` stops with "no repository qualifies for slot python". Needs a user decision (amendment: larger pool or host toolchain); no selection.json, B files or model check yet.
Built: suite recipes for the 17 candidates that pass static + history rules, 31 measure-suite.sh runs in suites.jsonl (go would be lazygit 21 s, web anything-llm 2 s), `--check-b` now also requires positive b-effort.json minutes per selected start; README row updated.
Tests: 42 in test/bench-select.test.mjs (2 new, 2 updated), npm test 719/719 green.
Surprises: first pass measured 10 candidates at the wrong start; four recipes and two host failures (tmp quota, OOM) needed reruns — all disclosed in bench/corpus/REVIEW.md as deviations from D-04.
Deviations: none
