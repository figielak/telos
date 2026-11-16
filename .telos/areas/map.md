<!-- telos-area: commit 8398de51a6a618345a0e99d7e102ab061a01332b · 2026-11-16 · paths: lib/map.mjs, lib/map-scan.mjs, lib/map-refresh.mjs, lib/map-budget.mjs, lib/areas.mjs, lib/stale.mjs, lib/refs.mjs -->
# map

## Purpose
MAP index validation, repo scan, refresh planning, the area files and their staleness.

## Entry points
- `lib/map.mjs:151` — `inspectMap` (header, Structure/Areas/Find, rows ↔ area files)
- `lib/map-scan.mjs:147` — `scanRepo`; `lib/map-scan.mjs:209` — `renderScan`
- `lib/map-refresh.mjs:66` — `planRefresh` (noop / incremental / full / refused)
- `lib/areas.mjs:110` — `lintArea`; `:138` `loadAreas`; `:184` `areasFor`; `:303` `telos area`
- `lib/stale.mjs:28` — `staleAreas` (`telos stale`); `lib/refs.mjs:15` — `parseReference`, `:39` `pathReferences`

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
- Area bodies: only path-like backticked spans (a / or :line) are checked refs; MAP
  keeps the strict rule that every span is a reference (12-02).
- The scan never executes repository code and excludes lockfiles, binaries and build dirs.

## Rejected
- `###` subsections per area inside MAP (03–10) — MAP outgrew its budget.
- The 30% affected-units rule forcing a full rebuild (03-07) — would overwrite authored areas.

## Pitfalls
- `ctx map` refuses on uncommitted source changes; commit before mapping.
- A backticked example path in an area body is checked as a ref; write examples bare.
- Write the MAP and area headers from `Header to write` / `Area header`; never invent a hash.
