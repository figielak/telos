---
id: 01-02
title: telos CLI dispatcher and repo helpers
type: code
status: draft
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
- [ ] all listed tests pass
- [ ] `node --test test/cli.test.mjs` → exit 0
- [ ] `./bin/telos --help` → exit 0

## Result
