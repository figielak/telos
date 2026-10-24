---
id: 02-05
title: telos ctx plan and ctx approve bundles
type: code
status: done
critical: false
effort: normal
depends: [02-01, 02-02, 02-03]
decisions: [D-02, D-09]
scope: [lib/ctx/plan.mjs, lib/ctx/approve.mjs, lib/ctx/index.mjs, test/ctx-plan.test.mjs, README.md]
---
## Goal
`telos ctx plan [NN|description]` gives `plan`/`revise` everything they need in one bundle;
`telos ctx approve` gives `approve` the phase, its tasks, lint result and blocking items.

## Read first
- lib/ctx/index.mjs:10-53 (bundles, cap, stripComments, excerpt)
- lib/ctx/status.mjs:12-21 (bundle style)
- lib/ctx/stack.mjs:13-21 (stackLine)
- SPEC.md §4.1 (Lessons readers, carry-over), §4.4 (Carry-over), §5.2

## Files
- lib/ctx/plan.mjs (create)
- lib/ctx/approve.mjs (create)
- lib/ctx/index.mjs (modify: register `plan`, `approve`)
- test/ctx-plan.test.mjs (create)
- README.md (modify: two `telos ctx` rows)

## Constraints
- `ctx plan` sections: profile; target (`NN-name [status] goal · done when` or `new phase: <description> → next NN`); PROJECT §Purpose + §Rules; stack line; config checks; ROADMAP lines; CONTEXT (if present); carry-over items for NN with their numbers; existing task index (`id [status] title · effort · depends · scope`); format reminder (line limits, required sections)
- no arg → STATUS phase; arg `^\d{2}$` → that phase; otherwise a description
- `ctx approve` sections: phase line; task index; `lint-plan` result; tasks blocked by proposed decisions or *Awaiting user*; whether `telos/NN-start` exists; git status of `.telos/`
- lessons and delete-zone lines are not included (04, D-09)
- both capped by `cap()`

## Tests (write first)
- `ctx plan 01` on the 02-03 fixture lists the 3 tasks and the phase line
- `ctx plan "add auth"` shows `new phase` with the next NN
- carry-over `- 01: x → y` appears with its number; `- 04: …` does not
- `ctx approve` lists lint problems for 09-bad and `tag: missing`
- a task with a proposed decision is listed as blocked
- output has no HTML comments and stays ≤ 6000 chars

## Steps
1. Write tests against test/fixtures/telos-phase/.
2. lib/ctx/plan.mjs and lib/ctx/approve.mjs reusing `phaseTasks`, `phaseLine`, `lintPhase`, `getList`, `stackLine`.
3. Register both; README rows; run the suite.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0

## Result
- lib/ctx/plan.mjs `planBundle` and lib/ctx/approve.mjs `approveBundle`, registered as `ctx plan` / `ctx approve`; 11 tests, suite 143/143.
- approve.mjs also exports `statusPhase`, `indexLine`, `phaseDecisions`, `decisionBlocks` for `ctx do` (02-06); `phaseDecisions` repeats lint-plan's private CONTEXT parse (lint-plan.mjs outside scope).
- Smoke on this repo's plan: the first order overflowed the cap (6079 chars) and cut Tasks/Format, so the index dropped `scope` and the bundle is ordered by need: Tasks and Format before Roadmap, CONTEXT last (the cut lands there; its path is given).
- `ctx approve` without tasks or phase → `REFUSED: …` line; outside a real repo the .telos/ change list reads `n/a`.
Deviations: none
