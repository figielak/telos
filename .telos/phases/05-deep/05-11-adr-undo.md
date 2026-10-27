---
id: 05-11
title: ADR-aware task undo
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: true
effort: hard        # normal | hard
depends: [05-10]
decisions: [D-04]
scope: ["lib/adr.mjs","lib/ctx/undo.mjs","skills/undo/SKILL.md","test/adr.test.mjs","test/ctx-undo.test.mjs","test/skills.test.mjs","README.md"]
---
## Goal
Preview ADR consequences during undo and mark explicitly selected source decisions reverted only after a verified code revert.

## Read first
- SPEC.md §11
- lib/ctx/undo.mjs:48-97 (undo preview and metadata preservation)
- skills/undo/SKILL.md:20-51 (confirmation, revert, verify and state order)
- lib/ctx/check.mjs:23-33 (decision promotion markers)

## Files
- lib/adr.mjs (modify)
- lib/ctx/undo.mjs (modify)
- skills/undo/SKILL.md (modify)
- test/adr.test.mjs (modify)
- test/ctx-undo.test.mjs (modify)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- D-04 [proposed]: map ADR Source NN:D-MM to task.decisions in that phase; unique accepted matches are proposed for reversion, shared matches require explicit ADR-ID selection in the existing confirmation.
- D-04 [proposed]: undo never automatically reactivates an ADR superseded by the reverted one; report the now-nonbinding chain for an explicit follow-up decision.
- CLI alone updates ADR status; retained body/header provenance is unchanged except Status. Do not infer ownership from timestamps or prose.
- Preserve current Telos metadata during git revert, then verify, then apply selected ADR transitions before successful task/HISTORY state; failure stops completion with recovery instructions.
- No extra confirmation round: show hashes, dependent tasks and ADR IDs together; cancellation changes nothing.
- Production CLI never writes git; use lib/tasks.mjs. README rows cover adr revert and changed undo/ctx undo behavior.

## Tests (write first)
- Unique accepted source match appears in undo preview; successful confirmed revert sets reverted (date, task ID) and preserves body.
- Decision shared by several tasks → require explicit ADR selection, no blanket reversion.
- Superseded or previously reverted ADR → no automatic reactivation or destructive status replacement.
- Cancelled confirmation, code conflict or failed checks → no ADR/task/history success transition.
- ADR write failure after code revert → stop before successful undo state/history and report resumable recovery.
- Repeated same adr revert → idempotent; mismatched task/source or malformed selector → refuse without mutation.

## Interface
- adr revert NNN --task NN-MM; deep only, validates the task's phase/decision link; header Status becomes reverted (date, NN-MM).
- ctx undo adds accepted candidates, shared-source warnings and exact selected-status commands within cap().
- Undo confirmation covers exact git hashes and ADR IDs; only selected IDs may change after verification.

## Edge cases
- Decision shared by several tasks → require explicit ADR selection, no blanket reversion.
- Superseded or previously reverted ADR → no automatic reactivation or destructive status replacement.
- Cancelled confirmation, code conflict or failed checks → no ADR/task/history success transition.
- ADR write failure after code revert → stop before successful undo state/history and report resumable recovery.
- Repeated same adr revert → idempotent; mismatched task/source or malformed selector → refuse without mutation.

## Steps
1. test/adr.test.mjs and test/ctx-undo.test.mjs: write unique/shared-source, cancellation and failure/retry cases first.
2. lib/adr.mjs: revertAdr — validate source association and update only the selected header status safely.
3. lib/ctx/undo.mjs: preview candidates and shared-source ambiguity before confirmation.
4. skills/undo/SKILL.md: extend confirmation and post-check state ordering while preserving existing conflict handling.
5. README.md and skill tests: document/enforce the new CLI transition and changed undo contract.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] A failed/cancelled undo changes no ADR status; a successful selected transition never silently restores a superseded decision.

## Result
