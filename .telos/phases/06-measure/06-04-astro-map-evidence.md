---
id: 06-04
title: Astro map and refresh measurements
type: doc
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal
depends: [06-01, 06-03]
decisions: [D-02]
scope: [".telos/phases/06-measure/06-ASTRO-EVIDENCE.md"]
---
## Goal
Record real headless map/map-hard and refresh evidence on the user-selected Astro repository at pinned revisions.

## Read first
- SPEC.md §6. `map` (existing repositories)
- SPEC.md §12. Token budget
- .telos/phases/03-map/03-CONTEXT.md:14-17 (D-07 and D-09 evidence carry-over)
- shared/map.md:6-52 (map modes, validation and headless behavior)
- test/e2e-map.test.mjs:12-13 (offline proof boundary)
- .telos/phases/06-measure/06-CONTEXT.md §Constraints

## Files
- .telos/phases/06-measure/06-ASTRO-EVIDENCE.md (create)

## Constraints
- Carry-over #1 (Astro portion): headless map/refresh proof on one real Astro and one real Python repo at pinned revisions (map + map-hard, evidence, §12 usage) → 03-CONTEXT D-09, D-07.
- D-02 [proposed]: measure two real repositories with the same recorded protocol; compare variants at identical revisions and keep estimates distinct from actual usage.
- User will provide repositories and revisions; do not invent them. Confirm exact source and refresh commits before live runs; use disposable copies and leave original repositories untouched.
- Record Telos and host versions, model IDs, profile, commands, input/output/cache token fields separately, cache conditions, failures and evidence locations. Missing host usage is UNVERIFIED.
- Do not replace live headless outputs with authored fixtures. Keep raw transcripts outside tracked files; include sanitized excerpts/digests sufficient to audit the report.
- Headless map asks nothing and does not commit; use existing revision pairs for refresh, recording actual mode and preserving authored PROJECT content.



## Steps
- Pin the supplied Astro source/revisions and prepare isolated baseline copies; record the reproducible run manifest.
- Run map and map-hard separately on the same baseline; record budget output, actual usage and validation results without blending cache or output token categories.
- Run refresh for each variant against the pinned changed revision; compare untouched MAP blocks byte for byte and record noop/incremental/full mode honestly.
- Spot-check at least five MAP navigation references per variant against source, verify PROJECT preservation, and compare measured usage with SPEC §12.

## Acceptance
- [x] `npm test` → exit 0
- [x] The Astro report pins real repository/Telos revisions and includes full-build and refresh evidence for both variants.
- [x] MAP validation, configured limit, navigation spot-checks and refresh preservation are recorded with actual results.
- [x] Missing access/usage, failed runs and target misses remain explicit; absent real runs cannot be labeled PASS.

## Result
- Live headless runs on knml.edu.pl (baseline 2a47a6d, refresh 8d29d1d): full build PASS for map (sonnet, 800/1500) and map-hard (opus, 789/1500); usage fields recorded separately in .telos/phases/06-measure/06-ASTRO-EVIDENCE.md.
- Refresh FAILED on both variants: `telos ctx map --refresh` REFUSED (glob `src/sections/*.astro`; bracket route `[...slug].astro`), so no refresh mode, byte compare or 3–8K target was measured; MAP/PROJECT stayed byte-identical.
- Spot-checks: map-hard 5/5 OK, map 3/5 (two non-repo-relative paths that validation still passed); `map` build ≈71K fresh+output tokens vs ~15–30K target = MISS (one run each).
- Follow-ups proposed: align build/refresh reference syntax; make validation check path existence. `npm test` 587/587.
Deviations: none
