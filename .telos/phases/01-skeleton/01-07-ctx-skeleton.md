---
id: 01-07
title: telos ctx bundle skeleton
type: code
status: done
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
- lib/ctx/stack.mjs (create: `stackLine(root, cfg)`)
- lib/cli.mjs (modify: register `ctx`)
- test/ctx.test.mjs (create)

## Constraints
- bundles are Markdown, hard-capped at 6000 chars, truncated with `…[truncated by telos ctx]`
- unknown or not-yet-implemented bundle → one line `telos ctx: '<cmd>' not available yet`, exit 0 (must not break a skill's injection)
- `ctx init [profile]`: requested profile, already-initialized flag + existing Telos files, detection result with evidence, CLAUDE.md block `present vN | outdated | absent` (outdated = older `vN` or unversioned marker)
- `ctx status`: `telos status` output + file pointers
- bundles never include whole source files
- every injected file excerpt has HTML comments and frontmatter `# comment`s stripped (SPEC §2 rule 3)
- `stackLine(root, cfg)`: one line from `cfg.stack` + `detect(root).versions` (no manifest parsing of its own), e.g. `Stack: astro 5 · typescript 5.6 · node >=22`; unknown version → id only; never written to a file (SPEC §4.1)

## Tests (write first)
- `ctx init` on astro-ts fixture lists stack, checks and evidence
- `ctx init` in an initialized repo reports existing files
- CLAUDE.md block reported as `present v1`, `outdated` (unversioned marker) and `absent`
- oversized bundle is truncated with the marker and stays ≤ cap
- `ctx nope` → the one-line message, exit 0
- an injected STATUS/task excerpt contains no `<!--` and no frontmatter `#` comment
- `stackLine` on astro-ts fixture lists ids with versions; with an empty stack returns `Stack: unknown`

## Steps
1. Write tests, implement registry, then the two bundles.

## Acceptance
- [x] all listed tests pass
- [x] `node --test test/ctx.test.mjs` → exit 0

## Result
- lib/ctx/: registry + `cap` (6000) + `stripComments`/`excerpt`; bundles `init` (profile, git, Telos files, block state, detection with evidence) and `status` (view + stack line + pointers); `stackLine` formats `detect().versions`. 10 tests, suite 54/54.
- `ctx init` on astro-ts = 617 chars. Uninitialized `ctx status` and unknown bundles print one line, exit 0. Every module imports cleanly first (no cycle).
- For 01-08: `BLOCK_START`, `BLOCK_VERSION`, `blockState` exported from lib/ctx/init.mjs.
Deviations: lib/frontmatter.mjs — `splitComment` exported so comment stripping reuses the quote-aware scanner.
