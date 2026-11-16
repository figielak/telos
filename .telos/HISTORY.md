# History
<!-- Why things were decided, removed or reverted. Changes themselves live in git. -->

## Delete-zone
<!-- Never rotated. One line each; do not recreate unless the user asks.
     "- `path/` — reason (ref, YYYY-MM-DD)"   ← checked by the edit hook
     "- approach: … — reason (ref, YYYY-MM-DD)" ← injected into the plan bundle
     `history add remove … --path <relative-path>` or `--approach <text>` records one target.
     `history add revert …` clears only its exact selector; no selector means Log only. -->
- approach: Edit-scope and protected-config guards and Stop-time checks — Block only the irreversible; the agent runs checks itself (10, 2026-11-16)
- approach: Task undo through tagged task commits — git revert covers it (10, 2026-11-16)
- approach: Automated doc-sync scans and changelog generation — Documentation is ordinary agent work (10, 2026-11-16)
- approach: ADR journal with promotion from phase decisions — Decisions go to HISTORY; an ADR journal duplicated them (10, 2026-11-16)
- approach: Per-task files with frontmatter and a plan linter — A phase is one checklist file (10, 2026-11-16)
- approach: Separate discuss, approve, check and accept gates — Extra turns and sessions were the main cost in the 07 benchmark (10, 2026-11-16)
- approach: Skill variants with a -lite or -hard model — One model per skill; the user picks a model in the host (10, 2026-11-16)
- approach: Profiles (minimal, standard, deep) that switch features on and off — Ceremony cost tokens without better results (07 benchmark) (10, 2026-11-16)
- `skills/docs` — Doc-sync skill removed (10, 2026-11-16)
- `skills/research` — Research skills removed with the researcher agents (10, 2026-11-16)
- `skills/review` — Review skills removed with the reviewer agents (10, 2026-11-16)
- `skills/profile` — Profiles removed (10, 2026-11-16)
- `skills/init` — Init skill removed; telos init stays as a CLI command (10, 2026-11-16)
- `skills/lesson` — Lessons skill removed; standing lessons go to PROJECT.md Conventions (10, 2026-11-16)
- `skills/undo` — Task undo removed; use git revert (10, 2026-11-16)
- `skills/done` — Replaced by /telos:close (10, 2026-11-16)
- `skills/check` — Separate check gate removed; /telos:close prints the checks the agent runs (10, 2026-11-16)
- `skills/quick` — Quick-change skill removed; a small change is ordinary agent work (10, 2026-11-16)
- `skills/do` — Task execution skill removed; implementing a task is ordinary agent work (10, 2026-11-16)
- `skills/revise` — Plan revision removed; the phase file is edited in place (10, 2026-11-16)
- `skills/approve` — Separate approve gate removed; /telos:plan sets the phase active (10, 2026-11-16)
- `skills/discuss` — Separate discuss gate removed; /telos:plan asks at most one round of questions (10, 2026-11-16)
- `SPEC.md` — Design spec removed; the design lives in README.md and plan/ (10, 2026-11-16)
- `agents` — Reviewer and researcher agents removed; review and research are ordinary agent work (10, 2026-11-16)
- `website` — Landing page removed with the memory-core prune; kept in tag pre-memory-core (10, 2026-11-16)
- `bench` — Benchmark harness, corpus and evidence removed by owner's decision after the 07 results; summary kept outside the repo; results stay in README Benchmark (07, 2026-11-05)

## Log
<!-- Newest first; written by `telos history add`. Over limits.history_entries,
     oldest entries move to HISTORY-archive.md.
     "- YYYY-MM-DD <kind> <ref>: text"
     kinds: decision | phase | revert | remove | quick | init
     ref: NN, NN-MM, quick, telos
     Archive is installed first; after an interrupted write it may duplicate live Log rows. -->
- 2026-11-16 phase 12: closed 12-anchors: telos stale finds changed covered files, unanchored areas and broken refs from git alone; fixture tests pass, SessionStart shows the count
- 2026-11-16 phase 11: closed 11-areas: telos area new/list/show/for/lint work and lint enforces sections and limits; ctx plan --area loads only matching areas; this repo has a 286/600 MAP index and 5 areas; npm test 260/260, e2e 17/17
- 2026-11-16 phase 10: closed 10-prune: 4 skills, config v2 without profile, README 135 lines, removed paths, skills and mechanisms in Delete-zone, npm test 238/238
- 2026-11-16 remove 10: Block only the irreversible; the agent runs checks itself
- 2026-11-16 remove 10: git revert covers it
- 2026-11-16 remove 10: Documentation is ordinary agent work
- 2026-11-16 remove 10: Decisions go to HISTORY; an ADR journal duplicated them
- 2026-11-16 remove 10: A phase is one checklist file
- 2026-11-16 remove 10: Extra turns and sessions were the main cost in the 07 benchmark
- 2026-11-16 remove 10: One model per skill; the user picks a model in the host
- 2026-11-16 remove 10: Ceremony cost tokens without better results (07 benchmark)
- 2026-11-16 remove 10: Doc-sync skill removed
- 2026-11-16 remove 10: Research skills removed with the researcher agents
- 2026-11-16 remove 10: Review skills removed with the reviewer agents
- 2026-11-16 remove 10: Profiles removed
- 2026-11-16 remove 10: Init skill removed; telos init stays as a CLI command
- 2026-11-16 remove 10: Lessons skill removed; standing lessons go to PROJECT.md Conventions
- 2026-11-16 remove 10: Task undo removed; use git revert
- 2026-11-16 remove 10: Replaced by /telos:close
- 2026-11-16 remove 10: Separate check gate removed; /telos:close prints the checks the agent runs
- 2026-11-16 remove 10: Quick-change skill removed; a small change is ordinary agent work
- 2026-11-16 remove 10: Task execution skill removed; implementing a task is ordinary agent work
- 2026-11-16 remove 10: Plan revision removed; the phase file is edited in place
- 2026-11-16 remove 10: Separate approve gate removed; /telos:plan sets the phase active
- 2026-11-16 remove 10: Separate discuss gate removed; /telos:plan asks at most one round of questions
- 2026-11-16 remove 10: Design spec removed; the design lives in README.md and plan/
- 2026-11-16 remove 10: Reviewer and researcher agents removed; review and research are ordinary agent work
- 2026-11-16 remove 10: Landing page removed with the memory-core prune; kept in tag pre-memory-core
- 2026-11-16 phase 09: dropped 09-command-guide: a guide for 24 commands is obsolete because phase 10 cuts Telos to a memory core; phases 10-16 added after the concept review (benchmark showed 2-5x cost with level acceptance)
- 2026-11-05 remove 07: Benchmark harness, corpus and evidence removed by owner's decision after the 07 results; summary kept outside the repo; results stay in README Benchmark
