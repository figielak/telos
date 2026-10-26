---
id: 04-03
title: Discuss and phase context
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [04-02]
decisions: []       # phase-local, e.g. [D-03]
scope: ["lib/ctx/discuss.mjs", "lib/ctx/index.mjs", "skills/discuss/SKILL.md", "shared/plan.md", "shared/revise.md", "test/ctx-discuss.test.mjs", "test/skills.test.mjs", "README.md"]
---
## Goal
Add /telos:discuss and make standard planning maintain bounded phase CONTEXT with explicit confirmed/proposed decisions.

## Read first
- SPEC.md §4.3.2
- templates/CONTEXT.md:1-24 (context sections)
- lib/ctx/approve.mjs:34-59 (decision gates)
- lib/ctx/do.mjs:121-130 (contextLines)
- shared/plan.md:18-33 (task drafting)

## Files
- lib/ctx/discuss.mjs (create)
- lib/ctx/index.mjs (modify)
- skills/discuss/SKILL.md (create)
- shared/plan.md (modify)
- shared/revise.md (modify)
- test/ctx-discuss.test.mjs (create)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- Use existing task/frontmatter parsers and phase decision gates; no new parallel decision store.
- discuss uses opus, disable-model-invocation and one fixed injection; phase selection is an explicit validated follow-up command.
- Standard plan creates missing CONTEXT only in the target phase, ≤60 lines; minimal behavior is unchanged.
- Assumed choices are proposed, never silently confirmed; preserve existing IDs and user answers; Awaiting user changes use telos status set.
- README rows cover discuss, its bundle and changed plan/revise behavior.

## Tests (write first)
- Minimal discuss returns exact profile requirement; standard/deep selects current or explicit phase without writing in ctx.
- Unknown/done/dropped target refuses; active target directs changes through revise instead of silently replacing decisions.
- Confirmed/proposed decisions and open questions survive revision; approval/do still refuse referenced proposed decisions.
- Skill creates all CONTEXT sections within 60 lines, records answers/proposals and updates Awaiting user only through CLI.

## Steps
- Write context and skill contract tests for gates, phase selection and decision preservation.
- Build ctx discuss from targeted phase/PROJECT/STATUS data and register it with cap().
- Add discuss instructions for one focused question round, confirmed answers and proposed unresolved choices.
- Update shared plan/revise to maintain CONTEXT and propagate relevant constraints and decision IDs.
- Update README command/bundle rows and run the listed tests.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] Discuss-to-plan instructions preserve phase-local IDs and existing approve/do refusal behavior.

## Result
