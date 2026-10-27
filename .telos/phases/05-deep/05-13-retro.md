---
id: 05-13
title: Retrospective and decision promotion
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: [05-10, 05-12]
decisions: [D-04, D-05]
scope: ["lib/ctx/check.mjs","lib/ctx/done.mjs","skills/done/SKILL.md","test/ctx-close.test.mjs","test/skills.test.mjs","README.md"]
---
## Goal
Finish deep close with a short retrospective and retry-safe promotion of hard-to-reverse decisions to ADR-lite.

## Read first
- SPEC.md §11
- SPEC.md §4.3.2
- lib/ctx/check.mjs:23-46 (decision and history state)
- lib/ctx/check.mjs:100-119 (promotion tags and close report)
- skills/done/SKILL.md:33-47 (promotion, record and commit)

## Files
- lib/ctx/check.mjs (modify)
- lib/ctx/done.mjs (modify)
- skills/done/SKILL.md (modify)
- test/ctx-close.test.mjs (modify)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- D-05 [proposed]: retro is a concise deep done step, not a new command/file; summarize lessons and surprises in the phase HISTORY close entry and reply, proposing reusable lessons through /telos:lesson.
- D-05 [proposed]: never auto-add/drop lessons or rewrite PROJECT conventions; a full LESSONS list stays governed by the existing lesson workflow.
- D-04 [proposed]: promote only confirmed hard-to-reverse decisions, reuse identical Source ADRs on retry, and stop on conflicting/non-accepted records instead of inventing a replacement.
- CLI creates ADR headers; skill fills only bounded body sections, Reverse by and Links; HISTORY entry ref is ADR NNN, CONTEXT marker → ADR NNN.
- Detect an existing ADR or history link even when another close step previously failed; markers alone must not hide missing/inconsistent ADRs.
- Standard continues HISTORY-only promotion; all state via CLI; explicit ADR/CONTEXT/HISTORY paths in auto-commit. Update README done/ctx done rows.

## Tests (write first)
- Deep confirmed hard-to-reverse candidate creates/fills ADR, writes one HISTORY link and CONTEXT marker after verification.
- Proposed decision or inconsistent ADR/marker → blocked promotion, no successful-close history.
- Retry after ADR creation, HISTORY linking or CONTEXT marking → reuse completed steps, no duplicate ADR/link.
- Superseded/reverted source ADR → explicit conflict/follow-up, never treated as a new binding accepted decision.
- ADR body over 30 lines or missing Reverse by/Links → stop before successful closure.
- Retro proposes useful lessons without editing LESSONS/PROJECT; standard keeps HISTORY-only promotion.

## Interface
- ctx done promotion states distinguish candidate, ADR-created/body-needed, history-link-needed, marker-needed, promoted and inconsistent.
- Deep promotion order: adr new/reuse → bounded body → history add decision 'ADR NNN' → CONTEXT marker → phase-close record.
- Retro adds a concise summary to the existing phase record and ≤10-line reply; no persistent duplicate decision text.

## Edge cases
- Proposed decision or inconsistent ADR/marker → blocked promotion, no successful-close history.
- Retry after ADR creation, HISTORY linking or CONTEXT marking → reuse completed steps, no duplicate ADR/link.
- Superseded/reverted source ADR → explicit conflict/follow-up, never treated as a new binding accepted decision.
- ADR body over 30 lines or missing Reverse by/Links → stop before successful closure.

## Steps
1. test/ctx-close.test.mjs: write ADR/link/marker retry checkpoints and standard-regression cases first.
2. lib/ctx/check.mjs and lib/ctx/done.mjs: inspect validated ADR state and expose retry-safe promotion actions.
3. skills/done/SKILL.md: add bounded ADR body authoring and CLI history/marker sequencing after verification.
4. skills/done/SKILL.md and test/skills.test.mjs: add a short retro without automatic memory edits.
5. README.md: document deep ADR promotion, retro, retention and recovery behavior.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] Interrupted deep close can resume promotion without duplicate ADRs or HISTORY links, and never auto-confirms proposed decisions.

## Result
