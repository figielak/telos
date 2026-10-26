---
id: 04-02
title: Profile switching
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: true
effort: hard        # normal | hard
depends: [04-01]
decisions: []       # phase-local, e.g. [D-03]
scope: ["lib/profile.mjs", "lib/cli.mjs", "lib/ctx/profile.mjs", "lib/ctx/index.mjs", "skills/profile/SKILL.md", "test/profile.test.mjs", "test/skills.test.mjs", "README.md"]
---
## Goal
Switch existing repositories between profiles without losing planning files or overwriting repository configuration, and expose /telos:profile.

## Read first
- SPEC.md §3
- lib/config.mjs:95-134 (load, write, atLeast, requireMessage)
- lib/init.mjs:34-46 (profileFiles)
- lib/init.mjs:93-112 (preflight writes)
- lib/ctx/index.mjs:23-33 (bundle registry)

## Files
- lib/profile.mjs (create)
- lib/cli.mjs (modify)
- lib/ctx/profile.mjs (create)
- lib/ctx/index.mjs (modify)
- skills/profile/SKILL.md (create)
- test/profile.test.mjs (create)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- Assumed: downgrade retains HISTORY, LESSONS, CONTEXT and decisions; only feature availability changes.
- Preserve every non-profile config value and CLAUDE.md byte; create only missing target-profile files, including decisions/ for deep.
- No re-detection of stack/checks and no init --force; use the history API for profile entries when HISTORY exists.
- Skill is user-invoked, sonnet, with one fixed context injection; requested profile stays in its body. Document CLI, skill and bundle rows.

## Tests (write first)
- minimal→standard creates HISTORY/LESSONS; standard→deep creates decisions/; subsequent downgrade retains all files and content.
- Repeated same-profile request is idempotent and does not append duplicate history.
- Unknown profile, invalid config or unwritable destination fails with no false successful switch and preserves original config.
- Switch preserves custom checks, stack, limits, git settings and CLAUDE.md; profile history uses 04-01.
- Profile skill uses fixed injection, body arguments and explicit CLI state changes.

## Interface
- telos profile <minimal|standard|deep>: exit 0 switched/no-op, 1 operational failure, 2 invalid usage.
- ctx profile shows current profile, retained/required files and requested action guidance; never mutates.
- Prepare missing files and history safely before publishing config.profile; failed operation remains retryable.

## Edge cases
- Same profile twice → no duplicate files or history.
- Downgrade → retain higher-profile data and settings.
- Invalid config or write failure → preserve original effective profile and report failure.

## Steps
1. test/profile.test.mjs: write transition, preservation and failure tests first.
2. lib/profile.mjs: switchProfile — preflight changes, provision missing files and record history using 04-01.
3. lib/cli.mjs and lib/ctx/profile.mjs: register command and compact profile bundle.
4. skills/profile/SKILL.md and README.md: describe retained data, perform switch and document all new rows.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] All profile transitions preserve existing project data and keep CLAUDE.md unchanged.

## Result
