---
id: 07-02
title: Pre-registered benchmark protocol
type: doc           # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: []         # task IDs, e.g. [01-01]
decisions: [D-02, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12]
scope: ["bench/PROTOCOL.md"]
---
## Goal
Write the benchmark protocol before any run: hypotheses with descriptive verdict thresholds, variants, workflows, selection rules, isolation, metrics, analysis, evidence and amendment rules, so results cannot be tuned after the fact.

## Read first
- .telos/phases/07-benchmark/07-CONTEXT.md §Decisions
- BENCHMARK-PLAN-REVIEW.md (external review this protocol must answer)
- .telos/phases/06-measure/06-RESULTS.md (accounting: fresh = input + cache_creation; F8)
- .telos/phases/06-measure/06-WORKFLOW-EVIDENCE.md §Run matrix and accounting method (fixed before the runs)
- SPEC.md §12. Token budget

## Files
- bench/PROTOCOL.md (create)

## Constraints
- D-02: variants A (bare), B (hand-written CLAUDE.md), C (Telos deep), D (Telos standard); 5 repetitions per cell.
- D-04 [proposed]: write the repo and commit selection rules (third repo: public, permissive licence, offline tests < 2 min, real history, third stack, larger than both others), the candidate-list/exclusion format and who does the independent review.
- D-05 [proposed]: write the setup keying `(repo, start, profile)`, per-trajectory setup charging and the full deterministic C/D transition script with its failure outcomes; A/B equivalents.
- D-06 [proposed]: behavioural + regression acceptance, coupling review; primary metric with acceptance rate and all failure costs.
- D-07 [proposed]: pilot scope; final preregistration = the commit made after the pilot (hash + date in PROTOCOL).
- D-08/D-09 [proposed]: isolation-by-construction checklist and canaries; the comparison is labelled "shipped default workflows" with model and permission treatment spelled out.
- D-10/D-11/D-12 [proposed]: B per `(repo, start)` ≤ 400 words and prep time; blocked randomization, cache conditions, deployment horizon; spend cap and per-cell reservation.
- English, plain Markdown; disclose that the Telos author runs it.

## Steps
- Hypotheses (descriptive): H1 on multi-session scenarios C/D cost less per accepted task than B; H2 on single small tasks C/D are not cheaper than B; H3 C/D reduce the exploration proxy; H4 C/D acceptance ≥ B; H5 D costs less than C per accepted task while D's accepted runs ≥ C's minus 1 per task (denominator: the 5 runs of that task). Weighting: every task and every multi-session scenario counts as one unit. Verdicts: "supported" when the paired median difference favours the claim and ≥ 2/3 of units agree, "contradicted" when ≥ 2/3 disagree, else "inconclusive"; no generalisation beyond the measured repos, versions and models.
- Workflows and transitions per D-05/D-09, including do vs do-hard, refusals and blockers; record injected bundles per step (`telos budget --ctx`) because F8 shows standard still receives deep-critical text.
- Run rules: blocked randomization and cache conditions (D-11), isolation and canaries (D-08), infra-failure rule (host error before the first turn → ≤ 2 retries, each retry's cost counted), per-session budget and cap (D-12).
- Metrics and analysis: definitions from D-06 and 07-05 (exploration = narrow proxy, first product-code mutation), medians and IQR, paired differences B−C, A−C, B−D, A−D, C−D, break-even over the deployment horizon (first crossover and sustained).
- Evidence: what is published per run (sanitized event transcripts, patches, grading outputs), the redaction process, and what stays private and why.
- Sections "Amendments" (dated, only before the final preregistration commit) and "Known limitations" (F1–F5, F7, F8 per D-03; sample size; single host version; shipped-workflow comparison).

## Acceptance
- [x] PROTOCOL.md answers every BLOCKER and MAJOR item of BENCHMARK-PLAN-REVIEW.md or names it as a known limitation
- [x] `grep -q "## Amendments" bench/PROTOCOL.md` → exit 0
- [x] `npm test` → exit 0

## Result
bench/PROTOCOL.md (draft, ~3.5K words): disclosure, variants, H1–H5 with unit weighting and supported/contradicted/inconclusive
thresholds, repo/commit selection and review, hidden behavioural + regression acceptance, B rules, isolation checklist and
canaries, setup keying and the full C/D transition script with A/B step equivalents, run/cache/retry/cap/resume rules,
metrics, analysis with horizon break-even, evidence/redaction, known limitations, a §13 map of every review BLOCKER/MAJOR.
Surprise: BENCHMARK-PLAN-REVIEW.md is not in the repo (only in the user's trash); read from there, not restored. npm test green.
Deviations: none
