---
id: 06-06
title: Measure planning execution and review overhead
type: doc
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal
depends: [06-01, 06-02, 06-03, 06-04, 06-05]
decisions: [D-02]
scope: [".telos/phases/06-measure/06-WORKFLOW-EVIDENCE.md"]
---
## Goal
Measure the remaining SPEC §12 targets on the pinned real repositories and capture evidence for model-default and delete-zone guard decisions.

## Read first
- SPEC.md §12. Token budget
- SPEC.md §15. Open questions
- SPEC.md §8. Hooks
- README.md §Commands (in Claude Code)
- README.md §Hooks
- .telos/phases/06-measure/06-CONTEXT.md §Constraints

## Files
- .telos/phases/06-measure/06-WORKFLOW-EVIDENCE.md (create)

## Constraints
- D-02 [proposed]: reuse the two real repositories; measure one three-task plan, one representative do and one deep phase review per repository. No third repo or broad benchmark platform.
- Measure always-on plugin metadata, SessionStart, CLAUDE block, plan, do overhead and deep phase review; report actual usage separately from the budget proxy.
- Define the do-overhead/code-work boundary before runs; if attribution is unavailable, report total and UNVERIFIED overhead, never subtract a guessed code cost.
- Record versions/model IDs, cache fields, run boundaries, profile, repetitions and failures. Small samples support observations, not statistical superiority claims.
- Compare plan-lite with plan on identical input; inspect shared-injection loading/permissions and a bounded delete-zone warning scenario. Do not change defaults or add a blocking flag here.
- Run only in the disposable copies, retain sanitized evidence, and keep original repositories untouched.



## Steps
- Write the run matrix and token-accounting method before execution; choose bounded three-task changes with observable acceptance in the disposable repositories.
- Capture plugin details and /context plus telos budget; run the three-task plan and one representative do per repository. Review a bounded phase diff from pinned real commits; record preparation and fresh-session boundaries separately.
- Compare plan-lite on the same planning input; record plan quality, shared injection behavior and observed delete-zone warning compliance.
- Tabulate every non-map SPEC §12 target, measured values and unresolved attribution/access limitations.

## Acceptance
- [ ] `npm test` → exit 0
- [ ] Every non-map SPEC §12 target has evidence or an explicit UNVERIFIED limitation, with the measurement method stated.
- [ ] Three-task plan, do-overhead attribution and deep phase review are separately reported for both real repositories.
- [ ] Model/default and delete-zone findings cite observed behavior; no runtime policy has been changed.

## Result
