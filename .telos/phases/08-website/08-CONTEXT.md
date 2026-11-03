# 08 · Website
## Goal
Publish-ready landing page for Telos in `website/`, built with Astro and Tailwind CSS in the Ancient Precision / Obsidian & Gold direction. It explains the path from plan through approval and implementation to tests and a commit, using only facts the repository can back.

## Decisions
- D-01: Astro and Tailwind CSS in `website/`, with no unnecessary dependencies. Sections: hero (navigation, "From intent to completion.", CTA, Telos terminal preview), Workflow, Features, Profiles, Project Memory, Getting Started; `website/DESIGN.md` describes color tokens, typography, spacing and component rules.
- D-02: Tokens `#101114` background, `#1A1C20` surface, `#C8A96B` accent, `#F1EEE6` text, `#A5A29A` muted; fonts Manrope, Inter, JetBrains Mono. Minimal premium developer tool with subtle Greek geometry, no generic AI graphics, gradient excess or glassmorphism. The taste skill applies only where it does not contradict this brief: Inter stays, and React and Framer Motion are not used.
- D-03: No invented features or benchmark results. Copy traces to README, SPEC or code; SPEC cost targets and the unfinished phase 07 benchmark are not presented as results.
- D-04: `website/` is a standalone npm package with its own lockfile and tests, not a workspace. The PROJECT rule "no runtime or dev dependencies" keeps applying to the plugin; `website/` requires Node >=22.23.4 (Astro 7), and root `package.json` and `npm test` stay unchanged.
- D-05: Layout per the user's guidelines (revise, 2026-11-03), replacing earlier layout choices: centered hero with exact eyebrow, description and CTAs and a 900 to 1000 px terminal below; order Hero, Workflow, Core features, Project memory, Profiles, Getting started, Final CTA and footer; Workflow one horizontal process with four stages, vertical on mobile; Core features asymmetric 2 x 2; Memory text left, tree right; Profiles three cards that stack on mobile; Getting started one large terminal block; content width 1200 px, text 600 to 680 px, section spacing 120 to 144 px desktop and 64 to 80 px mobile; sparing gold, few frames; Greek references limited to the tau monogram, thin lines and a target motif. No invented statistics, testimonials or logos. The page must show how Telos works rather than only an aesthetic.

## Constraints
- All changes stay under `website/`; tests use `node:test` only.
- Page copy is in English; replies to the user stay in their language.
- No deployment target is chosen in this phase: static output only, no `site` URL or canonical link.

## Open questions
- none

## Carried over
- none

## Links
- SPEC.md §3 (profiles), SPEC.md §4 (files), README.md §Install
