---
id: 02-14
title: End-to-end core loop in a minimal test repo
type: code
status: done
critical: false
effort: normal
depends: [02-10, 02-11, 02-12, 02-13]
decisions: [D-11]
scope: [test/e2e-core-loop.test.mjs, test/fixtures/minimal-loop/]
---
## Goal
Prove the phase's done-criterion: a minimal phase runs from plan to commits in a test repo,
once at CLI level in `npm test` and once headless through the skills.

## Read first
- SPEC.md §5.1, §10, §14 (02-core-loop row)
- 01-09 Result (headless `claude -p --plugin-dir` notes)

## Files
- test/fixtures/minimal-loop/ (create: tiny node package, `npm test` via node:test, one failing-to-exist feature)
- test/e2e-core-loop.test.mjs (create)

## Constraints
- the automated test calls only `telos` and `git` (the test plays the skills' git part); no model, no network
- the headless run is manual and recorded in Result (D-11), not part of `npm test`

## Tests (write first)
- init minimal → `roadmap add` → 2× `task new` + filled bodies → `lint-plan` exit 0
- approve sequence: `task set … approved`, `roadmap set 01 active`, commit `docs(telos): plan phase 01-…`, tag `telos/01-start`
- `ctx do` picks 01-01; implement fixture change; `accept 01-01` exit 0; commit `feat(01-01): …`
- `ctx do` picks 01-02 only after 01-01 is done; `accept` fails on an out-of-scope file until it is in Deviations
- after the last task: `roadmap set 01 done`; `git log --grep "^[a-z]*(01-0[12]):"` finds both commits; tree clean
- git guard `check` rejects `git add .` from the same flow

## Steps
1. Fixture package and the scripted test above.
2. Manual: copy the fixture to a temp git repo, `claude -p --plugin-dir <telos>`: `/telos:init minimal`, `/telos:plan "add greeting"`, `/telos:approve`, `/telos:do` per task; then `/telos:quick "fix typo"`, `/telos:status`, `/clear`-resume.
3. Record commits, gaps found and fixes (as Deviations) in Result.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] headless run ends with ROADMAP `[done]`, one commit per task with scope `NN-MM`, tag `telos/01-start`
- [x] SessionStart output after `/clear` names the next step

## Result
- test/fixtures/minimal-loop (node package, `node --test`) + test/e2e-core-loop.test.mjs: 6 ordered steps play init → plan → approve → do ×2 with `telos` and `git` only (RED before implement, depends refusal, SCOPE FAIL until Deviations, guard rejects `git add .`); suite 197/197.
- Surprise: the fixture's nested `node --test` reported as a child of the runner (NODE_TEST_CONTEXT); the test unsets it only around `telos` calls.
- Headless (`claude -p --plugin-dir`, 2026-10-26): `/telos:init minimal` → `/telos:plan` (1 task) → `/telos:approve` (tag `telos/01-start`) → `/telos:do` (`feat(01-01): …`, ROADMAP `[done]`, STATUS next `/telos:plan`) → `/telos:quick` (`docs(quick): …`) → `/telos:status`; clean tree; SessionStart (clear) names `Next: /telos:plan`.
- Gaps: init's Next suggests `/telos:map`, which arrives in 03; headless init/plan could not ask (AskUserQuestion) and took the recommended options.
Deviations: none
