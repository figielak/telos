---
id: 01-07
title: telos ctx bundle skeleton
type: code
status: draft
critical: false
effort: normal
depends: [01-05, 01-06]
decisions: [D-05]
scope: [lib/ctx/, lib/cli.mjs, test/ctx.test.mjs]
---
## Goal
`telos ctx <cmd> [args]` prints the minimal context bundle for a skill, with a
registry later phases extend; implement `ctx init` and `ctx status` now.

## Read first
- SPEC.md §2 rules 2–3 (bundles via `!` injection)
- SPEC.md §13 skill pattern (`!telos ctx do $ARGUMENTS`)

## Files
- lib/ctx/index.mjs (create: registry, size cap, truncation)
- lib/ctx/init.mjs, lib/ctx/status.mjs (create)
- lib/cli.mjs (modify: register `ctx`)
- test/ctx.test.mjs (create)

## Constraints
- bundles are Markdown, hard-capped at 6000 chars, truncated with `…[truncated by telos ctx]`
- unknown or not-yet-implemented bundle → one line `telos ctx: '<cmd>' not available yet`, exit 0 (must not break a skill's injection)
- `ctx init [profile]`: requested profile, already-initialized flag + existing Telos files, detection result with evidence, CLAUDE.md block present yes/no
- `ctx status`: `telos status` output + file pointers
- bundles never include whole source files

## Tests (write first)
- `ctx init` on astro-ts fixture lists stack, checks and evidence
- `ctx init` in an initialized repo reports existing files
- oversized bundle is truncated with the marker and stays ≤ cap
- `ctx nope` → the one-line message, exit 0

## Steps
1. Write tests, implement registry, then the two bundles.

## Acceptance
- [ ] all listed tests pass
- [ ] `node --test test/ctx.test.mjs` → exit 0

## Result
