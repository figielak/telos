---
id: 06-07
title: Trim measured prompt and template overhead
type: code
status: draft       # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard
depends: [06-04, 06-05, 06-06]
decisions: [D-03]
scope: ["shared/map.md","shared/plan.md","shared/do.md","shared/review.md","templates/claude-block.md","templates/task.md","test/skills.test.mjs","test/templates.test.mjs","test/budget.test.mjs","README.md",".telos/phases/06-measure/06-TUNING.md"]
---
## Goal
Reduce the largest demonstrated prompt/template overhead without losing workflow gates or navigation quality.

## Read first
- SPEC.md §2. Design principles (token economy rules)
- SPEC.md §12. Token budget
- test/skills.test.mjs:60-100 (variants and shared body contracts)
- test/templates.test.mjs:27-45 (rendering and block budgets)
- templates/claude-block.md:1-12 (always-on block)
- shared/map.md:6-52 (map behavior)
- .telos/phases/06-measure/06-CONTEXT.md §Constraints

## Files
- shared/map.md (modify if measured)
- shared/plan.md (modify if measured)
- shared/do.md (modify if measured)
- shared/review.md (modify if measured)
- templates/claude-block.md (modify if measured)
- templates/task.md (modify if measured)
- test/skills.test.mjs (modify)
- test/templates.test.mjs (modify)
- test/budget.test.mjs (modify if needed)
- README.md (modify)
- .telos/phases/06-measure/06-TUNING.md (create)

## Constraints
- D-03 [proposed]: one evidence-led tuning pass, at most two shared bodies plus one template; preserve models and delete-zone warning policy unless separately approved.
- Use 06-04/05/06 evidence to select files; record baseline first. No general refactor, config changes, cap increase, new checker loop or loss of omission/refusal text.
- Keep user-only skill invocation, shared variants, argument safety, confirmation, scope, TDD/review, doc-sync and retry contracts. Update README rows for every affected skill.
- If nothing can be safely trimmed, record the evidence and limitation instead of making cosmetic changes; larger changes become proposed follow-ups.

## Tests (write first)
- Selected prompts retain their behavioral gates and paired variants still resolve to the same body.
- Representative measured injections remain below existing caps without truncating required instructions; before/after size checks prove selected reductions.
- Templates render with markers and all required task sections; initialization preserves existing authored memory.
- Host refusal, failed validation and refresh preservation cases retain the same safe behavior after shortening.

## Interface
- No CLI or model-default change. Text gets shorter while existing skill/template contracts and output caps remain binding.
- 06-TUNING.md links baseline and rerun evidence by revision, file and metric; token estimates and live usage remain separate.

## Edge cases
- Required gate near a cap → retain the gate and shorten other text, never silently truncate.
- Existing authored memory → remains untouched; generated template still parses/renders.
- Failure/refusal or incremental refresh → same stop/rollback/preservation semantics.

## Steps
1. test/skills.test.mjs and test/templates.test.mjs: selected contracts — add focused regression cases before edits; capture baseline budget rows.
2. Selected shared/template paths: trim duplicate wording only within the measured file limit and preserve contracts.
3. test/budget.test.mjs: rendered sizes — prove reductions and cap compliance without weakening existing checks.
4. 06-TUNING.md: targeted reruns — rerun affected scenarios at the same repository revisions; record usage and quality, including any no-change outcome.
5. README.md: changed skill rows — keep commands accurate and link the measured tuning record.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] At most two shared bodies and one template changed, with before/after measurements or a justified no-change result.
- [ ] Targeted live reruns show preserved behavior; unavailable live verification is explicitly UNVERIFIED.

## Result
