<!-- telos-area: commit 8398de51a6a618345a0e99d7e102ab061a01332b · 2026-11-16 · paths: bin/, lib/cli.mjs, lib/errors.mjs, lib/init.mjs, lib/budget.mjs, lib/detect.mjs, lib/template.mjs, templates/ -->
# cli

## Purpose
The `telos` command: dispatch, exit codes, `init`, `budget`, stack detection and templates.

## Entry points
- `bin/telos:1-4` — calls `main()`
- `lib/cli.mjs:25-35` — command registry; `lib/cli.mjs:56-102` — `main()` dispatch and exit codes
- `lib/init.mjs:66` — `init`; `lib/init.mjs:46` — `syncBlock` for the CLAUDE.md block
- `lib/budget.mjs:97` — `measure`; `lib/detect.mjs` — stack and check detection
- `lib/template.mjs` — `render` of `templates/*.md` (`{{key}}`, no logic)

## Invariants
- Exit codes: 0 ok · 1 failure or `.telos/` missing · 2 usage error (`UsageError` → 2).
- A command is one line in `commands`; `needsTelos` commands fail with 1 before `.telos/` exists.
- The CLI never writes to git; `init` is rerun-safe and keeps existing files.
- Every new or changed command gets its README.md row in the same task.

## Decisions
- Seven core commands plus `area` and `stale` (10, 11-02, 12-03) — the memory core needs no workflow commands.
- CLAUDE.md block carries a `vN` marker and is replaced whole by `syncBlock` — one block, upgradable.
- Config version 2; `init --force` rewrites a v1 file, dropping removed keys (10-06).

## Rejected
- `accept`, `check`, `lint-plan`, `task`, `profile`, `adr`, `changelog`, `docs-scan` (10) —
  gates and generated docs cost tokens without better results.

## Pitfalls
- A template variable missing from `vars` throws; `test/templates.test.mjs` renders every template.
- `NOT_CODE` in `lib/init.mjs` matches "changelog" as a file name, not the removed feature.
