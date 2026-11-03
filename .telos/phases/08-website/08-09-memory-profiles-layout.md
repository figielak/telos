---
id: 08-09
title: "Memory before Profiles, with profile cards"
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [08-08]         # task IDs, e.g. [01-01]
decisions: [D-02, D-03, D-05]       # phase-local, e.g. [D-03]
scope: ["website/"]           # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Move Project memory before Profiles, with text left and the file tree right, and replace the profile table with three cards that stack on mobile.

## Read first
- website/src/components/Memory.astro:21-65 (grid and order)
- website/src/components/Profiles.astro:5-42 (table markup)
- website/src/components/Profiles.astro:44-79 (stacked CSS to remove)
- website/src/pages/index.astro (section order)
- website/test/profiles-memory.test.mjs:27-54 (table tests)
- website/test/profiles-memory.test.mjs:87-94 (order test)

## Files
- website/src/components/Memory.astro (modify)
- website/src/components/Profiles.astro (modify)
- website/src/pages/index.astro (modify)
- website/test/profiles-memory.test.mjs (modify)

## Constraints
- D-05 replaces the layout rules of the done tasks; those task files stay as they are, and existing tests that encode the old layout change here.
- D-03: copy traces to README, SPEC or code; no statistics, testimonials, logos, cost targets or promises.
- D-02: tokens stay; gold only on CTAs, active elements, small labels and chosen words; no emoji, glows, gradient text or glassmorphism; a frame only around a real group of information.
- Content width `max-w-page` (1200 px), descriptive text 600 to 680 px, no horizontal page scroll; wide content scrolls inside its own container.
- The browser tool leaves `.playwright-mcp/` in the repo root: delete it before `telos accept`, and check accept's real exit code.
- Order: Hero, Workflow, Core features, Project memory, Profiles.
- Memory: text left, tree right from `md`; the tree shows its limit column without scrolling at 1440 px.
- Profiles: three equal cards side by side from `lg`, stacked below it. Each card is an `h3` with a `<dl>` of the six areas from `src/data/profiles.mjs`, so every value keeps its label without the table. This is the one deliberate row of three cards on the page.
- No profile is highlighted or called recommended: nothing in the README says so. No cost targets; the figures in the earlier sketch stay out (D-03).

## Tests (write first)
- `#memory` comes before `#profiles`, and both follow `#features`.
- `#profiles` has no `<table>`, three `h3` in the order minimal, standard, deep, and three `<dl>` each holding the six labels.
- Every cell of `profiles.mjs` appears in the built section.
- The superset rule and `/telos:profile` remain; the cost-target and memory tests still pass.
- `Memory.astro` no longer uses `md:order-*`, and the text comes before the tree in the HTML.

## Steps
- Update `profiles-memory.test.mjs` and see it fail.
- Swap the order in `index.astro`.
- Rebuild `Memory.astro` with text left and tree right.
- Rebuild `Profiles.astro` as cards and remove the table CSS.
- Check at 390, 768 and 1440 px.

## Acceptance
- [x] all listed tests pass
- [x] `npm --prefix website test` → exit 0
- [x] Profile cards sit side by side at 1440 px and stack at 390 px, and the tree's limit column is fully visible at 1440 px

## Result
Order is now Hero, Workflow, Core features, Project memory, Profiles, Getting started. Memory has the text left and the `.telos/` tree right (text first in the HTML, no `md:order-*`); at 1440 px the tree is 596 px wide and its limit column is fully visible without scrolling. Profiles are three equal cards from `lg` (368 px each at 1440 px), stacked below it, each an `h3` with a `<dl>` of the six areas from `profiles.mjs`; no table, no highlighted profile, no cost targets.
Tests: `profiles-memory.test.mjs` now 13 tests (cards and labels, every cell shown, lg three-column grid, no promotion wording, memory text before tree, section order); 66 in the site suite, all pass. Browser: 1440 px side-by-side cards and visible limits; 768 and 390 px stacked cards; no page overflow.
RED: node --test website/test/profiles-memory.test.mjs → exit 1: 5 of 13 failed on the card, label, grid, text-before-tree and order assertions.
Surprises: the two-column Memory layout starts at `lg` instead of `md` as planned, because at 768 px the tree got 359 px and its limit column scrolled out of view; at 768 px it is a single 703 px column. Both sections now use `section-y` and `max-w-page`.
Deviations: none
