---
id: 03-06
title: Deterministic refresh impact planning
type: code
status: draft
critical: false
effort: hard
depends: [03-02, 03-03, 03-05]
decisions: [D-04, D-05]
scope: [lib/map-refresh.mjs, lib/git.mjs, test/map-refresh.test.mjs]
---
## Goal
Turn the MAP baseline and committed name-status diff into a deterministic full/incremental/
no-change plan, identifying only affected sections and individual Areas.

## Read first
- SPEC.md §6
- lib/git.mjs:1-17 (git helper and isRepo)
- lib/git.mjs:59-62 (refExists)
- templates/MAP.md:1-22 (fixed sections and Areas)

## Files
- lib/map-refresh.mjs (create)
- lib/git.mjs (modify)
- test/map-refresh.test.mjs (create)

## Constraints
- Use inspectMap and scanRepo contracts from dependencies; never parse tasks/frontmatter or let the model calculate the diff threshold.
- Read `git diff --name-status -z -M <hash>..HEAD --` via argument arrays. Validate the hash; parse rename/copy old and new paths as NUL fields, not whitespace.
- Units/threshold follow D-05; denominator is the number of nonempty editable blocks, not header files n. Use integer comparison `affected * 10 > total * 3`.
- Match exact file refs and directory prefixes with path-component boundaries. Add/delete/rename also updates Structure; match Areas by nearest referenced directory, or report a new unassigned Area candidate.
- No changes to CLI or skills yet; this task returns a read-only plan for 03-07. No relevant diff changes only provenance, never body content.

## Tests (write first)
- Modification affects all referencing sections/Areas and no unrelated Area; src/a does not match src/ab.
- Add/delete/rename/copy with spaced paths preserves old/new fields, selects Structure/related Areas and supplies unmatched additions as new-Area candidates.
- Exactly 3 of 10 units stays incremental; 4 of 10 becomes full; repeated references count a block once.
- Missing/stub/invalid MAP, no usable refs, or missing baseline commit yields full with a reason; unrelated branch history with a valid baseline still uses the specified diff.
- Empty relevant diff yields noop and unchanged body; excluded Telos/build changes do not affect the ratio.
- Git failure for a valid baseline yields refusal rather than false noop; unsupported path/ambiguous MAP references are reported, not silently ignored.

## Interface
- `diffNameStatus(root, hash)` → `{ changes, error }`; each change has status and path, plus oldPath for rename/copy.
- `planRefresh({ map, changes, baselineAvailable, error })` → `{ mode, reason, affected, total, blocks, newAreaPaths }`.
- mode = full | incremental | noop | refused; map is inspectMap output; changes are filtered with the scan exclusions.
- blocks holds unique affected block IDs in MAP order; existing block text/offsets come from inspectMap.
- full on unusable baseline, incremental at ≤30% nonzero impact, noop on no relevant changes, refused on unreadable/ambiguous diff.

## Edge cases
- modified ref or prefix collision → every real referencing block, no accidental prefix match
- add/delete/rename/copy including spaces → correct old/new impact plus Structure/new-Area candidates
- 3/10, 4/10 or duplicate refs → incremental, full or deduplicated ratio
- missing/stub/invalid/unresolvable baseline → explicit full fallback; valid divergent history → diff normally
- empty or excluded-only diff → noop with original body intact
- git error or ambiguous/unsupported refs → refusal with reason, never false no-change success

## Steps
1. test/map-refresh.test.mjs: pure impact tables plus temp-git name-status fixtures for commits, renames, deletions and missing refs.
2. lib/git.mjs: diffNameStatus — validate hash, read NUL output and preserve structured errors.
3. lib/map-refresh.mjs: planRefresh — classify baseline, resolve changed references, compute affected unit set and threshold.
4. lib/map-refresh.mjs: preserve deterministic ordering/reasons for noop, fallback and refusal; run the suite.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] Boundary tests prove strictly >30% rebuild and separate individual Areas; no CLI git writes occur.

## Result
