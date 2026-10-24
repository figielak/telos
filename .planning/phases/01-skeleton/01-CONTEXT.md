# 01 · Skeleton
## Goal
Make the repo an installable Claude Code plugin (and its own marketplace) with a
zero-dependency `telos` Node CLI exposing `ctx` and `status`, config loading and
validation, all file templates, stack/check detection, and a working `/telos:init`
that creates `.telos/` for any profile in a test repo. Done when `/telos:init`
works in a test repo (SPEC §14).

## Decisions
- D-01: CLI is plain JavaScript ESM (`.mjs`) with JSDoc types, no build step, no runtime or dev dependencies. Node ≥ 20.10.
- D-02: Tests use `node:test` + `node:assert`; `npm test` = `node --test test/*.test.mjs`. Fixtures live in `test/fixtures/`.
- D-03: Task-file frontmatter uses a minimal YAML subset (scalars, booleans, numbers, inline `[a, b]` arrays, trailing `# comment`). Writes change values in place and keep comments and alignment; anything else is an error.
- D-04: `lib/config.mjs` (defaults + `validate()`) is the single source of the config schema; no separate JSON Schema file in v0.
- D-05: Split work: the CLI does all deterministic work non-interactively (`telos init --profile … --checks …`); the skill only presents results and confirms with the user.
- D-06: Root CLAUDE.md block is wrapped in `<!-- telos:start vN -->` / `<!-- telos:end -->` and replaced in place on re-run (idempotent). Matching ignores `vN`, so any older block is upgraded; the block carries no profile (it lives only in config.json).
- D-07: Detection emits a check command only with evidence (script, dependency, config file, lockfile). No evidence → the key is omitted, never guessed.
- D-08: `init` is safe to re-run: it creates missing files and keeps existing ones (reports created/updated/kept); the CLAUDE.md block is always synced (D-06); `--force` rewrites only `config.json` and allows a profile change.

## Constraints
- Every Telos file template respects the size limits in SPEC §4 (enforced by tests).
- CLI output is compact; `ctx` bundles are hard-capped (default 6000 chars) with a truncation marker.
- Exit codes: 0 ok, 1 failure / not initialized, 2 usage error.
- All files and CLI messages in English.

## Open questions
- Should `init` commit its files? Assumed: no — it prints a suggested `docs(telos): initialize telos` commit.
- ~~Is `bin/` on the Bash PATH?~~ Yes (01-01 Result).
- GitHub owner for marketplace.json (placeholder `OWNER` until known).

## Carried over

## Links
- SPEC.md §4 (files), §4.4 (STATUS), §4.5 (config), §13 (packaging), §14 (roadmap)
