<!-- telos-area: commit 27b0d07d0fd8970db052d63d2d0bdb87f3400d07 · 2026-11-16 · paths: bin/, lib/cli.mjs, lib/errors.mjs, lib/init.mjs, lib/budget.mjs, lib/detect.mjs, lib/template.mjs, templates/, package.json, README.md -->
# cli

## Purpose
The `telos` command: dispatch, exit codes, `init`, `budget`, stack detection, templates, the
package (global install) and the user-facing README.

## Entry points
- `bin/telos:1-4` — calls `main()`
- `lib/cli.mjs:25-35` — command registry; `lib/cli.mjs:56-102` — `main()` dispatch and exit codes
- `lib/init.mjs:108` — `init`; `:63` `syncBlock` (AGENTS.md); `:77` `syncImport` (CLAUDE.md)
- `lib/budget.mjs:96` — `measure`; `lib/detect.mjs` — stack and check detection
- `lib/template.mjs` — `render` of `templates/*.md` (`{{key}}`, no logic)

## Invariants
- Exit codes: 0 ok · 1 failure or `.telos/` missing · 2 usage error (`UsageError` → 2).
- A command is one line in `commands`; `needsTelos` commands fail with 1 before `.telos/` exists.
- The CLI never writes to git; `init` is rerun-safe, keeps existing files and plans every write
  first: a start marker without an end marker in AGENTS.md or CLAUDE.md exits 1, writing nothing.
- `bin/telos` imports `../lib/` relative to its real path, so npm's symlinked bin works.
- Every new or changed command gets its README.md row in the same task.

## Decisions
- Seven core commands plus `area` and `stale` (10, 11-02, 12-03) — the memory core needs no workflow commands.
- The rules block lives in AGENTS.md (v5, 14-03), read by Codex and others; CLAUDE.md holds only
  `@AGENTS.md` (Codex resolves no imports, so the block cannot live in CLAUDE.md). An old
  CLAUDE.md block is replaced by the import; a CLAUDE.md symlink to AGENTS.md is left alone.
- The CLI is the product; install outside the plugin is `npm install -g` / `npm link` (14-04).
- Config version 2; `init --force` rewrites a v1 file, dropping removed keys (10-06).

## Rejected
- `accept`, `check`, `lint-plan`, `task`, `profile`, `adr`, `changelog`, `docs-scan` (10) —
  gates and generated docs cost tokens without better results.

## Pitfalls
- A template variable missing from `vars` throws; `test/templates.test.mjs` renders every template.
- `NOT_CODE` in `lib/init.mjs` matches "changelog" as a file name, not the removed feature.
