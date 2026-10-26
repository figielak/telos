---
id: 04-05
title: Planning and quick memory
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: [04-01, 04-04]
decisions: []       # phase-local, e.g. [D-03]
scope: ["lib/lessons.mjs", "lib/ctx/plan.mjs", "lib/ctx/quick.mjs", "shared/plan.md", "shared/quick.md", "test/ctx-plan.test.mjs", "test/ctx-quick.test.mjs", "test/skills.test.mjs", "README.md"]
---
## Goal
Inject lessons and removed-approach constraints into plan/quick without passing free user text into shell injections.

## Read first
- SPEC.md §4.1
- lib/ctx/plan.mjs:71-88 (plan bundle ordering)
- lib/ctx/quick.mjs:44-59 (quickBundle)
- shared/quick.md:1-25 (request and mini-plan)
- lib/ctx/index.mjs:35-39 (cap)

## Files
- lib/lessons.mjs (modify)
- lib/ctx/plan.mjs (modify)
- lib/ctx/quick.mjs (modify)
- shared/plan.md (modify)
- shared/quick.md (modify)
- test/ctx-plan.test.mjs (modify)
- test/ctx-quick.test.mjs (modify)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- Covers approach-line injection from carry-over #2; full carry-over ownership is 04-10.
- Assumed: ctx quick accepts repeated --area selectors derived by the skill from requested paths/topics; initial injection stays argument-free.
- Before its mini-plan, quick explicitly reruns ctx quick with safely quoted selectors; no raw $ARGUMENTS in any injection or eval.
- Plan includes all lessons and translates relevant ones into task Constraints; quick returns only matching areas; do never reads LESSONS.
- Preserve minimal behavior and ≤6000-char cap; archive is never injected. Document changed CLI bundle and skill rows.

## Tests (write first)
- Plan includes all lessons and all delete-zone approach entries while excluding archived log text.
- Quick matches normalized path-prefix boundaries and exact topic selectors; unrelated lessons are absent.
- No selectors or no matching area yields no lessons; skill derives selectors even when the working tree is clean.
- Quotes/metacharacters in requested text never enter injections; malformed selector arguments give usage failure.
- Long memory input stays capped with explicit omission reporting and preserves request-critical rules/checks; minimal omits standard memory.

## Interface
- ctx quick [--area <path-or-topic>]…; selectors are explicit argv, not interpolated shell request text.
- matchLessons(entries, selectors) matches path-prefix boundaries or exact topics; zero selectors returns [].
- Plan/quick use 04-01 history and 04-04 lesson readers; no direct archive access.

## Edge cases
- Clean tree with requested path → skill-derived selector still includes matching lessons.
- src/a versus src/ab → no false prefix match.
- No selectors → no lesson dump.
- Oversized memory → capped bundle with omissions reported.

## Steps
1. test/ctx-plan.test.mjs and test/ctx-quick.test.mjs: add matching, cap and hostile-text cases first.
2. lib/lessons.mjs: matchLessons — implement deterministic area selection.
3. lib/ctx/plan.mjs and lib/ctx/quick.mjs: add profile-aware memory with safe output budgeting.
4. shared/plan.md and shared/quick.md: propagate constraints and derive safe selector arguments.
5. README.md: document memory behavior and ctx quick selector syntax.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] A clean-tree quick request can obtain matching lessons safely; unrelated lessons and history archives stay out.

## Result
