---
id: 09-05
title: Publish five complete workflow recipes
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [09-04]    # task IDs, e.g. [01-01]
decisions: [D-01, D-02, D-03, D-04] # phase-local, e.g. [D-03]
scope: [website/src/data/docs/workflows.mjs, website/src/pages/docs/workflows/, website/src/pages/docs/index.astro, website/src/components/Workflow.astro, website/test/docs-workflows.test.mjs] # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Publish five practical recipes connecting commands into complete workflows with explicit prerequisites and stopping points.

## Read first
- README.md §Standard workflow
- README.md §Deep workflow
- website/src/components/Workflow.astro:6-35 (landing workflow explanation)
- website/test/shared-content.mjs:1-31 (text/command checks)
- website/DESIGN.md §Content rule

## Files
- website/src/data/docs/workflows.mjs (create)
- website/src/pages/docs/workflows/index.astro (create)
- website/src/pages/docs/workflows/[slug].astro (create)
- website/src/pages/docs/index.astro (modify)
- website/src/components/Workflow.astro (modify)
- website/test/docs-workflows.test.mjs (create)

## Constraints
- D-04: exactly five initial recipes: quick fix; existing-repository onboarding; standard feature; deep critical feature; change of plan/resume/undo with clearly separate conditional branches.
- D-01/D-03: every recipe states when to choose/avoid it, starting profile/repo/phase/task state, steps and where to run them, expected artifacts/outcomes, checkpoints and links to command details.
- D-02: use the shared static Docs layout, English content and stable URLs; add links from the landing workflow and docs index, with no new dependencies.
- Standard/deep discuss needs an existing phase; deep research needs phase CONTEXT; examples establish them first. Repeat do for actual planned IDs, never imply IDs are guaranteed.
- Mark all scenarios illustrative; distinguish user decisions from automatic behavior and show what to do on blocked/UNVERIFIED outcomes. Undo is an optional confirmed branch, not a routine completion step.
- Minimal onboarding must not end in profile-gated check/done; auto-commit is conditional and no recipe pushes.

## Tests (write first)
- All five recipes build with unique routes and can be reached from docs and the landing workflow.
- Every step references an existing guide command or explicit user action, identifies Bash versus Claude Code, and has an expected outcome/checkpoint.
- Recipe data explicitly establishes required state/profile before discuss/research/do/check/done; undo is optional and confirmed, and blocked work cannot advance.
- Internal links/anchors resolve; step headings and code remain readable in static HTML without JavaScript.
## Interface
   contracts introduced or changed, ≤ 15 lines
## Edge cases
   "- input → expected outcome"
-->

## Steps
- Write recipe coverage, links and prerequisite-regression tests for concrete scenarios.
- Author the five recipes with example prompts, command sequences, expected outputs and conditional stop/resume paths.
- Render the workflow index/detail routes with ordered steps and contextual command links.
- Add landing/docs entry points and manually walk each recipe against source behavior.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm --prefix website test` → exit 0
- [ ] `node --test --test-reporter=dot test/*.test.mjs` → exit 0
- [ ] Five complete recipes cover the agreed scenarios with prerequisites, outcomes, alternative choices and stop conditions.
- [ ] Every recipe can be followed without assuming an unspecified phase, CONTEXT, approval or deep e2e configuration.

## Result

