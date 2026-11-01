---
id: 06-08
title: Publish budget results and remaining decisions
type: doc
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal
depends: [06-07]
decisions: [D-02, D-03]
scope: ["README.md","SPEC.md",".telos/phases/06-measure/06-RESULTS.md"]
---
## Goal
Publish a traceable SPEC §12 scorecard and document achieved targets, misses and remaining decisions without overstating coverage.

## Read first
- SPEC.md §12. Token budget
- SPEC.md §14. Build roadmap for Telos itself
- SPEC.md §15. Open questions
- README.md §CLI
- .telos/phases/06-measure/06-CONTEXT.md §Constraints

## Files
- README.md (modify)
- SPEC.md (modify)
- .telos/phases/06-measure/06-RESULTS.md (create)

## Constraints
- D-02 [proposed]: use the two-repository evidence; missing live runs remain UNVERIFIED and cannot erase phase-03 proof carry-over.
- D-03 [proposed]: recommend model defaults and warning/blocking policy from evidence; do not implement unapproved policy or model changes.
- For each target record baseline, tuned result, unit, source/run, status (met/missed/unverified), reason and specific follow-up. Keep historical targets intact.
- Distinguish this phase's report from /telos:done: do not close ROADMAP or edit STATUS/frontmatter by hand.
- No extra benchmark runs beyond targeted gaps justified by the evidence; preserve source outputs and report limitations.



## Steps
- Consolidate the Astro, Python, workflow and tuning evidence into one scorecard covering all seven SPEC §12 targets.
- Document map/headless/refresh proof and separate any unverified host measurements from deterministic checks.
- Record recommendations for model defaults, shared-injection reliability, stack-note size and delete-zone blocking with evidence and explicit unresolved decisions.
- Update README guidance and SPEC measurement notes without rewriting targets; list concrete follow-ups for misses.

## Acceptance
- [x] `npm test` → exit 0
- [x] Every SPEC §12 target is met or documented with evidence, a miss reason or an explicit UNVERIFIED gap.
- [x] Both real-repository map carry-over proofs are traceable; absent proof is visibly outstanding.
- [x] README and SPEC agree with the final CLI behavior and measurements; model/guard decisions are recommendations unless confirmed.

## Result
- Published .telos/phases/06-measure/06-RESULTS.md: all seven §12 targets with baseline = tuned value (06-07 no-change), unit, source, status, reason and follow-up (F1–F9); live = input + cache_creation, output and estimates kept separate.
- Status: always-on, plan and map missed; do overhead and deep review UNVERIFIED; SessionStart and CLAUDE block met by estimate only. Map carry-over: builds proven on both repos; Astro refresh and any incremental refresh remain outstanding.
- SPEC §12 gains a measured-results table (targets untouched) and §15 Q1 a recommendation note (keep opus, warn-only delete-zone; unconfirmed); README budget row links the scorecard. `npm test` 589/589.
Deviations: none
