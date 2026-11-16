<!-- telos-area: commit 5afe8f252ac208b25bfeddf191ef5476312c1e49 · 2026-11-16 · paths: lib/phases.mjs, lib/frontmatter.mjs, lib/config.mjs, lib/repo.mjs, lib/history.mjs, lib/git.mjs, lib/status.mjs, lib/roadmap.mjs -->
# state

## Purpose
Memory files and their writers: STATUS, ROADMAP, HISTORY, phase files, config, git reads.

## Entry points
- `lib/status.mjs:146` — `telos status`; `:114` `view`; `:39` `setLines`
- `lib/roadmap.mjs:87` — `telos roadmap`; `:41` `phaseLine`
- `lib/history.mjs:278` — `telos history`; `:196` `deleteZoneEntries`; `:249` `addHistory`
- `lib/phases.mjs:68` — `checklist`; `:81` `phaseSkeleton`; `lib/config.mjs:96` — `load`

## Invariants
- ROADMAP, STATUS and HISTORY change only through `telos`, never by hand.
- Phase plans are read only via `lib/phases.mjs`, frontmatter only via `lib/frontmatter.mjs`.
- `lib/git.mjs` only reads git (status, log, diff, rev-parse).
- Config is version 2; a v1 file loads through `upgrade` (`lib/config.mjs:84`).

## Decisions
- One phase = one checklist file `.telos/phases/NN-name.md` (10) — no task files.
- Decisions and removals go to HISTORY; the Delete-zone is never rotated, the Log rotates into
  `HISTORY-archive.md` over `limits.history_entries`.

## Rejected
- Per-task files with frontmatter and a plan linter (10) — a phase is one checklist file.
- Profiles, ADR journal, task undo through tagged commits (10) — see HISTORY Delete-zone.
- A separate LESSONS file (10) — standing lessons go to PROJECT.md Conventions.

## Pitfalls
- `profile` survives only as a dropped v1 config key and a legacy HISTORY kind; keep parsing it.
- An interrupted HISTORY write may leave Log rows duplicated in the archive.
