# 10-prune: cut Telos to a memory core

**Goal.** Keep the memory files, the map, the SessionStart hook and the git guard. Remove
profiles, model variants, execution gates, ADR, doc-sync, undo, agents and the website.

**Done when.** `skills/` has at most 4 directories; `config.json` has no `profile` key;
`README.md` has at most 200 lines; removed top-level paths, skills and mechanisms are in
HISTORY Delete-zone; `npm test` passes.

Note: the ROADMAP line says "every removed path". Read it as above: individual `lib/` and
`test/` files are not listed, because a later phase may legitimately reuse a file name.

## Decisions (defaults)

- D1 `init` stays as a CLI command only (`telos init`); the `/telos:init` skill goes.
- D2 `quick` goes: a small change is ordinary agent work.
- D3 `lesson` goes; the one existing lesson moves to PROJECT.md §Conventions. Pitfalls get a
  home in area files in phase 11.
- D4 `website/` is deleted, not moved; it stays in the `pre-memory-core` tag.
- D5 `SPEC.md` is deleted; the design lives in README.md and this directory.
- D6 A phase plan is one file, `.telos/phases/NN-name.md` (goal, done when, checklist,
  notes). Existing phase directories 01–09 stay untouched as an archive.
- D7 `telos check` and `telos accept` go; `ctx close` prints the configured check commands
  and the agent runs them directly.
- D8 Config becomes version 2: `stack`, `checks`, `limits`, `git`, `files_language`. The
  loader ignores unknown v1 keys; `telos init --force` rewrites the file.

## Tasks

- [x] **10-01 Remove website and deep features**
  - Remove: `website/`, `agents/`, skills `review`, `review-hard`, `research`,
    `research-hard`, `docs`; `shared/review.md`, `shared/research.md`; `lib/review.mjs`,
    `lib/docs-scan.mjs`, `lib/changelog.mjs`, `lib/adr.mjs`, `lib/ctx/{review,research,docs}.mjs`;
    `templates/adr.md`; their tests, `test/e2e-deep.test.mjs`, `test/fixtures/deep-loop/`.
  - Unregister `adr`, `changelog`, `docs-scan` in `lib/cli.mjs` and the three bundles in
    `lib/ctx/index.mjs`. Drop deep branches from `lib/ctx/{check,done,do,plan,undo}.mjs`
    only as far as needed to compile; those files go in later tasks.
  - Accept: `npm test` passes; `grep -rn "adr\|docs-scan\|changelog" lib/` finds nothing.

- [x] **10-02 Reduce hooks**
  - `hooks/hooks.json`: keep SessionStart (all four matchers) and PreToolUse Bash git guard;
    keep PreToolUse Edit/Write only for the Delete-zone warning. Remove PostToolUse, Stop,
    PreCompact.
  - Remove `hooks/{edited,stop,pre-compact}.mjs`, `lib/{edited,compaction,map-stale}.mjs`;
    reduce `lib/edit-guard.mjs` to `editTarget` (used by `lib/delete-guard.mjs`), dropping
    its imports of `scope`, `lint-plan` and `tasks`; the hook calls the Delete-zone guard
    only. `lib/session.mjs` drops the compaction line.
  - This task comes first among the removals because the edit guard is the last importer
    of the gate modules outside the bundles.
  - Accept: `test/manifest.test.mjs` asserts exactly three hook entries; SessionStart output ≤ 1200 chars.

- [x] **10-03 Close replaces done**
  - Rename skill `done` → `close`; `lib/ctx/done.mjs` (a thin wrapper over
    `lib/ctx/check.mjs`) → a standalone `lib/ctx/close.mjs`: phase state, unfinished work,
    configured check commands, `Auto-commit`, exact closing commands (`roadmap set`,
    `history add phase`, `status set`). Until 10-04 it reads the old task files for
    "unfinished"; 10-04 switches it to the checklist.
  - Instructions: run the checks, stop on failure or unchecked items, then run the closing
    commands. Area updates arrive in phase 13.
  - Accept: `test/ctx-close.test.mjs` covers ready, unchecked item and non-active phase.

- [x] **10-04 Single-file phase plan**
  - New `templates/phase.md`: Goal, Done when, Tasks (checkboxes with `NN-MM`), Notes; ≤ 80 lines.
  - `lib/phases.mjs` replaces `lib/tasks.mjs`: path for a phase, read checklist state
    (done/total), create from template, and the `sections` helper `lib/session.mjs` needs.
    `lib/tasks.mjs` itself is removed in 10-05, once its last importers are gone.
    `lib/frontmatter.mjs` stays (`lib/status.mjs`, `lib/ctx/index.mjs`).
  - Switch `lib/ctx/close.mjs` to the checklist.
  - Rewrite `lib/ctx/plan.mjs` and `shared/plan.md`: bundle = PROJECT Purpose and Rules,
    stack, ROADMAP, target phase line, Delete-zone approaches, MAP `## Find`. Instructions:
    one round of questions at most, write the one phase file, set the phase `active`. No
    lint, no approve step, no commit unless `git.auto_commit`.
  - Accept: test creates a phase file from the template and `ctx plan 10` stays ≤ 6000 chars.

- [x] **10-05 Remove execution gates**
  - Remove skills `discuss`, `approve`, `revise`, `revise-lite`, `do`, `do-hard`, `quick`,
    `quick-hard`, `check`, `undo`, `lesson`, `init`, `profile`, `plan-lite`, `map-hard`;
    `shared/{do,quick,revise}.md`; `lib/{accept,check,lint-plan,lessons,scope,tasks}.mjs`;
    `lib/ctx/{approve,check,discuss,do,lesson,quick,undo,profile}.mjs`; their tests,
    `test/e2e-standard.test.mjs`, `test/e2e-core-loop.test.mjs`, fixtures `standard-loop`,
    `minimal-loop`, `telos-phase`.
  - Unregister `accept`, `check`, `lint-plan`, `task` in `lib/cli.mjs`.
  - Move the lesson from `.telos/LESSONS.md` to PROJECT.md §Conventions; remove
    `templates/LESSONS.md`, `templates/CONTEXT.md`, `templates/task.md`.
  - Accept: `ls skills` shows `close map plan status`; `npm test` passes.

- [ ] **10-06 Remove profiles, config v2**
  - Remove `lib/profile.mjs` and every profile branch (`grep -rn profile lib hooks skills`).
  - `lib/config.mjs`: version 2 keys (D8); drop `profile`, `protected_configs`,
    `strict_scope`, `docs`; `limits.status_lines`, `limits.map_tokens`, `limits.history_entries` stay.
  - `lib/init.mjs` and `lib/ctx/init.mjs`: no profile argument; `ctx init` removed if unused.
  - Rewrite this repo's `.telos/config.json` with `telos init --force`.
  - Accept: `grep -c profile .telos/config.json` is 0; `npm test` passes.

- [ ] **10-07 Docs and Delete-zone**
  - README.md ≤ 200 lines: what it is, install, five-minute walkthrough, command tables,
    hooks, benchmark summary (kept), limits.
  - Delete `SPEC.md`; update `AGENTS.md`, `templates/claude-block.md` (then re-sync
    CLAUDE.md), `CHANGELOG.md`, `.claude-plugin/plugin.json` and `package.json` to 0.2.0.
  - PROJECT.md: new Purpose ("project memory for coding agents, backed by a deterministic
    CLI"), Rules without profile/skill-variant lines, Out of scope gains "workflow gates,
    profiles, model variants, review/research agents".
  - Delete-zone paths: `website`, `agents`, `SPEC.md`. Approaches: profiles; `-lite`/`-hard`
    model variants; separate discuss/approve/check/accept gates; per-task files with lint;
    ADR journal; doc-sync and changelog generation; task undo; edit-scope guards and Stop checks.
  - Accept: `wc -l README.md` ≤ 200; `telos budget` runs; Delete-zone has the entries above.

- [ ] **10-08 Core e2e and verification**
  - New `test/e2e-core.test.mjs`: temp repo → `telos init` → `roadmap add` → phase file →
    `ctx plan` → tick tasks → `ctx close` → closing commands → SessionStart text.
  - Rebuild `.telos/MAP.md` for the reduced tree.
  - Verify *Done when*; record `telos budget` totals and the line counts of `lib/` and
    `test/` in the Notes below.
  - Accept: all *Done when* items hold.

## Notes

- Before: 24 skills, 15 CLI commands, 6 hook entries, ~6.9K lines in `lib/` + `hooks/`.
