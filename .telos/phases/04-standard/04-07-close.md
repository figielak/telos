---
id: 04-07
title: Check and phase close
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: [04-01, 04-03, 04-06]
decisions: []       # phase-local, e.g. [D-03]
scope: ["lib/ctx/check.mjs", "lib/ctx/done.mjs", "lib/ctx/index.mjs", "skills/check/SKILL.md", "skills/done/SKILL.md", "test/ctx-close.test.mjs", "test/skills.test.mjs", "README.md"]
---
## Goal
Add /telos:check and /telos:done so standard phases close only after full checks and acceptance, with decision promotion and phase history.

## Read first
- SPEC.md §5
- SPEC.md §4.3.2
- lib/ctx/approve.mjs:62-84 (phase bundle pattern)
- lib/accept.mjs:68-80 (machine/manual acceptance)
- shared/do.md:31-38 (standard phase hand-off)

## Files
- lib/ctx/check.mjs (create)
- lib/ctx/done.mjs (create)
- lib/ctx/index.mjs (modify)
- skills/check/SKILL.md (create)
- skills/done/SKILL.md (create)
- test/ctx-close.test.mjs (create)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- One fixed injection per skill, sonnet, standard/deep gate; CLI bundles remain read-only and capped.
- Full check must pass; run accept per completed task and manually verify MANUAL criteria, never equate accept exit 0 with all manual items proven.
- Close only all-done nonempty phases; unresolved questions/decisions and failed checks prevent close; do not hide failures by marking tasks done.
- Promote hard-to-reverse confirmed decisions to HISTORY, mark → HISTORY in CONTEXT; deep ADR/review/retro/doc-sync remain phase 05.
- State changes use telos; respect git.auto_commit and explicit paths, no git writes inside CLI. Update README rows for both skills and bundles.

## Tests (write first)
- Minimal gate, unknown/empty phase, unfinished tasks and unresolved decisions prevent close.
- Full-check failure, acceptance failure or unverified manual item leaves ROADMAP active and writes no phase-close history.
- Successful close records decisions and phase entry, then updates ROADMAP/STATUS and suggests compact/next plan.
- Rerun on done phase or interrupted close does not duplicate history/promotion; git.auto_commit false leaves changes uncommitted.

## Interface
- ctx check [NN] and ctx done [NN] return target, task statuses, checks, acceptance pointers, unresolved decisions and history markers.
- Skills run telos check --level full, telos accept <id>, then explicit manual acceptance review.
- done uses history add, roadmap set NN done and status set; CLI never performs commit/tag operations.

## Edge cases
- Unfinished task or proposed decision → refuse close.
- Manual acceptance unresolved → active phase, no close entry.
- Already closed/retried close → no duplicate history or promotion.
- auto_commit false → valid closed state without commit.

## Steps
1. test/ctx-close.test.mjs: write target/readiness and retry contract tests first.
2. lib/ctx/check.mjs and lib/ctx/done.mjs: implement bounded verification context with explicit refusal reasons.
3. skills/check/SKILL.md: run full checks and acceptance, report unresolved manual work.
4. skills/done/SKILL.md: implement ordered verify/promote/record/close flow and commit policy.
5. README.md and test/skills.test.mjs: document and enforce both workflows.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] Phase close cannot bypass failing checks or manual acceptance, and reruns avoid duplicate history.

## Result
