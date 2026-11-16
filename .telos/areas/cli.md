<!-- telos-area: commit 81b817107d4b937b98e44b11816c113d8891bfb8 · 2026-11-16 · paths: bin/, lib/cli.mjs, lib/errors.mjs, lib/init.mjs, lib/budget.mjs, lib/detect.mjs, lib/template.mjs, templates/, package.json, README.md -->
# cli

## Purpose
The `telos` command: dispatch, exit codes, `init`, `budget`, stack detection, templates, the
package (global install) and the user-facing README.

## Entry points
- `bin/telos:1-4` — calls `main()`
- `lib/cli.mjs:26-37` — command registry; `lib/cli.mjs:58-104` — `main()` dispatch and exit codes
- `lib/init.mjs:121` — `init`; `:63` `syncBlock` (AGENTS.md); `:78` `syncImport` (CLAUDE.md)
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
- Seven core commands plus `area`, `stale` and `resume-test` (10, 11-02, 12-03, 15-04) — the
  memory core needs no workflow commands; `resume-test` has its own area.
- The rules block lives in AGENTS.md (v5, 14-03), read by Codex and others; CLAUDE.md holds only
  `@AGENTS.md` (Codex resolves no imports, so the block cannot live in CLAUDE.md). An old
  CLAUDE.md block is replaced by the import; a symlink between CLAUDE.md and AGENTS.md, either
  way and even dangling, is left alone (`sameFile`, `lib/init.mjs:101`).
- `init` warns on stderr, exit 0, when the block ends past the 32 KiB Codex reads
  (`AGENTS_MAX_BYTES`): the block is appended, so a long AGENTS.md would hide it from Codex.
- README's resume-test sample is the real first run (6/8 vs 6/8), never an invented report.
- The CLI is the product; install outside the plugin is `npm install -g` / `npm link` (14-04).
- Config version 2; `init --force` rewrites a v1 file, dropping removed keys (10-06).

## Rejected
- `accept`, `check`, `lint-plan`, `task`, `profile`, `adr`, `changelog`, `docs-scan` (10) —
  gates and generated docs cost tokens without better results.

## Pitfalls
- A template variable missing from `vars` throws; `test/templates.test.mjs` renders every template.
- A dangling CLAUDE.md → AGENTS.md link once made `init` overwrite the block with a bare import:
  `existsSync` is false for it, so compare link targets, not only real paths.
- `hasImport` accepts `@AGENTS.md` inside a sentence but not in backticks or `@AGENTS.mdx`.
- `NOT_CODE` in `lib/init.mjs` matches "changelog" as a file name, not the removed feature.
