<!-- telos-area: commit 5afe8f252ac208b25bfeddf191ef5476312c1e49 · 2026-11-16 · paths: lib/map.mjs, lib/map-scan.mjs, lib/map-refresh.mjs, lib/map-budget.mjs, lib/areas.mjs -->
# map

## Purpose
MAP index validation, repo scan, refresh planning and the area files.

## Entry points
- `lib/map.mjs:167` — `inspectMap` (header, Structure/Areas/Find, rows ↔ area files)
- `lib/map-scan.mjs:147` — `scanRepo`; `lib/map-scan.mjs:209` — `renderScan`
- `lib/map-refresh.mjs:66` — `planRefresh` (noop / incremental / full / refused)
- `lib/areas.mjs:110` — `lintArea`; `:138` `loadAreas`; `:184` `areasFor`; `:273` `telos area`

## Invariants
- MAP ≤ `limits.map_tokens` (600), each area ≤ `limits.area_tokens` (800); over the limit is an
  error, never a truncation. Estimate = ceil(chars / 4).
- MAP and area headers carry a full commit hash and a real UTC date.
- Path matching keeps the `/` boundary: `src/a` never matches `src/ab/`.
- Area ownership comes from area headers only; MAP row paths are informational.

## Decisions
- Two-level memory: MAP is a short index, details live in `.telos/areas/<name>.md` (11).
- Refresh is always incremental over index blocks and area files; full only without a valid
  baseline (11-03) — area files hold authored Decisions, Rejected, Pitfalls.
- The scan never executes repository code and excludes lockfiles, binaries and build dirs.

## Rejected
- `###` subsections per area inside MAP (03–10) — MAP outgrew its budget.
- The 30% affected-units rule forcing a full rebuild (03-07) — would overwrite authored areas.

## Pitfalls
- `ctx map` refuses on uncommitted source changes; commit before mapping.
- Write the MAP and area headers from `Header to write` / `Area header`; never invent a hash.
