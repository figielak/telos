---
id: 02-11
title: /telos:quick, /telos:quick-hard and /telos:status skills
type: code
status: approved
critical: false
effort: normal
depends: [02-07, 02-08]
decisions: [D-04, D-09]
scope: [skills/quick/, skills/quick-hard/, skills/status/, shared/quick.md, test/skills.test.mjs, README.md]
---
## Goal
`/telos:quick <description>` makes a small change without a phase (mini-plan → implement →
checks → `<type>(quick)` commit); `/telos:status` shows the status bundle in ≤ 10 lines.

## Read first
- SPEC.md §5.3, §10 (Quick path scope)
- lib/ctx/quick.mjs (bundle of 02-07), lib/ctx/status.mjs:12-21
- shared/do.md (body style from 02-10)

## Files
- shared/quick.md (create)
- skills/quick/SKILL.md (create)
- skills/quick-hard/SKILL.md (create)
- skills/status/SKILL.md (create)
- test/skills.test.mjs (modify)
- README.md (modify: skills table)

## Constraints
- quick = sonnet, quick-hard = opus, status = sonnet
- quick: mini-plan ≤ 5 lines in chat, no plan file, no STATUS change; > ~5 files or unclear scope → stop, suggest `/telos:plan`
- quick runs the bundle's checks (`test_related` or `test`); failing → no commit, report
- quick commits only the changed paths, scope `quick`; no HISTORY in 02 (D-09)
- status: injects `telos ctx status`, no tools beyond `Bash(telos *)`, no file reads

## Tests (write first)
- quick and quick-hard share shared/quick.md and differ only in model
- shared/quick.md names `(quick)`, `/telos:plan`, explicit `git add` and no forbidden git forms
- status injects `telos ctx status` and has allowed-tools `Bash(telos *)` only

## Steps
1. Write tests.
2. shared/quick.md; three SKILL.md files.
3. README rows; `claude plugin validate .`; suite.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] `claude plugin validate .` → exit 0

## Result
