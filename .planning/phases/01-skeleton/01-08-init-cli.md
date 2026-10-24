---
id: 01-08
title: telos init (deterministic file creation)
type: code
status: done
critical: false
effort: normal
depends: [01-07]
decisions: [D-05, D-06, D-08]
scope: [lib/init.mjs, lib/cli.mjs, test/init.test.mjs, README.md]
---
## Goal
`telos init --profile <p> [--stack a,b] [--checks <json>] [--force]` creates the
profile's `.telos/` files, config, CLAUDE.md block and gitignore entry, idempotently.

## Read first
- SPEC.md §4 (file tree per profile), §3 Files row
- 01-CONTEXT.md D-06, D-08

## Files
- lib/init.mjs (create)
- lib/cli.mjs (modify: register `init`)
- test/init.test.mjs (create)
- README.md (modify: `telos init` in the CLI table)

## Constraints
- minimal: config.json, PROJECT, MAP (`not built`), ROADMAP, STATUS; standard adds HISTORY, LESSONS; deep adds nothing at init
- no empty directories (git drops them): `phases/` is created by `plan`, `decisions/` by `adr new`
- render vars: PROJECT `name` (from `detect().name`), STATUS `next`, HISTORY `date` + `profile`; MAP, ROADMAP, LESSONS and the CLAUDE block take none; CONTEXT, task and adr are never rendered by init
- `--stack` / `--checks` override detection; without them use `detect()` results
- STATUS `Next:` from repo state: tracked files other than README/LICENSE/dotfiles/manifests → `run /telos:map to map the existing code`, else `plan the first phase with /telos:plan`
- CLAUDE.md: create if missing, else insert or replace the marked block; text outside markers untouched
- block start is matched as `<!-- telos:start` + optional ` vN` + ` -->`, so older versions are replaced
- `.gitignore`: append `.telos/.cache/` once
- existing files kept unless `--force` (only config.json is rewritten; the CLAUDE.md block is always synced, D-08)
- output: created / kept file list + suggested commit `docs(telos): initialize telos`; no git calls

## Tests (write first)
- each profile creates exactly its file set in a temp git repo, and no empty directories
- rerun creates nothing new and reports all as kept
- CLAUDE.md with user content keeps it and gains one block; rerun does not duplicate
- `--checks '{"test":"pytest"}'` lands in config; invalid JSON → exit 2
- `.gitignore` gets the entry once across two runs
- created config passes `validate()`
- `Next:` is `/telos:map` in a repo with a tracked `src/index.ts`, `/telos:plan` in a repo with only README and package.json
- rendered files contain no `{{`

## Steps
1. Write tests, implement, run full suite.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0

## Result
- lib/init.mjs: `init()` plans all writes first (broken CLAUDE.md block → exit 1, nothing written), then creates missing files, keeps existing ones, syncs the block, appends `.telos/.cache/`; 11 tests, suite 65/65; smoke-tested init → rerun → status → ctx init on astro-ts.
- Choices: `--profile` required; a different profile on an initialized repo exits 1 unless `--force`; the CLAUDE.md block is always synced to the shipped version (D-06), `--force` only rewrites config.json.
- `Next` uses a filesystem walk (no git calls), ignoring dotfiles, build dirs, docs, manifests and lockfiles.
Deviations: .planning/phases/01-skeleton/01-CONTEXT.md — D-08 aligned with D-06 (block always synced).
