<!-- telos-area: commit 81b817107d4b937b98e44b11816c113d8891bfb8 · 2026-11-16 · paths: lib/phases.mjs, lib/frontmatter.mjs, lib/config.mjs, lib/repo.mjs, lib/history.mjs, lib/git.mjs, lib/status.mjs, lib/roadmap.mjs -->
# state

## Purpose
Memory files and their writers: STATUS, ROADMAP, HISTORY, phase files, config, git reads.

## Entry points
- `lib/status.mjs:147` — `telos status` (view plus area lines); `:115` `view`; `:40` `setLines`
- `lib/git.mjs:94` `commitLog`, `:111` `diffNumstat`, `:129` `diffNameStatus` — delta reads
- `lib/roadmap.mjs:87` — `telos roadmap`; `:41` `phaseLine`
- `lib/history.mjs:281` — `telos history`; `:199` `deleteZoneEntries`; `:252` `addHistory`
- `lib/phases.mjs:68` — `checklist`; `:81` `phaseSkeleton`; `lib/config.mjs:96` — `load`

## Invariants
- ROADMAP, STATUS and HISTORY change only through `telos`, never by hand.
- Phase plans are read only via `lib/phases.mjs`, frontmatter only via `lib/frontmatter.mjs`.
- `lib/git.mjs` only reads git (status, log, diff, rev-parse); each call ≤ 64 MiB and 10 s.
- `porcelainFiles` lists both paths of an uncommitted rename (the old one is gone).
- Config is version 2; a v1 file loads through `upgrade` (`lib/config.mjs:84`).

## Decisions
- One phase = one checklist file NN-name.md in `.telos/phases/` (10) — no task files.
- Decisions and removals go to HISTORY; the Delete-zone is never rotated, the Log rotates into
  `HISTORY-archive.md` over `limits.history_entries`.

## Rejected
- Per-task files with frontmatter and a plan linter (10) — a phase is one checklist file.
- Profiles, ADR journal, task undo through tagged commits (10) — see HISTORY Delete-zone.
- A separate LESSONS file (10) — standing lessons go to PROJECT.md Conventions.

## Pitfalls
- `profile` survives only as a dropped v1 config key and a legacy HISTORY kind; keep parsing it.
- An interrupted HISTORY write may leave Log rows duplicated in the archive.
