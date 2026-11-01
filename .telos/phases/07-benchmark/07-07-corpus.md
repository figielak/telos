---
id: 07-07
title: Corpus rules amendment and recorded candidate pool
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [07-02, 07-04]
decisions: [D-04, D-10]
scope: ["bench/PROTOCOL.md", "bench/corpus/", "bench/select.mjs", "bench/README.md", "test/bench-select.test.mjs", "test/fixtures/bench/"]
---
## Goal
Fix the corpus rules in PROTOCOL so they can be met, implement them in `bench/select.mjs`, and record a dated, reproducible candidate pool from GitHub Search with git facts and starts per candidate. This commit fixes the rules; 07-14 runs them once from scratch.

## Read first
- bench/corpus/REVIEW.md §Status (why the old rules are unsatisfiable)
- bench/PROTOCOL.md §3.1–§3.5, §4.2, §Amendments
- bench/select.mjs, test/bench-select.test.mjs (reuse; extend, don't rewrite)

## Files
- bench/PROTOCOL.md (modify)
- bench/select.mjs (modify)
- bench/corpus/ (modify: search/, candidates.json, exclusions.json, REVIEW.md)
- bench/README.md (modify)
- test/bench-select.test.mjs (modify)
- test/fixtures/bench/ (modify)

## Constraints
- D-04: the pool is one recorded, dated GitHub Search query, identical across the three slots except `language:` (Python, JavaScript, Go): permissive licence, pushed in 2025 or later, sort by stars, first 30 per slot. The raw responses and the query date are committed under `bench/corpus/search/`; it replaces the convenience sample.
- PROTOCOL amendment (one dated entry, user decision in revise): scenario = the first other eligible change (commit or merge) with 150–1500 product lines, no ≥ 3-commit branch rule; task window = next 100 first-parent commits; reference = start tree + the task commit's own diff, which must apply cleanly (`git merge-tree`), else the task is skipped with reason "does not apply"; regression = the start's restored tests, unchanged.
- PROTOCOL also states: rules are frozen by this commit; 07-14 runs once without rule changes; later review objections go to the report as limitations (§3.4, §12).
- `candidates.json` is generated from the saved responses (`--pool`), never hand-edited; `--gather` fills git facts and `starts[]` per clone. Hand exclusions keep the fixed reason list.
- The old round-1–3 sample, `selection.json`, `b-effort.json` and B directories are not committed; REVIEW.md keeps rounds 1–3 under "Superseded rounds" as disclosure. `suites.json` recipes and `measure-suite.sh` stay for 07-14.
- No network in tests; the search is run once by hand (`gh api`), its command line recorded in README.

## Tests (write first)
- `--pool` on fixture responses → same candidates.json byte for byte; order = slot, then stars desc, then id; 31st entry of a slot is dropped
- `--pool … --check` exits 1 when candidates.json differs from the saved responses, 0 when it matches
- scenario: a non-merge commit with 150–1500 product lines is chosen; a 149- or 1501-line one is not; singles are never reused as the scenario
- the window stops at commit 100 after the start; a task at commit 101 is not derived
- a task commit whose diff conflicts with the start tree is skipped with "does not apply" and the next eligible one is taken; the reference tree equals start + task diff, not the commit's own tree

## Steps
- Write the PROTOCOL amendment (§3.1–§3.5, §4.2, Amendments) and the search query text.
- Tests first, then `--pool`, the scenario/window/reference changes in select.mjs.
- Run the query once, save responses, generate candidates.json; `--gather` every candidate (blobless clones).
- Move old rounds in REVIEW.md to "Superseded rounds"; drop the stale outputs; README rows for `--pool`.
- Run `npm test`.

## Acceptance
- [ ] all listed tests pass
- [ ] `node bench/select.mjs --manifest bench/corpus --pool bench/corpus/search --check` → exit 0 (candidates.json matches the saved responses)
- [ ] PROTOCOL §Amendments has the dated entry naming points 1–5 of the revise
- [ ] `npm test` → exit 0

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
