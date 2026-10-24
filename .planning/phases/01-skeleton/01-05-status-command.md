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
Parse/write the task-file frontmatter subset, and implement `telos status` (view
with live states) plus `status set|add|rm` that maintain STATUS.md (SPEC §4.4).

## Read first
- SPEC.md §4.4 (STATUS format and rules), §4.1 ROADMAP.md (line format)
- SPEC.md §4.3 (task frontmatter fields)
- templates/STATUS.md, templates/task.md

## Files
- lib/frontmatter.mjs (create)
- lib/status.mjs (create)
- lib/cli.mjs (modify: register `status`, needsTelos)
- test/frontmatter.test.mjs, test/status.test.mjs (create)

## Constraints
- STATUS has no frontmatter: fixed prefix lines `Phase:`, `Task:`, `Next:`, `Blockers:`, `Awaiting user:` and lists `## Carry-over`, `## Recent`; HTML comments are preserved untouched
- `status set` keys: `phase`, `task`, `next`, `blockers`, `awaiting`; empty value → `none`; any other key → exit 2
- `status add recent "<line>"` prepends and keeps 3; `status add carry "<line>"` appends, exit 1 when 5 are present; `status rm carry <n>` (1-based); `- none` replaces an emptied list
- `telos status` prints ≤ 15 lines: Awaiting user first when not `none`, then `Phase: <p> [<roadmap status>] · Task: <t> [<task status>]` read live from ROADMAP and the task file (`?` when missing), Next, Blockers, carry-over count, last recent
- frontmatter: subset per D-03; an empty value parses as null; `setField(text, key, value)` edits one line in place, keeping its `# comment`
- STATUS over `limits.status_lines` → warning on stderr, exit 0

## Tests (write first)
- parse templates/task.md (scalars, booleans, `[a, b]`, `[]`, trailing `# comment` ignored, `"*"` quoted string in arrays)
- `setField(status → in-progress)` keeps the comment and every other line byte-identical
- unsupported YAML (nested map, multiline string) → error with line number
- `status set task=01-02 next="run tests"` changes only those lines; comments and lists unchanged
- `status set foo=bar` → exit 2
- `status add recent` keeps 3 newest; `status add carry` on a full list → exit 1; `rm carry 1` on the last item leaves `- none`
- `telos status` shows ROADMAP and task-file states, and the Awaiting user line first when set

## Steps
1. Frontmatter tests + module. 2. Status tests + module. 3. Register command.

## Acceptance
- [ ] all listed tests pass
- [ ] `node --test test/frontmatter.test.mjs test/status.test.mjs` → exit 0

## Result
