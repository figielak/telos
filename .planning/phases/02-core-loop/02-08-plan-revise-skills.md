---
id: 02-08
title: /telos:plan and /telos:revise skills (+ -lite variants)
type: code
status: done
critical: false
effort: hard
depends: [02-02, 02-03, 02-05]
decisions: [D-03, D-04, D-07]
scope: [skills/plan/, skills/plan-lite/, skills/revise/, skills/revise-lite/, shared/plan.md, shared/revise.md, test/skills.test.mjs, README.md]
---
## Goal
`/telos:plan` writes draft task files from the `ctx plan` bundle, lint-clean, and ends with a
≤ 10-line summary; `/telos:revise <notes>` adjusts them. Variants share the bodies (SPEC §5.0).

## Read first
- skills/init/SKILL.md (skill pattern, tone, length)
- test/skills.test.mjs (existing skill checks)
- SPEC.md §5.0, §5.2, §4.3.3, §13 (Skill pattern)

## Files
- shared/plan.md (create)
- shared/revise.md (create)
- skills/plan/SKILL.md (create)
- skills/plan-lite/SKILL.md (create)
- skills/revise/SKILL.md (create)
- skills/revise-lite/SKILL.md (create)
- test/skills.test.mjs (modify)
- README.md (modify: skills table)

## Constraints
- spike first (Q-01): verify that !`cat ${CLAUDE_PLUGIN_ROOT}/shared/plan.md` expands and which `allowed-tools` it needs; if not, add `telos ctx shared <name>` instead and record it in Result
- models: plan, revise = opus; plan-lite, revise-lite = sonnet; all `disable-model-invocation: true`
- `allowed-tools`: `Bash(telos *)` + Edit/Write limited by instructions to `.telos/phases/`; no git
- shared bodies ≤ 60 lines each

## Tests (write first)
- each variant's SKILL.md is frontmatter + one injection of the same shared file as its base
- base and variant differ only in `model` (and `name`/`description`)
- plan and revise inject `telos ctx plan $ARGUMENTS`; telos commands pre-approved
- shared/plan.md mentions `telos lint-plan`, `telos task new`, `telos roadmap set`, `≤ 10 lines`

## Interface
Skill flow (shared/plan.md), every step a CLI call or an edit of a task file:
```
1 read bundle → stop if REFUSED / phase not planned|drafted
2 ask once: AskUserQuestion ≤ 4, only plan-changing + not inferable (§5.2); else "Assumed: …"
3 new phase: telos roadmap add <name> "<goal>" "<done when>"
4 per task: telos task new <NN> <slug> "<title>" → Edit sections; detailed level for hard/critical
5 carry-over for NN → into task Constraints (minimal); telos status rm carry <n>
6 telos lint-plan <NN> → fix until ok (max 3 rounds, then report problems)
7 telos roadmap set <NN> drafted; telos status set phase=<NN-name> task=none next="/telos:approve or /telos:revise"
8 summary ≤ 10 lines: goal, tasks (id + line, [hard]/[critical]), risks, assumptions, open questions
```

## Edge cases
- phase already `active`/`done` → plan refuses, suggests `/telos:revise` or a new phase
- re-plan of a `drafted` phase → keeps existing files, changes via Edit, never duplicates IDs
- revise "split 02-03" → new task via `task new`, depends updated, original kept or `task rm`
- revise on an `active` phase touches only `draft` tasks; approved ones need user confirmation
- lint still failing after 3 rounds → summary lists the problems, status stays drafted

## Steps
1. Spike Q-01 in a temp repo with `claude -p --plugin-dir .`; note the result.
2. test/skills.test.mjs: tests above.
3. shared/plan.md + shared/revise.md following the Interface flow.
4. Four SKILL.md files (frontmatter + `## Context` injection + shared body).
5. README skills table; `claude plugin validate .`; run the suite.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] `claude plugin validate .` → exit 0
- [x] headless `/telos:plan "add greeting"` in a minimal fixture repo writes lint-clean draft tasks

## Result
- skills plan, plan-lite, revise, revise-lite + shared/plan.md (42 lines), shared/revise.md (24); 7 new skill tests, suite 171/171; `claude plugin validate .` passes (icon warning only).
- Spike Q-01 → D-12: `${CLAUDE_PLUGIN_ROOT}` expands, but Claude Code blocks `cat` outside the session's working dirs and the skill aborts before any model turn; fallback `telos ctx shared <name>` added.
- Headless run 1 failed: `$ARGUMENTS` is pasted unquoted into the !`…` shell line, so `greet(name)` broke it (unsafe for any free text) → D-13: plan injects `telos ctx plan` and shows `## Request`; the no-arg bundle adds `New phase: NN`; 02-11 now owns the same fix for quick.
- Headless run 2 (`claude -p`, minimal repo, 7 turns, ~$0.47): roadmap add → task new → Edit → lint ok → drafted + STATUS; task quality good (scope 2 files, tests first, `npm run test` → exit 0). Summary came back in the user's language.
Deviations: lib/ctx/shared.mjs, lib/ctx/index.mjs — `ctx shared` fallback (D-12); lib/ctx/plan.mjs, test/ctx-plan.test.mjs — `New phase:` line for the shell-safe skill (D-13)
