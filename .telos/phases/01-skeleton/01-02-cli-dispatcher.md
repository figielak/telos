---
id: 01-02
title: telos CLI dispatcher and repo helpers
type: code
status: done
critical: false
effort: normal
depends: [01-01]
decisions: [D-01, D-02]
scope: [bin/, lib/cli.mjs, lib/repo.mjs, test/cli.test.mjs]
---
## Goal
A `telos` executable that routes subcommands to modules, with help, version,
consistent exit codes and helpers to locate the repo root and `.telos/`.

## Read first
- SPEC.md §2 rule 2 (deterministic work in the CLI)
- 01-CONTEXT.md §Constraints (exit codes)

## Files
- bin/telos (create, executable, `#!/usr/bin/env node`, only imports lib/cli.mjs)
- lib/cli.mjs (create)
- lib/repo.mjs (create)
- test/cli.test.mjs (create)

## Constraints
- argument parsing with `node:util` `parseArgs`, no hand-rolled flag parser
- command registry is a plain object `{ name: { run, help } }` so later phases add one line per command
- `findRoot(cwd)` walks up to the directory containing `.git`; `telosDir(root)` returns `<root>/.telos`
- commands needing `.telos/` print `Telos not initialized. Run /telos:init.` and exit 1

## Tests (write first)
- `telos --version` prints the package.json version, exit 0
- `telos --help` lists registered commands, exit 0
- unknown command → one-line error on stderr, exit 2
- `findRoot` finds the root from a nested dir and returns null outside a repo
- an init-requiring command in a repo without `.telos/` → exit 1 with the message above

## Steps
1. Write tests (spawn `bin/telos` with `execFileSync` in temp dirs).
2. Implement repo helpers, then the dispatcher.

## Acceptance
- [x] all listed tests pass
- [x] `node --test test/cli.test.mjs` → exit 0
- [x] `./bin/telos --help` → exit 0

## Result
- `bin/telos` (extensionless ESM, top-level await) → `main(argv, opts)` in lib/cli.mjs returns the exit code; `opts` injects registry/cwd/streams for unit tests.
- Registry: `commands` object of `{ help, needsTelos?, run(ctx) }`; `ctx = { args, cwd, root, stdout, stderr }`; `UsageError` → exit 2.
- Global flags parsed with `parseArgs` only before the command; args after it go untouched to the command. No command → help on stderr, exit 2.
- Note: extensionless ESM entry needs Node ≥ 20.10 (tested on 24.18); `engines` bumped to `>=20.10` (scope deviation: package.json), D-01 updated.
