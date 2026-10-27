---
id: 04-10
title: Delete-zone guard
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: [04-01, 04-05, 04-09]
decisions: []       # phase-local, e.g. [D-03]
scope: ["lib/delete-guard.mjs", "hooks/edit-guard.mjs", "test/delete-guard.test.mjs", "README.md"]
---
## Goal
Warn once per path per session when Edit/Write recreates a deleted path, and clear warnings through exact history revert selectors.

## Read first
- SPEC.md §4.1
- SPEC.md §8
- templates/HISTORY.md:4-8 (delete-zone syntax)
- hooks/hooks.json:15-27 (PreToolUse registration)

## Files
- lib/delete-guard.mjs (create)
- hooks/edit-guard.mjs (modify)
- test/delete-guard.test.mjs (create)
- README.md (modify)

## Constraints
- Carry-over #2: delete-zone guard hook (warn once per path per session, next-step hint; `history add revert` drops the entry) + approach lines in plan/quick bundles → SPEC §4.1, §8.
- Approach-line injection is implemented by dependency 04-05; this task proves it works with the same history records.
- Warnings never block, including strict_scope; any separate config/scope denial remains effective.
- Use canonical path matching and sanitized session identity; markers live only under .telos/.cache/; session IDs are never file paths.
- Warn with reason/ref and the exact history revert --path command; do not remove entries automatically. Document hook row.

## Tests (write first)
- Exact deleted path and descendants warn with reason/ref and next-step hint; sibling prefixes and approach-only entries do not.
- Same canonical path/session warns once; different path or session warns independently.
- history add revert with exact path drops only that entry and subsequent edits no longer warn; plan/quick still include remaining approaches.
- strict_scope true does not convert delete-zone warning into a denial; other guards retain precedence.
- Missing/corrupt/unwritable cache or absent session ID still emits warnings without blocking or crashing; hostile session IDs cannot escape .cache.

## Interface
- deleteGuard(root, {path, sessionId}) returns optional warning; consumes 04-01 deleteZoneEntries.
- Use one canonical target/session marker; absent session ID warns without persistent cross-session deduplication.
- Compose warnings in edit-guard output; reuse its normalized path rather than a divergent matcher.

## Edge cases
- Same path in new session → warn again.
- Deleted src/a versus edited src/ab → no match.
- Revert exact deleted root → warning disappears for its descendants.
- Cache unavailable → warning still emitted, no block or crash.

## Steps
1. test/delete-guard.test.mjs: write session, boundary and revert integration tests first.
2. lib/delete-guard.mjs: deleteGuard — match paths and record best-effort per-session warning markers.
3. hooks/edit-guard.mjs: compose deletion warnings without weakening config/scope decisions.
4. README.md: document once-per-session warnings and exact revert selector remediation.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] Carry-over #2 is covered end to end: approach injection, path warning, repeat suppression and explicit revert.

## Result
Added nonblocking Delete-zone warnings with reason/ref, exact shell-quoted revert commands and config/scope denial precedence.
Canonical target/session markers hash session identity; absent IDs and unavailable, corrupt or symlinked caches keep warnings enabled.
All 16 new tests, 26 guard tests and 397 total tests pass; shared history records prove approach injection and exact revert end to end.
Plugin validation passed with CLAUDE.md/icon warnings; full tests use isolated TMPDIR because the environment has /tmp/.git.
Deviations: lib/edit-guard.mjs — expose the existing edit target normalizer so both guards share canonical matching.
