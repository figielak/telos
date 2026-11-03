---
id: 08-10
title: "Getting Started block, final CTA and footer"
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [08-09]         # task IDs, e.g. [01-01]
decisions: [D-02, D-03, D-05]       # phase-local, e.g. [D-03]
scope: ["website/"]           # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Rebuild Getting Started as one large terminal block with short instructions, add the final CTA before the footer, and remove the meander from the project.

## Read first
- website/src/components/GettingStarted.astro:18-74 (markup)
- website/src/components/Footer.astro:1-29 (links, wordmark)
- website/test/getting-started.test.mjs:14-75 (tests that must keep passing)
- website/test/foundation.test.mjs:105-108 (meander test)
- website/src/components/Meander.astro (file to delete)

## Files
- website/src/components/GettingStarted.astro (modify)
- website/src/components/FinalCta.astro (create)
- website/src/components/Footer.astro (modify)
- website/src/components/Meander.astro (delete)
- website/src/pages/index.astro (modify)
- website/test/getting-started.test.mjs (modify)
- website/test/foundation.test.mjs (modify)
- website/DESIGN.md (modify)

## Constraints
- D-05 replaces the layout rules of the done tasks; those task files stay as they are, and existing tests that encode the old layout change here.
- D-03: copy traces to README, SPEC or code; no statistics, testimonials, logos, cost targets or promises.
- D-02: tokens stay; gold only on CTAs, active elements, small labels and chosen words; no emoji, glows, gradient text or glassmorphism; a frame only around a real group of information.
- Content width `max-w-page` (1200 px), descriptive text 600 to 680 px, no horizontal page scroll; wide content scrolls inside its own container.
- The browser tool leaves `.playwright-mcp/` in the repo root: delete it before `telos accept`, and check accept's real exit code.
- Getting Started: all three install commands in one large terminal-style block with their copy buttons and the `aria-live` status; short instructions and the requirements outside it. Commands stay verbatim from the README.
- Final CTA: `<section id="final-cta">` with an h2 and two links to real resources, the GitHub repository and the README. No comparison or promise in its copy. It sits between Getting Started and the footer.
- Footer uses `Monogram.astro`. Its links, the pre-alpha text and the no-LICENSE-link rule stay.
- Delete `Meander.astro` once no section uses it, and its test; `DESIGN.md` then describes only the monogram and thin lines as Greek references.

## Tests (write first)
- All three commands and all three copy buttons sit inside one block in `#getting-started`; the existing command, button, script and status tests still pass.
- `#final-cta` follows `#getting-started`, comes before `<footer>`, has an h2 and links to the repository and README.
- No source file imports Meander and the file is gone; DESIGN.md does not mention it.
- Every `#anchor` resolves, ids stay unique, and the shared content check passes.

## Steps
- Update `getting-started.test.mjs` and `foundation.test.mjs`, and see them fail.
- Rebuild `GettingStarted.astro` around the single block.
- Create `FinalCta.astro` and mount it.
- Switch the footer to the monogram, delete `Meander.astro` and update `DESIGN.md`.
- Check copy and layout in a browser at 390 and 1440 px.

## Acceptance
- [x] all listed tests pass
- [x] `npm --prefix website test` → exit 0
- [x] Copy still works in a browser, and the block has no page overflow at 390 px

## Result
Getting Started is now one large terminal-style `<figure data-install-block>` (960 px) holding the three README commands, their copy buttons and the single `aria-live` status; requirements and the `/telos:plan`, `/telos:approve`, `/telos:do` steps (plus `/telos:map`) sit outside it. New `FinalCta.astro` (`#final-cta`, h2 "Try it on one phase.", links to the repository and README, no promise) sits between Getting Started and the footer. The footer uses `Monogram.astro` and `max-w-page`; `Meander.astro` is deleted and DESIGN.md now lists only the tau monogram, thin lines and the target motif as Greek references.
Tests: 72 in the site suite (`getting-started.test.mjs` 18 with the install block and final CTA, `foundation.test.mjs` with the meander-gone test), all pass. Browser: copy success, failure and status reset verified with a stubbed clipboard; 1440 px block 960 px wide; at 390 px no page overflow.
RED: node --test website/test/getting-started.test.mjs website/test/foundation.test.mjs → exit 1: 7 of 30 failed on the install block, final CTA, footer monogram and meander-gone assertions.
Surprises: at 390 px the commands were cut off with inner scrollbars, so they now wrap and the Copy button sits under each command until `sm`. DESIGN.md also named the meander in the colour table and intro, both updated.
Deviations: none
