---
id: 07-07
title: Frozen candidates, selection and baseline CLAUDE.md files
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [07-02, 07-04]
decisions: [D-02, D-04, D-10]
scope: ["bench/corpus/", "bench/select.mjs", "bench/README.md", "test/bench-select.test.mjs", "test/fixtures/bench/"]
---
## Goal
Freeze which repositories and commits the benchmark may use, by a deterministic selection script over recorded candidate lists, and write the B-variant CLAUDE.md for each selected `(repo, start)` before any task text or acceptance exists.

## Read first
- bench/PROTOCOL.md (repo and commit criteria, candidate/exclusion format, B rules)
- bench/lib/workspace.mjs (prepareCopy from 07-04, used to view the historical state)
- .telos/phases/06-measure/06-CONTEXT.md §Decisions (D-04 pins for BlueVest and knml.edu.pl)

## Files
- bench/corpus/ (create)
- bench/select.mjs (create)
- bench/README.md (modify)
- test/bench-select.test.mjs (create)
- test/fixtures/bench/ (modify)

## Constraints
- D-04 [proposed]: candidate lists (third-repo candidates; commits per repo) and exclusions with reasons are committed as files; `bench/select.mjs` applies the PROTOCOL rule deterministically and its output is committed; the independent review of candidates, exclusions and B files is recorded in `bench/corpus/REVIEW.md`.
- D-10 [proposed]: one B file per selected `(repo, start)`, written from a `prepareCopy` view of that start only, ≤ 400 words (counted by `bench/select.mjs --check-b`), with the author's minutes recorded; committed before 07-13 starts.
- A start commit with a native CLAUDE.md or `.claude/` is excluded with that reason.
- This task's commit freezes selection and B; changes after it are PROTOCOL amendments.

## Tests (write first)
- same candidate files → identical selection output; a changed rule input changes it
- excluded candidates never appear in the selection and keep their reason
- `--check-b` fails a B file over 400 words or missing for a selected start, and passes otherwise

## Steps
- Gather candidates per PROTOCOL (third repo: list ≥ 3, record why each is in or out); write exclusions.
- bench/select.mjs: selection and `--check-b`; tests first.
- Run selection; for each selected start write its B file from that historical state; record minutes.
- Get the independent review and record it in bench/corpus/REVIEW.md.
- Run `npm test`.

## Acceptance
- [ ] all listed tests pass
- [ ] `node bench/select.mjs --manifest bench/corpus --check-b` → exit 0
- [ ] bench/corpus/REVIEW.md names the reviewer and their findings
- [ ] `npm test` → exit 0

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
