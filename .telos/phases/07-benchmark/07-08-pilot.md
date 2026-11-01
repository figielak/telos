---
id: 07-08
title: Preflight reinstall, isolation canaries and pilot run
type: doc           # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [07-01, 07-06, 07-13]
decisions: [D-03, D-07, D-08, D-09, D-12]
scope: ["bench/PILOT.md", "bench/PROTOCOL.md"]
---
## Goal
Before spending on the full matrix: bring the measured Telos up to date (F9), prove isolation with canaries, run one complete multi-session scenario in C and D and one single task in all four variants, set the per-cell budget, then commit the final preregistration.

## Read first
- bench/PROTOCOL.md (isolation checklist, canaries, transitions, pilot and amendment rules)
- bench/README.md (runner, metrics and report usage)
- .telos/phases/06-measure/06-RESULTS.md §Follow-ups (F6, F8, F9)

## Files
- bench/PILOT.md (create)
- bench/PROTOCOL.md (modify)

## Constraints
- D-03 / F9: reinstall the Telos plugin cache from the pinned commit and record `claude plugin details telos` before and after; C/D sessions load the exported runtime of that same commit.
- D-08 [proposed]: create the dedicated benchmark OS user and its sandbox settings (manual, documented step); canaries: a planted instruction file in an ancestor dir and in the user's home config, a planted memory entry, attempts to read the acceptance dir and to fetch the upstream repository; every canary must be absent from loaded context or fail, in every variant.
- D-07 [proposed]: pilot = one multi-session scenario in C and in D (with do-hard and a `[proposed]` decision exercised if the plan produces them) plus one single task in A/B/C/D, using `--reps 1`; pilot runs are excluded from results.
- D-09 [proposed]: verify per-turn models and denied tool calls from transcripts; record injected bundles per C/D step (`telos budget --ctx`), since F8 shows standard still receives deep-critical text.
- D-12 [proposed]: set `--cell-usd` from the pilot's most expensive cell plus margin; reforecast the full matrix against the $300 cap and record it.
- Lesson [measure]: Run on real repos before trimming prompts: they expose permission and syntax defects that fixtures hide — the pilot uses a real corpus repo, not a fixture.
- Confirm F6 live: one headless deep review in the C pilot copy finishes its diff continuation without a denial.
- Audit the exploration classifier (07-05) on the pilot transcripts; misclassifications go to PROTOCOL amendments.

## Steps
- Reinstall, create the OS user and settings, record versions (Claude Code, model IDs, Telos commit).
- Run the canaries; then `node bench/run.mjs --manifest bench/corpus --reps 1 --only <pilot tasks> --seed <pilot seed> --cap-usd <pilot cap> --cell-usd <n> --out <dir>` and `node bench/report.mjs` on the pilot rows.
- Check transitions, models, permissions, injected bundles, metrics completeness, F6 live review.
- Write bench/PILOT.md (versions, commands, canary results, observations, spend, forecast) and dated PROTOCOL amendments.
- Commit the final preregistration and record its hash and date in PROTOCOL.

## Acceptance
- [ ] PILOT.md shows every canary result per variant, both C and D scenario outcomes, the F6 live check, pilot spend and the reforecast
- [ ] every pilot problem is fixed in an earlier task (reopened) or recorded as a dated PROTOCOL amendment
- [ ] `grep -q "Final preregistration:" bench/PROTOCOL.md` → exit 0
- [ ] `npm test` → exit 0

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
