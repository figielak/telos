<!-- telos-area: commit 61dffd78cf2b6bfda2b3b0457ec9a150a1027c24 · 2026-11-16 · paths: lib/map.mjs, lib/map-scan.mjs, lib/map-refresh.mjs, lib/map-budget.mjs, lib/areas.mjs, lib/stale.mjs, lib/refs.mjs -->
# map

## Purpose
MAP index validation, repo scan, refresh planning, the area files and their staleness.

## Entry points
- `lib/map.mjs:151` — `inspectMap` (header, Structure/Areas/Find, rows ↔ area files)
- `lib/map-scan.mjs:147` — `scanRepo`; `lib/map-scan.mjs:209` — `renderScan`
- `lib/map-refresh.mjs:66` — `planRefresh` (noop / incremental / full / refused)
- `lib/areas.mjs:110` — `lintArea`; `:138` `loadAreas`; `:184` `areasFor`; `:303` `telos area`
- `lib/stale.mjs:28` — `staleAreas` (`telos stale`); `lib/refs.mjs:15` — `parseReference`, `:41` `pathReferences`, `:77` `brokenReferences`

## Invariants
- MAP ≤ `limits.map_tokens` (600), each area ≤ `limits.area_tokens` (800); over the limit is an
  error, never a truncation. Estimate = ceil(chars / 4).
- MAP and area headers carry a full commit hash and a real UTC date.
- Path matching keeps the / boundary: src/a never matches src/ab/.
- Staleness comes from git only: one diff per distinct anchor plus one status; no model call.
- `telos area anchor` refuses while a covered path is uncommitted.
- Area ownership comes from area headers only; MAP row paths are informational.

## Decisions
- Two-level memory: MAP is a short index, details live in `.telos/areas/<name>.md` (11).
- Refresh is always incremental over index blocks and area files; full only without a valid
  baseline (11-03) — area files hold authored Decisions, Rejected, Pitfalls.
- Area bodies: a backticked span is a checked ref only when it is path-like and either has a /
  with its first segment present in the repo, or a :line after a name with an extension; MAP
  keeps the strict rule that every span is a reference (12-02, 12 review).
- The scan never executes repository code and excludes lockfiles, binaries and build dirs.

## Rejected
- `###` subsections per area inside MAP (03–10) — MAP outgrew its budget.
- The 30% affected-units rule forcing a full rebuild (03-07) — would overwrite authored areas.

## Pitfalls
- `ctx map` refuses on uncommitted source changes; commit before mapping.
- A backticked example path under an existing top-level directory is checked as a ref; write
  such examples bare. A ref into a deleted top-level directory is no longer reported.
- An uncommitted rename counts on both sides: the old path makes its area stale.
- Write the MAP and area headers from `Header to write` / `Area header`; never invent a hash.
