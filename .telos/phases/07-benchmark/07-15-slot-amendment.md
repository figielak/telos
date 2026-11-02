---
id: 07-15
title: "Amendment 3: an empty slot stays empty"
type: code
status: done
critical: false
effort: normal
depends: [07-07]
decisions: [D-04]
scope: ["bench/PROTOCOL.md", "bench/select.mjs", "bench/README.md", "bench/corpus/REVIEW.md", "test/bench-select.test.mjs", "test/fixtures/bench/"]
---
## Goal
The 07-14 run left the Python slot empty under the frozen rules (REVIEW.md §Status). Amend the rules, before preregistration, so a slot with no qualifying repository stays empty and is reported as a limitation instead of stopping selection; the benchmark goes ahead with the filled slots (user decision 2026-11-02, instead of growing the pool).

## Read first
- bench/PROTOCOL.md §3.1, §3.3, §3.5, §12, §Amendments
- bench/select.mjs: selectCorpus (the `no repository qualifies for slot` throw)
- bench/corpus/REVIEW.md §Status, §Deviations during the 07-14 run

## Files
- bench/select.mjs (modify)
- bench/PROTOCOL.md (modify)
- bench/README.md (modify)
- bench/corpus/REVIEW.md (modify)
- test/bench-select.test.mjs (modify)
- test/fixtures/bench/ (modify, only if a fixture is needed)

## Constraints
- D-04: the change is a dated amendment entry (amendment 3) with its reason; no other selection rule, threshold or pool changes. Python is not re-selected by other means in this phase.
- An empty slot is listed in the output (`unfilled: [{ slot, reason }]`), never silently dropped; fewer than 2 filled slots is still a usage error (nothing comparable to benchmark).
- Also record as rules, from the 07-14 experience: a suite recipe follows the repository's own CI or docs at the measured start and is written before measuring; it may be corrected only when the test command did not execute the suite (recipe or host error), with both runs kept; measurements run under a memory cap with `TMPDIR` outside `/tmp`.

## Tests (write first)
- a slot without a qualifying repository → no repo for it, `unfilled` names the slot and reason, no throw; the other slots are selected as before
- only one slot fillable → usage error
- same input → identical output with `unfilled` (determinism)

## Steps
- Write the tests; RED on the current throw.
- selectCorpus: collect empty slots into `unfilled` (sorted), require ≥ 2 filled slots.
- PROTOCOL: §3.1/§3.5 quota per selected repository, §12 limitation "empty slot", amendment 3 entry; README row for the output field.
- REVIEW.md: status points to amendment 3.
- Run `npm test`.

## Acceptance
- [x] all listed tests pass
- [x] `node bench/select.mjs --manifest bench/corpus` → exit 0
- [x] `npm test` → exit 0

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
Built: selectCorpus lists slots without a qualifying repository under `unfilled` (sorted, with reason) instead of throwing, and requires ≥ 2 filled slots (MIN_SLOTS). PROTOCOL amendment 3 (§3.1, §3.3 recipe rule, §3.5 quota per selected repo, §12 empty slot + sample size), README row, REVIEW.md status.
On the 07-14 measurements the rule now selects lazygit (go) and anything-llm (web), python unfilled; both have pilotStart null (later starts unmeasured or overlapping) — for 07-14 to resolve.
Tests: 45 in test/bench-select.test.mjs (3 new, 1 rewritten for the new rule); npm test 722/722.
Deviations: none
