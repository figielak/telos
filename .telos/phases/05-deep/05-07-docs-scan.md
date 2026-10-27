---
id: 05-07
title: Diff-driven documentation scan
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: []
decisions: [D-03]
scope: ["lib/docs-scan.mjs","lib/cli.mjs","test/docs-scan.test.mjs","README.md"]
---
## Goal
List changed paths and documentation references cheaply so later doc-sync edits only relevant documentation.

## Read first
- SPEC.md §11
- lib/config.mjs:17-26 (configured documentation paths)
- lib/git.mjs:119-140 (diffNameStatus rename-aware changes)
- lib/cli.mjs:27-39 (command registry)

## Files
- lib/docs-scan.mjs (create)
- lib/cli.mjs (modify)
- test/docs-scan.test.mjs (create)
- README.md (modify)

## Constraints
- D-03 [proposed]: docs-scan is a read-only candidate finder, not a semantic completeness checker; match literal changed paths and simple JS/TS exports or Python public definitions.
- D-03 [proposed]: scan configured README/docs.paths, deduplicate matches, use before/after changed source for removed or renamed public symbols; explicitly report unsupported languages and skipped files.
- D-03 [proposed]: phase baseline is telos/NN-start through current work tree; never fall back to arbitrary history. --scope narrows changed paths by literal repo-relative path boundary.
- Bound file bytes, candidate count and report size with visible omissions; never traverse symlinks/outside-repo paths, binaries or generated/vendor trees.
- No dependencies, AST parser framework, network, repository execution or git writes; README CLI row documents syntax, heuristics and limits.

## Tests (write first)
- Changed path or public symbol identifies referencing configured docs with line ranges; unrelated docs are excluded and matches deduplicated.
- Renamed/deleted source → inspect old evidence and retain old-path/symbol doc matches.
- Missing baseline → exit 1 with remedy; invalid NN/scope → exit 2.
- Traversal, symlink or external configured doc path → rejected/skipped explicitly, no external reads.
- Binary, oversized or unsupported source and report overflow → visible omissions, no claim of full coverage.
- Scoped scan honors path boundaries and includes relevant staged/unstaged/untracked source changes; no match is a valid empty report.

## Interface
- docs-scan [NN] [--scope path]… defaults to STATUS phase; read-only deep-only CLI, unavailable profile → exit 1 with exact deep message.
- scanDocs(root, options) returns baseline, changed paths, symbol candidates, doc matches {path,start,end,reasons} and omissions.
- renderDocsScan produces ≤6000 chars with completeness/omission status retained.

## Edge cases
- Renamed/deleted source → inspect old evidence and retain old-path/symbol doc matches.
- Missing baseline → exit 1 with remedy; invalid NN/scope → exit 2.
- Traversal, symlink or external configured doc path → rejected/skipped explicitly, no external reads.
- Binary, oversized or unsupported source and report overflow → visible omissions, no claim of full coverage.

## Steps
1. test/docs-scan.test.mjs: write isolated phase-tag, rename, public-symbol and path-safety cases first.
2. lib/docs-scan.mjs: scanDocs — collect before/after diff evidence and inspect bounded configured document candidates.
3. lib/docs-scan.mjs: renderer/command — report precise matches and omissions without claiming semantic coverage.
4. lib/cli.mjs and README.md: register/document docs-scan and its read-only deep gate.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] Scan output identifies only candidate docs with evidence and makes every resource/coverage limit explicit.

## Result
