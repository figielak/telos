---
id: 06-05
title: Python map and refresh measurements
type: doc
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal
depends: [06-01, 06-03]
decisions: [D-02]
scope: [".telos/phases/06-measure/06-PYTHON-EVIDENCE.md"]
---
## Goal
Record real headless map/map-hard and refresh evidence on the user-selected Python repository at pinned revisions.

## Read first
- SPEC.md §6. `map` (existing repositories)
- SPEC.md §12. Token budget
- .telos/phases/03-map/03-CONTEXT.md:14-17 (D-07 and D-09 evidence carry-over)
- shared/map.md:6-52 (map modes, validation and headless behavior)
- test/e2e-map.test.mjs:12-13 (offline proof boundary)
- .telos/phases/06-measure/06-CONTEXT.md §Constraints

## Files
- .telos/phases/06-measure/06-PYTHON-EVIDENCE.md (create)

## Constraints
- Carry-over #1 (Python portion): headless map/refresh proof on one real Astro and one real Python repo at pinned revisions (map + map-hard, evidence, §12 usage) → 03-CONTEXT D-09, D-07.
- D-02 [proposed]: measure two real repositories with the same recorded protocol; compare variants at identical revisions and keep estimates distinct from actual usage.
- User will provide repositories and revisions; do not invent them. Confirm exact source and refresh commits before live runs; use disposable copies and leave original repositories untouched.
- Record Telos and host versions, model IDs, profile, commands, input/output/cache token fields separately, cache conditions, failures and evidence locations. Missing host usage is UNVERIFIED.
- Do not replace live headless outputs with authored fixtures. Keep raw transcripts outside tracked files; include sanitized excerpts/digests sufficient to audit the report.
- Headless map asks nothing and does not commit; use existing revision pairs for refresh, recording actual mode and preserving authored PROJECT content.



## Steps
- Pin the supplied Python source/revisions and prepare isolated baseline copies; record the reproducible run manifest.
- Run map and map-hard separately on the same baseline; record budget output, actual usage and validation results without blending cache or output token categories.
- Run refresh for each variant against the pinned changed revision; compare untouched MAP blocks byte for byte and record noop/incremental/full mode honestly.
- Spot-check at least five MAP navigation references per variant against source, verify PROJECT preservation, and compare measured usage with SPEC §12.

## Acceptance
- [x] `npm test` → exit 0
- [x] The Python report pins real repository/Telos revisions and includes full-build and refresh evidence for both variants.
- [x] MAP validation, configured limit, navigation spot-checks and refresh preservation are recorded with actual results.
- [x] Missing access/usage, failed runs and target misses remain explicit; absent real runs cannot be labeled PASS.

## Result
- Live headless runs on BlueVest (baseline 4063adc, refresh 89d4b09): full build PASS for map (sonnet, 653/1500) and map-hard (opus, 751/1500); both `--refresh` runs fell back to Mode full (9/9 and 9/10 units affected), validated PASS (719 and 901/1500), PROJECT byte-identical. Report: .telos/phases/06-measure/06-PYTHON-EVIDENCE.md.
- Spot-checks 5/5 per variant; all path:range refs resolve (baseline 23/23 and 25/25, refreshed 28/28 and 32/32). §12 targets MISS under the fresh-cache-write+output reading (build ≈51K, refresh ≈50K); noop/incremental refresh and the unchanged-block byte compare were not exercised. `npm test` 588/588.
- Contrast with 06-04: here refresh worked (as full), there it was REFUSED.
Deviations: none
