---
id: 03-01
title: Move Telos planning into the minimal workflow
type: doc
status: approved
critical: false
effort: normal
depends: []
decisions: [D-01]
scope: [.planning/, .telos/, AGENTS.md, CLAUDE.md, .gitignore]
---
## Goal
Bootstrap Telos's own minimal-profile workspace without losing the completed plans or the
phase 03 draft; subsequent tasks run through `/telos:approve` and `/telos:do` variants.

## Read first
- AGENTS.md §Code conventions
- AGENTS.md §Working on a task
- SPEC.md §14
- lib/init.mjs:68-127 (init preserves existing files and adds missing minimal files)
- lib/ctx/do.mjs:119-129 (contextLines reads retained phase CONTEXT)
- templates/PROJECT.md:1-20 (Purpose and Rules limits)

## Files
- .planning/ (delete: source of git mv, not discarded)
- .telos/ (create: moved planning plus config.json, PROJECT.md and MAP.md)
- AGENTS.md (modify)
- CLAUDE.md (create)
- .gitignore (modify)

## Constraints
- Bootstrap only after review/approval of this task; `.telos/` must not already contain a conflicting workspace.
- Run `git mv .planning .telos`, then `bin/telos init --profile minimal`; never use --force.
- Preserve phase 01/02 files and existing ROADMAP/STATUS contents during init, including carry-over and Awaiting user.
- Keep phase CONTEXT files by hand under minimal; replace active AGENTS paths and hand-editing workflow with skills/CLI.
- No CLI or skill behavior changes; state updates after the move use telos commands. This task's reviewed bootstrap precedes `/telos:approve` for 03-02 onward.

## Steps
1. Record the planning tree and STATUS/ROADMAP contents; move it with git mv and run minimal init.
2. Verify config profile and detected test check; if needed set checks.test to `npm test` in the listed config.json, preserving other detections.
3. Fill PROJECT Purpose (first line ≤ 100 chars) and Rules (≤ 10 lines) from AGENTS Code conventions; no stack/check-command duplication.
4. Update AGENTS to `.telos/` paths, `/telos:approve`, `/telos:do`/do-hard, CLI status transitions and retained CONTEXT; verify init rerun preserves the workspace.
5. Run checks, tick Acceptance, fill Result; use `telos task set 03-01 status=done`, `telos status add recent` and `telos status set phase=03-map task=none next="/telos:approve"`; commit this task's explicit paths only.

## Acceptance
- [ ] `npm test` → exit 0
- [ ] `bin/telos lint-plan 03` → exit 0
- [ ] `bin/telos status` → exit 0
- [ ] All planning files survived the move; `.planning/` is absent and config.profile is minimal with checks.test = npm test.
- [ ] Init rerun preserves plans, filled PROJECT, MAP and STATUS, with one CLAUDE block and one cache ignore line.
- [ ] AGENTS names the CLI/skill workflow; CONTEXT stays available; Next is /telos:approve and pending question IDs remain intact.

## Result
