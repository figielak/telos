# 11-areas: two-level memory

**Goal.** `MAP.md` becomes a short index. Each area of the project gets its own file,
`.telos/areas/<name>.md`, read only when work touches it. Area files are the project's
living documentation.

**Done when.** `telos area new`, `list` and `show` work; lint enforces limits and sections;
a task bundle loads only the areas matching its paths; `npm test` passes.

## Decisions (defaults)

- D1 Limits: MAP index ≤ 600 estimated tokens, one area ≤ 800 (`limits.map_tokens`,
  `limits.area_tokens`; estimate = chars / 4, as in `lib/map-budget.mjs`).
- D2 Area sections, fixed order: `## Purpose`, `## Entry points`, `## Invariants`,
  `## Decisions` (what and why), `## Rejected`, `## Pitfalls`. Empty sections are allowed;
  missing ones are a lint error.
- D3 Area header, one machine line:
  `<!-- telos-area: commit <sha> · <date> · paths: src/a/, lib/x.mjs -->`. Phase 12 reads it.
- D4 Area names: lowercase `a-z0-9-`, ≤ 30 chars. No nesting; a large area is split in two.
- D5 An area over its limit is a lint failure, never silently truncated.

## Tasks

- [x] **11-01 Area format and parser**
  - `templates/area.md`; `lib/areas.mjs`: parse header (commit, date, paths), sections,
    token estimate; `lintArea()` returns one problem per line.
  - Path matching reuses the `/`-boundary rule (`src/a` never matches `src/ab/`).
  - Accept: `test/areas.test.mjs` covers a valid file, a missing section, an over-limit
    file, a malformed header and boundary matching.

- [x] **11-02 `telos area` command**
  - `telos area new <name> --paths a,b` (creates from template, anchor = HEAD),
    `area list` (name · paths · tokens/limit), `area show <name>`, `area for <path>…`
    (names of matching areas), `area lint` (all areas, exit 1 on problems).
  - Register in `lib/cli.mjs`; README row.
  - Accept: CLI tests for each subcommand and exit codes 0/1/2.

- [x] **11-03 MAP as index**
  - `templates/MAP.md`: `## Structure` (≤ 10 lines), `## Areas` (one row per area:
    `- <name> — one line · <paths>`), `## Find` (task → area or file). `Entry points` and
    `Flows` move into area files.
  - `lib/map.mjs` validation: every `## Areas` row has a file, every area file has a row;
    limit 600. `lib/ctx/map.mjs` and `shared/map.md`: the map skill writes the index and
    creates or updates area files; `--refresh` edits only areas whose paths changed.
  - Accept: `test/map.test.mjs` and `test/e2e-map.test.mjs` pass with the new layout on
    the `astro-ts` and `python-uv` fixtures.

- [x] **11-04 Selective loading**
  - `telos ctx plan [NN] [--area <path>]…`: include whole area files matching the given
    paths, within the 6000-char cap; over the cap, list the remaining areas as
    `Read .telos/areas/<name>.md` pointers. Without selectors: the index only.
  - CLAUDE.md block: "before editing under a path, read its area: `telos area for <path>`".
  - SessionStart adds nothing but `Areas: N`.
  - Accept: a test with three areas shows only the matching one in the bundle.

- [x] **11-05 Migrate this repository**
  - Split the current MAP into areas: `cli`, `bundles`, `map`, `hooks-guards`, `state`.
    Fill Decisions, Rejected and Pitfalls from HISTORY, LESSONS and the phase 10 notes.
  - Accept: `telos area lint` exits 0; `telos budget` shows MAP ≤ 600 est. tokens.

## Notes
- 11-03: `--refresh` no longer falls back to a full build above 30% affected units. Area files
  hold authored Decisions, Rejected and Pitfalls, so a diff selects index blocks and area files
  and is always incremental; full mode remains for a missing, invalid or unanchored MAP.
- 11-03: Areas index rows are `- <name> — text`; their backticked paths are informational. Area
  ownership for refresh and `telos area for` comes from the area file headers only.
- 11-05: this repository: MAP index 286/600 est. tokens, five areas 373–434/800, `telos area lint`
  exits 0; `.telos/config.json` sets `map_tokens` 600. With `--area` the selected
  areas outrank the roadmap: they are added whole first and the roadmap keeps the rows nearest the
  target phase plus a `(N more in .telos/ROADMAP.md)` line, so one area fits here (review fix).
- Review fixes: `telos area lint` also fails on a sub-directory of `.telos/areas/` (D4) and, with a
  built MAP, on `## Areas` rows that do not match the area files; `area new` prints the row to add.
