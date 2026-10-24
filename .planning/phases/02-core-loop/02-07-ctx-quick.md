---
id: 02-07
title: telos ctx quick bundle
type: code
status: done
critical: false
effort: normal
depends: [02-04]
decisions: [D-09]
scope: [lib/ctx/quick.mjs, lib/ctx/index.mjs, test/ctx-quick.test.mjs, README.md]
---
## Goal
`telos ctx quick <description>` gives `/telos:quick` the minimum to make a small change safely:
rules, stack, checks and the working-tree state.

## Read first
- SPEC.md §5.3, §4.1 (Lessons readers)
- lib/ctx/index.mjs:17-53 (bundles, cap)
- lib/git.mjs (Interface of 02-04)

## Files
- lib/ctx/quick.mjs (create)
- lib/ctx/index.mjs (modify: register `quick`)
- test/ctx-quick.test.mjs (create)
- README.md (modify: `telos ctx quick` row)

## Constraints
- sections: description; STATUS Phase/Task (so quick does not collide with an in-progress task); PROJECT §Rules; stack line; checks (`test_related`, `test`, `lint`, `typecheck` when set); `git status --short` (max 20 lines); size guard text "≤ ~5 files, else /telos:plan"
- area-matched lessons and delete-zone approach lines are 04 (D-09); leave a `// 04:` marker where they plug in
- empty description → `REFUSED: describe the change`

## Tests (write first)
- bundle contains description, Rules, stack line and configured checks only
- dirty tree shows its files; clean tree shows `clean`
- an `in-progress` task is named in the bundle
- empty description → `REFUSED:` line
- ≤ 6000 chars, no HTML comments

## Steps
1. Write tests (temp git repo from the telos-phase fixture).
2. lib/ctx/quick.mjs; register; README row; run the suite.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0

## Result
- lib/ctx/quick.mjs `quickBundle` (registered as `ctx quick`): change, current phase/task, Rules, stack, quick checks, working tree, size guard; 6 tests, suite 164/164.
- "typecheck" from the plan is the config key `types` (SPEC §4.5); `build`/`e2e` are left out as too slow for quick. The tree list caps at 20 with `- … N more`.
- An in-progress current task gets "keep quick changes out of its files"; the `// 04:` marker shows where lessons and delete-zone lines plug in.
Deviations: none
