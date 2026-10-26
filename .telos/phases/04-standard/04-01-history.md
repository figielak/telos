---
id: 04-01
title: History and delete-zone storage
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: true
effort: hard        # normal | hard
depends: []
decisions: []       # phase-local, e.g. [D-03]
scope: ["lib/history.mjs", "lib/cli.mjs", "templates/HISTORY.md", "test/history.test.mjs", "README.md"]
---
## Goal
Add the deterministic HISTORY writer and reusable delete-zone reader, preserving unrotated entries while archiving old Log entries.

## Read first
- SPEC.md §4.1
- templates/HISTORY.md:1-16 (canonical history format)
- lib/config.mjs:95-134 (config access and profile gate)
- lib/cli.mjs:24-33 (command registry)

## Files
- lib/history.mjs (create)
- lib/cli.mjs (modify)
- templates/HISTORY.md (modify)
- test/history.test.mjs (create)
- README.md (modify)

## Constraints
- Carry-over #1: `telos history add <kind> <ref> "<text>"` + Log rotation to HISTORY-archive.md → SPEC §4.1, templates/HISTORY.md.
- Assumed: optional --path or --approach identifies a single delete-zone target for remove/revert; without a selector, revert only logs.
- Validate all input and destination files before mutation; use staged writes and recoverable archive-first ordering; no git writes.
- Use existing config profile gates; standard/deep only. Preserve comments and unrelated sections; document the command and selector syntax in README.

## Tests (write first)
- Valid kinds/refs produce newest-first dated entries; invalid kind/ref, multiline text or invalid selector leaves files unchanged.
- Overflow rotates only oldest Log entries, retaining existing archive and all Delete-zone bytes.
- remove with --path/--approach records the target; revert removes only that exact target and logs why.
- Revert without a selector adds a log entry but clears no delete-zone entries.
- Missing or malformed HISTORY/archive, or injected write failure, preserves recoverable original entries and reports failure.
- Minimal profile refuses without mutation; path normalization rejects traversal and absolute/outside-repo targets.

## Interface
- history add <kind> <ref> <text> [--path <relative-path> | --approach <text>]; exit 0 success, 1 operation/profile failure, 2 usage.
- Export readHistory(root), deleteZoneEntries(root) and addHistory(root, entry); entries expose path/approach, reason, ref and date.
- A selector is valid only for remove/revert; exact normalized path or exact approach text selects entries, never a broad ref match.

## Edge cases
- Overflow → archive only old Log entries; Delete-zone stays intact.
- Revert without selector → log only, clear no delete-zone entries.
- Invalid input or unreadable/malformed storage → fail without mutation.
- Interrupted multi-file write → original entries remain recoverable; no silent loss.

## Steps
1. lib/history.mjs: reader — parse canonical sections and validate selectors; write the listed tests first.
2. lib/history.mjs: addHistory — append, rotate and apply exact remove/revert updates with recovery-safe writes.
3. lib/cli.mjs: commands — register history and validate its argument/exit contract.
4. templates/HISTORY.md and README.md: document selectors, rotation and recovery semantics.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] History rotation and revert preserve unrelated entries, with failure-path tests proving no silent loss.

## Result
Added structured HISTORY/Delete-zone readers and `history add` with validated exact selectors and standard/deep profile gates.
Log rotation preserves Delete-zone, comments and unrelated sections; staged, synced archive-first writes retain recoverable entries on failure.
Tests: 293 passed, including 19 history tests; `telos accept 04-01` PASS, scope clean, phase lint and plugin validation passed (two existing configuration warnings).
Used `TMPDIR=/var/tmp` outside the sandbox: this environment's `/tmp/.git` breaks the existing outside-repository test; interrupted writes may leave documented duplicate archive rows.
Deviations: none
