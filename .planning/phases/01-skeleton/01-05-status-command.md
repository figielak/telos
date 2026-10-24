---
id: 01-05
title: Frontmatter module and telos status
type: code
status: draft
critical: false
effort: normal
depends: [01-03, 01-04]
decisions: [D-03]
scope: [lib/frontmatter.mjs, lib/status.mjs, lib/cli.mjs, test/frontmatter.test.mjs, test/status.test.mjs]
---
## Goal
Parse/write the frontmatter subset, and implement `telos status` (compact view)
and `telos status set k=v…` (machine-maintained STATUS, SPEC §4.4).

## Read first
- SPEC.md §4.4 (STATUS template and rules)
- SPEC.md §4.3 (task frontmatter fields)

## Files
- lib/frontmatter.mjs (create)
- lib/status.mjs (create)
- lib/cli.mjs (modify: register `status`)
- test/frontmatter.test.mjs, test/status.test.mjs (create)

## Constraints
- `status set` keys: `phase`, `task` (frontmatter), `next`, `blockers` (body lines); `updated` is set to today automatically; any other key → exit 2
- the `Phase: … · Task: …` line is regenerated after every `set`: task state from the task file frontmatter, phase state derived from its tasks (all draft → draft, all done → done, else in progress)
- `telos status` prints ≤ 15 lines, *Awaiting user* first when present
- STATUS over `limits.status_lines` → warning on stderr, exit 0

## Tests (write first)
- frontmatter round-trip of the task template (scalars, booleans, `[a, b]`, `[]`)
- unsupported YAML (nested map, multiline string) → error with line number
- `status set task=01-02` updates frontmatter, `updated`, and the Phase line
- `status set foo=bar` → exit 2
- phase state derivation for draft / mixed / all-done task sets
- `telos status` output starts with the Awaiting user line when set

## Steps
1. Frontmatter tests + module. 2. Status tests + module. 3. Register command.

## Acceptance
- [ ] all listed tests pass
- [ ] `node --test test/frontmatter.test.mjs test/status.test.mjs` → exit 0

## Result
