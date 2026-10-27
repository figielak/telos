---
id: 05-08
title: Conventional-commit changelog drafts
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: []
decisions: [D-03]
scope: ["lib/changelog.mjs","lib/cli.mjs","test/changelog.test.mjs","README.md"]
---
## Goal
Draft changelog material from phase conventional commits without changing the changelog or git.

## Read first
- SPEC.md §11
- lib/git.mjs:70-91 (taskCommits and reference validation)
- lib/cli.mjs:27-39 (command registry)

## Files
- lib/changelog.mjs (create)
- lib/cli.mjs (modify)
- test/changelog.test.mjs (create)
- README.md (modify)

## Constraints
- D-03 [proposed]: changelog [NN] emits read-only commit candidates; the skill condenses them to ≤10 lines under an existing version or a date heading without guessing a release version.
- Use the exact phase tag..HEAD range, conventional type/scope and breaking markers; include revert evidence and exclude Telos planning-only bookkeeping from user-facing candidates.
- No repository code execution, shell interpolation, git mutation or changelog file writes; no extra dependencies.
- Deep gate and explicit missing-tag remedy; bounded output with omission count. Update the README CLI row.

## Tests (write first)
- Only phase commits appear, preserving conventional category, breaking markers, revert information and stable ordering.
- Planning-only docs(telos) subjects are excluded; no relevant commits gives a valid empty draft.
- Missing tag/phase and non-deep profile fail without mutation; malformed NN exits 2.
- Multiline or shell-like subjects are rendered as data; oversized history reports omitted candidates.
- Draft leaves configured CHANGELOG, work tree, index and HEAD unchanged.

## Steps
1. Write temporary-repository tests for conventional history selection, boundaries and no-write behavior.
2. Implement changelog draft collection/rendering with read-only git argv and bounded output.
3. Register the CLI and document its distinction between raw candidates and the skill's ≤10-line final entry.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] telos changelog never edits files or invents a release; its output is sufficient for targeted phase-close condensation.

## Result
