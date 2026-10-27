---
id: 05-02
title: Reviewer agents and skills
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [05-01]
decisions: [D-01]
scope: ["agents/reviewer.md","agents/reviewer-hard.md","skills/review/SKILL.md","skills/review-hard/SKILL.md","shared/review.md","test/agents.test.mjs","test/skills.test.mjs","README.md"]
---
## Goal
Ship reviewer and reviewer-hard agents plus user-invoked review skills that report one evidence-backed review.

## Read first
- SPEC.md §9
- SPEC.md §5.0
- skills/do-hard/SKILL.md:1-13 (shared-body variant convention)
- lib/ctx/shared.mjs:6-19 (shared instructions lookup)
- test/skills.test.mjs:24-60 (skill and variant contracts)

## Files
- agents/reviewer.md (create)
- agents/reviewer-hard.md (create)
- skills/review/SKILL.md (create)
- skills/review-hard/SKILL.md (create)
- shared/review.md (create)
- test/agents.test.mjs (create)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- D-01 [proposed]: reviewer consumes only prepared evidence and its precise continuations; incomplete coverage is UNVERIFIED, never a clean verdict.
- Sonnet base and Opus hard agent definitions share behavior; forked skill agent names differ deliberately, alongside model metadata.
- Reviewer tools: Read/Grep/Glob and Bash limited to git diff/git log; no edits, network, commits or repository-wide discovery.
- One round; confidence >80%; HIGH/CRITICAL require file:line, scenario and impact; zero findings is valid; output ≤40 lines.
- Add short public-API docstring checks; fixes belong to the caller within its scope, never to reviewer.
- Each skill has disable-model-invocation: true, one fixed context injection, shared instructions injection and Request body; no $ARGUMENTS in shell.
- Update README Commands rows for review/review-hard and explain the read-only agent contract.

## Tests (write first)
- Base/hard definitions use correct models, fork agents and equivalent instructions with the allowed tool restrictions.
- Review output contract requires severity, confidence, evidence, verdict, ≤40 lines and incomplete-coverage disclosure.
- Zero findings is valid; unsupported HIGH/CRITICAL is demoted; one review has no automatic re-review loop.
- Skill injection never interpolates user text; selector validation precedes an explicit ctx review rerun; profile gate stops the workflow.

## Steps
1. Write agent/skill contract tests, distinguishing forked agent-name differences from shared-body equivalence.
2. Create reviewer definitions and shared/review.md around the 05-01 evidence contract.
3. Add the two skill wrappers and extend existing variant checks without weakening other variants.
4. Document both review commands, evidence limits and manual/live-host validation boundaries.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] Both variants provide the same single-round review contract; reviewer cannot modify project files.

## Result
