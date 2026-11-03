---
id: 08-07
title: Layout system and centered hero
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [08-05]         # task IDs, e.g. [01-01]
decisions: [D-02, D-03, D-05]       # phase-local, e.g. [D-03]
scope: ["website/"]           # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Set the shared layout rules from D-05 and rebuild the first screen: centered copy, two CTAs and a wide terminal as the main product demonstration.

## Read first
- website/src/components/Hero.astro:1-36 (current split hero)
- website/src/components/Nav.astro:1-41 (links, mobile menu)
- website/src/components/Terminal.astro:6-30 (figure, region)
- website/src/styles/global.css:24-44 (@theme tokens)
- website/test/hero.test.mjs:25-28 (pre-alpha test)
- website/test/hero.test.mjs:85-91 (min-h test)
- website/DESIGN.md §Layout rules

## Files
- website/src/styles/global.css (modify)
- website/src/components/Monogram.astro (create)
- website/src/components/Nav.astro (modify)
- website/src/components/Hero.astro (modify)
- website/src/components/Terminal.astro (modify)
- website/public/favicon.svg (modify)
- website/test/hero.test.mjs (modify)
- website/DESIGN.md (modify)

## Constraints
- D-05 replaces the layout rules of the done tasks; those task files stay as they are, and existing tests that encode the old layout change here.
- D-03: copy traces to README, SPEC or code; no statistics, testimonials, logos, cost targets or promises.
- D-02: tokens stay; gold only on CTAs, active elements, small labels and chosen words; no emoji, glows, gradient text or glassmorphism; a frame only around a real group of information.
- Content width `max-w-page` (1200 px), descriptive text 600 to 680 px, no horizontal page scroll; wide content scrolls inside its own container.
- The browser tool leaves `.playwright-mcp/` in the repo root: delete it before `telos accept`, and check accept's real exit code.
- Copy from the notes: eyebrow `PURPOSE-BUILT FOR CLAUDE CODE`, h1 `From intent to completion.`, description `Plan, approve, implement, verify. A lightweight workflow that keeps you in control.`, CTAs `Get started` and `View on GitHub`.
- The README status stays visible: a small `Pre-alpha` line in the hero, below the CTAs, because the eyebrow no longer carries it (D-03).
- H1 at most two lines on desktop; description at most three lines at 600 to 680 px; terminal 900 to 1000 px wide and clearly wider than the description; the start of the terminal shows in the first view at 1440x900. No full-height hero, never `h-screen`.
- Terminal transcript stays `/telos:plan`, `/telos:approve`, `/telos:do`, verification and commit, keeps its Illustrative caption and scrolls inside its own container.
- `--container-page: 75rem` and one `section-y` utility: 2.5rem block padding below `md`, 4.25rem from `md`, giving 80 px and 136 px between sections.
- Mobile nav shows the logo, a GitHub link and the simple menu. Nav order follows D-05: Workflow, Features, Project memory, Profiles, Getting started.
- Monogram: Greek capital tau in a thin circle (the target motif), `aria-hidden`, `currentColor`; used in nav and favicon. Meander leaves the hero.

## Tests (write first)
- The eyebrow, description and both CTA labels appear exactly as in the notes, and the h1 test still holds.
- `Pre-alpha` appears in the hero, before the workflow section.
- Hero has no two-column grid, no meander and no `min-h-[100dvh]`; built HTML and CSS still have no `h-screen`.
- Terminal wrapper has a max width between 900 and 1000 px, and comes after the CTAs in the HTML.
- Nav lists memory before profiles; the header has a GitHub link outside the small-screen menu.
- `global.css` defines `--container-page` and `section-y`.
- DESIGN.md Layout rules name the 1200 px width and both section spacings, and no longer require asymmetry.

## Steps
- Update `hero.test.mjs` and see it fail.
- Add `--container-page`, `section-y` and `Monogram.astro`; update the favicon.
- Rebuild `Hero.astro` as a centered stack with the wide terminal below.
- Update `Nav.astro` and `DESIGN.md`.
- Check the first view at 1440x900 and 390x844.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm --prefix website test` → exit 0
- [ ] At 1440x900 the terminal starts in the first view and the h1 takes at most two lines
- [ ] At 390x844 the h1 breaks naturally, the primary CTA is visible without scrolling and the page has no horizontal scroll

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
