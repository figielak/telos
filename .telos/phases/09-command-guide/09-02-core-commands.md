---
id: 09-02
title: Explain everyday Telos commands and model variants
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [09-01]    # task IDs, e.g. [01-01]
decisions: [D-01, D-02, D-03] # phase-local, e.g. [D-03]
scope: [website/src/data/docs/core.mjs, website/test/docs-core.test.mjs] # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Explain everyday Telos skills so a reader can choose a command, supply a useful request and understand its output and limits.

## Read first
- README.md §Commands (in Claude Code)
- README.md §Standard workflow
- website/DESIGN.md §Content rule
- website/test/shared-content.mjs:1-31 (visible text and known-skill checks)

## Files
- website/src/data/docs/core.mjs (modify)
- website/test/docs-core.test.mjs (create)

## Constraints
- D-01/D-03: cover init, profile, map, plan, approve, revise, do, quick and status; make map-hard, plan-lite, revise-lite, do-hard and quick-hard discoverable with stable variant anchors and indexed links.
- D-02: English records rendered by 09-01; follow its schema, without changing the layout or adding dependencies.
- Every base command needs syntax/arguments, profile/state prerequisites, result/effects, at least one concrete example with expected outcome, useful/unsuitable cases, a linked alternative and source links.
- Variant text explains selection and model differences without duplicating the base behavior or promising cost/quality gains; each variant has an invocation example and use/avoid guidance.
- Distinguish new-phase plan from revise on an active phase, quick from scoped do, approval from execution, and map from refresh. Preserve confirmation, git.auto_commit and blocked-task semantics.
- Verify details against only the relevant skill/shared instructions while writing; do not run example mutations in this repository.

## Tests (write first)
- Every listed base and variant is linked from the guide and resolves to rendered documentation with a concrete example and use/avoid guidance.
- Records include required fields and valid profile values; linked alternatives and variant anchors resolve.
- Rendered plan/revise, quick/do and map/refresh explanations preserve their different prerequisites and effects.
## Interface
   contracts introduced or changed, ≤ 15 lines
## Edge cases
   "- input → expected outcome"
-->

## Steps
- Add behavioral content/coverage tests for this explicit command group.
- Inspect the matching skill/shared instructions and fill the core records with practical scenarios.
- Add variant guidance and cross-links for adjacent choices, including quick versus plan and do versus do-hard.
- Compare syntax, profile gates and state/git effects with repository sources and run website checks.

## Acceptance
- [x] all listed tests pass
- [x] `npm --prefix website test` → exit 0
- [x] `node --test --test-reporter=dot test/*.test.mjs` → exit 0
- [x] All ten base skills and five variants have source-backed examples, use/avoid advice and working links.
- [x] Examples identify placeholders and expected outcomes; none implies that an unapproved task can run.

## Result
Filled core.mjs with nine base skill records (init, profile, map, plan, approve, revise, do, quick, status) and five variants (map-hard, plan-lite, revise-lite, do-hard, quick-hard) with examples, outcomes, use/avoid, linked alternatives and sources checked against the skill, shared and bundle files.
New docs-core tests (14) cover coverage, record fields, variant anchors, no cost or quality claims and the plan/revise, quick/do, approve/do and map/refresh distinctions; website suite 122/122 pass.
Variants render under the 09-01 template; the index needed links to their anchors.
Note: the acceptance line says ten base skills; the Constraints list names nine, and all nine are covered.
Deviations: website/src/pages/docs/index.astro — a Variants row under each card links the #variant-<id> anchors ("indexed links"); bench/results/RUNLOG.md — pre-existing phase 07-09 work, not touched and not staged
