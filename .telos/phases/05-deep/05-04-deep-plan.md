---
id: 05-04
title: Research-informed deep planning
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [05-03]
decisions: [D-06]
scope: ["lib/ctx/plan.mjs","shared/plan.md","shared/revise.md","test/ctx-plan.test.mjs","test/skills.test.mjs","README.md"]
---
## Goal
Feed existing research into deep planning and add one self-critique pass before the draft is presented.

## Read first
- SPEC.md §5.2
- SPEC.md §3
- lib/ctx/plan.mjs:42-95 (planBundle budgets and target research location)

## Files
- lib/ctx/plan.mjs (modify)
- shared/plan.md (modify)
- shared/revise.md (modify)
- test/ctx-plan.test.mjs (modify)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- D-06 [proposed]: treat the bounded report as evidence, not confirmed decisions; omitted material gets a precise report pointer.
- Deep only: exactly one self-critique pass for risks, missing tests, task size and edge cases; no extra agent or checker loop.
- No automatic research invocation; missing research is optional, not an approval gate.
- Keep the single clarification round; newly surfaced blocking questions go to CONTEXT and Awaiting user through CLI.
- Preserve minimal/standard behavior and proposed-decision approval gates; bundle ≤6000 chars.
- Update README plan/plan-lite, revise/revise-lite and ctx plan rows for deep behavior.

## Tests (write first)
- Deep target research is included under cap with explicit omission pointers; other phases' reports are not injected.
- Minimal/standard and deep-without-research preserve existing planning behavior.
- Plan and revise share one deep self-critique pass, no automatic research/re-review and no second question round.
- Research recommendations remain proposed until confirmed; unresolved critique items are surfaced before approval.

## Steps
1. Write focused bundle and shared-instruction tests for profile branches and cap pressure.
2. Extend planBundle with a bounded target-report excerpt and fallback pointer.
3. Add one deep critique step to plan/revise without changing ordinary drafting or state transitions.
4. Update the changed skill and bundle rows in README.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] Deep planning uses optional research and one critique pass without promoting its assumptions to decisions.

## Result
