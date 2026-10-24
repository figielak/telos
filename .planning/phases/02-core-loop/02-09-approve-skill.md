---
id: 02-09
title: /telos:approve skill
type: code
status: approved
critical: false
effort: normal
depends: [02-01, 02-02, 02-05, 02-08]
decisions: [D-03, D-04]
scope: [skills/approve/, test/skills.test.mjs, README.md]
---
## Goal
`/telos:approve` turns a lint-clean draft phase into an active one: tasks approved, ROADMAP
and STATUS updated, one `docs(telos)` commit and the local tag `telos/NN-start`.

## Read first
- skills/init/SKILL.md (pattern)
- SPEC.md §5.2, §10 (rules, phase tags), §4.3.2 (proposed decisions)
- lib/ctx/approve.mjs (bundle of 02-05)

## Files
- skills/approve/SKILL.md (create)
- test/skills.test.mjs (modify)
- README.md (modify: skills table)

## Constraints
- model sonnet; `allowed-tools`: `Bash(telos *)`, `Bash(git status*)`, `Bash(git add *)`, `Bash(git commit *)`, `Bash(git tag telos/*)`
- refuse when lint-plan fails or no draft task exists
- tasks blocked by proposed decisions / *Awaiting user* stay `draft` and are named in the reply
- stage only the phase dir, `.telos/ROADMAP.md`, `.telos/STATUS.md` (explicit paths)
- commit `docs(telos): plan phase NN-name`; then `git tag telos/NN-start`; tag already present → keep it, say so

## Tests (write first)
- approve injects `telos ctx approve`, model sonnet, user-invoked only
- allowed-tools contain the five entries above and no `git push`
- body names `telos task set`, `telos roadmap set`, `git tag telos/`

## Steps
1. Write tests.
2. skills/approve/SKILL.md: refuse → `telos task set <ids> status=approved` → `telos roadmap set NN active` → `telos status set task=<next> next="/telos:do"` → stage → commit → tag → ≤ 5-line reply.
3. README row; `claude plugin validate .`; suite.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] `claude plugin validate .` → exit 0

## Result
