---
id: 02-10
title: /telos:do and /telos:do-hard skills
type: code
status: approved
critical: false
effort: hard
depends: [02-04, 02-06, 02-09]
decisions: [D-03, D-04, D-05, D-08]
scope: [skills/do/, skills/do-hard/, shared/do.md, test/skills.test.mjs, README.md]
---
## Goal
`/telos:do [id]` executes one approved task from its bundle (tests → implement → `telos accept`
→ Result → STATUS → one commit); `/telos:do-hard` is the opus variant with the same body.

## Read first
- SPEC.md §5.1, §5.0 (per-task hint, escalation), §10, §4.3.1 (Result, Files rows)
- lib/ctx/do.mjs (bundle head of 02-06)
- shared/plan.md (variant pattern from 02-08)

## Files
- shared/do.md (create)
- skills/do/SKILL.md (create)
- skills/do-hard/SKILL.md (create)
- test/skills.test.mjs (modify)
- README.md (modify: skills table)

## Constraints
- do = sonnet, do-hard = opus; allowed-tools as SPEC §13 skill pattern (+ injection entry from 02-08)
- shared/do.md ≤ 70 lines; uses only the bundle, opens other files only via Read-first notes
- max 2 fix attempts, then blocked (SPEC §5.1); never commit failing work
- stage only Files + task file + `.telos/STATUS.md` (+ `.telos/ROADMAP.md` on phase end)

## Tests (write first)
- do and do-hard inject `telos ctx do $ARGUMENTS` via the shared body; differ only in model
- shared/do.md names `telos accept`, `telos task set`, `telos status set`, `Deviations:`, `git add` with explicit paths
- shared/do.md contains no `git add -A`, `git add .`, `--no-verify`, `git push`

## Interface
Flow of shared/do.md:
```
0 REFUSED → report, stop. HINT effort hard (base skill only) → suggest /telos:do-hard <id>, stop unless user said continue
1 telos task set <id> status=in-progress; telos status set task=<id> next="<step>"
2 type code: tests from "Tests" → run (fail = RED) → implement → run
  type doc: edit listed docs → doc checks if configured; type audit: inspect → findings, no code edits
3 telos accept <id>; FAIL → fix (≤ 2) → still FAIL → step 6b
4 Edit Result: 3–5 lines (audit ≤ 10) + "Deviations: none | path — why"; tick verified boxes
5 telos task set <id> status=done; telos status add recent "<id> done: …";
  telos status set task=<next|none> next=…; last task of phase + minimal → telos roadmap set <NN> done
6a git add <Files> <task file> .telos/STATUS.md [.telos/ROADMAP.md]; git commit "<type>(<id>): …" + 2–4 bullets
6b blocked: telos task set <id> status=blocked; telos status set blockers="<id>: reason" next="/telos:do-hard <id>"; no commit
7 reply ≤ 10 lines
```

## Edge cases
- `accept` FAIL only on SCOPE → either revert the out-of-scope edit or record it in Deviations, rerun
- MANUAL items → agent checks and ticks them; unverifiable → blocked
- in-progress task resumed after `/clear` → step 1 skipped when already in-progress
- commit type: code → feat/fix/refactor/test by change, doc/audit → docs
- std+ phase end → roadmap stays active, Next = close phase (`/telos:done`, phase 04)

## Steps
1. Write tests.
2. shared/do.md following the Interface flow.
3. skills/do/SKILL.md, skills/do-hard/SKILL.md (frontmatter + injection).
4. README rows; `claude plugin validate .`; suite.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] `claude plugin validate .` → exit 0

## Result
