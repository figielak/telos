---
id: 08-08
title: Horizontal Workflow and 2x2 Core features
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [08-07]         # task IDs, e.g. [01-01]
decisions: [D-02, D-03, D-05]       # phase-local, e.g. [D-03]
scope: ["website/"]           # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Turn Workflow into one horizontal process with four stages and Core features into an asymmetric 2 x 2 grid, keeping every claim traceable.

## Read first
- website/src/components/Workflow.astro:1-57 (steps data, markup)
- website/src/components/Features.astro:1-52 (claims to keep)
- website/test/workflow-features.test.mjs:10-49 (tests to change)
- README.md:32-33 (approve, do)
- README.md:174 (telos accept)

## Files
- website/src/components/Workflow.astro (modify)
- website/src/components/Features.astro (modify)
- website/test/workflow-features.test.mjs (modify)

## Constraints
- D-05 replaces the layout rules of the done tasks; those task files stay as they are, and existing tests that encode the old layout change here.
- D-03: copy traces to README, SPEC or code; no statistics, testimonials, logos, cost targets or promises.
- D-02: tokens stay; gold only on CTAs, active elements, small labels and chosen words; no emoji, glows, gradient text or glassmorphism; a frame only around a real group of information.
- Content width `max-w-page` (1200 px), descriptive text 600 to 680 px, no horizontal page scroll; wide content scrolls inside its own container.
- The browser tool leaves `.playwright-mcp/` in the repo root: delete it before `telos accept`, and check accept's real exit code.
- Workflow is an `<ol>` of Plan (`/telos:plan`), Approve (`/telos:approve`), Implement (`/telos:do`, tests first), Verify (`telos accept`). Verify ends with the commit: one per task when `git.auto_commit` is true. The section also states that Telos does not push.
- Horizontal from `lg`, a vertical line of steps below it, with thin connecting lines drawn in CSS. No meander.
- Core features are four items in a 2 x 2 grid with unequal column widths, sized by content: user control (approve gate, scope guard with `strict_scope`, `/telos:undo`), project memory (plain files, 6000 and 1200 character caps), tests (tests first, `telos lint-plan`, `telos accept`), commits (one per task, git guard blocking `git push` and `--no-verify`). Write "user-invoked", never a zero-cost claim.
- Sections use `section-y` and `max-w-page`. One column below `md`.

## Tests (write first)
- `#workflow` has an `<ol>` of four items in the stated order, with "tests first" in the third.
- The Verify item names the commit and `git.auto_commit`; the section says Telos does not push and that skills are user-invoked.
- `#features` has an h2 and exactly four h3 items, in a grid with unequal fractional columns.
- The claims `git push`, `strict_scope`, `6000`, `1200`, `/telos:undo`, `lint-plan` all remain.
- Neither section uses the meander; heading levels and the shared content check still pass.

## Steps
- Update `workflow-features.test.mjs`, dropping the five-step and no-three-column tests, and see it fail.
- Rebuild `Workflow.astro` with the four stages and the responsive line.
- Rebuild `Features.astro`, moving the seven existing claims into four items.
- Check at 390, 768 and 1440 px.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm --prefix website test` → exit 0
- [ ] Workflow reads as one horizontal process at 1440 px and a vertical line at 390 px
- [ ] Each feature claim was checked against its README or SPEC line

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
