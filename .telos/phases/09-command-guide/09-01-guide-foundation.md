---
id: 09-01
title: "Guide routes, command template and navigation"
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: []         # task IDs, e.g. [01-01]
decisions: [D-01, D-02, D-03] # phase-local, e.g. [D-03]
scope: [website/src/data/docs/, website/src/layouts/Docs.astro, website/src/pages/docs/, website/src/components/Nav.astro, website/src/components/Footer.astro, website/test/docs-foundation.test.mjs, website/test/navigation.test.mjs, website/DESIGN.md] # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Create the static guide shell and a reusable command-page contract, with one complete status entry proving the path from landing page to command details.

## Read first
- website/src/layouts/Base.astro:1-35 (page shell)
- website/src/components/Nav.astro:1-64 (desktop/mobile navigation)
- website/src/components/Footer.astro:1-28 (footer links)
- website/test/navigation.test.mjs:1-47 (focus and Escape behavior)
- website/test/audit.test.mjs:81-107 (asset budgets)
- website/DESIGN.md §Layout rules

## Files
- website/src/data/docs/commands.mjs (create)
- website/src/data/docs/core.mjs (create)
- website/src/layouts/Docs.astro (create)
- website/src/pages/docs/index.astro (create)
- website/src/pages/docs/commands/[slug].astro (create)
- website/src/components/Nav.astro (modify)
- website/src/components/Footer.astro (modify)
- website/test/docs-foundation.test.mjs (create)
- website/test/navigation.test.mjs (modify)
- website/DESIGN.md (modify)

## Constraints
- D-01/D-03: command records carry stable slug, kind, invocation, profiles/prerequisites, explanation, effects, examples with outcomes, use/avoid cases, alternatives and source links; optional variant and subcommand sections share the template.
- D-02: English /docs/ index and /docs/commands/<slug>/ pages; distinguish skills from CLI in labels and URL slugs. Start with /telos:status only; later tasks add entries.
- Reuse Base, local fonts and design tokens; no new packages, client framework or search/filter feature. Keep 40 KB CSS, 250 KB fonts and 2 KB inline JS per page budgets.
- Keep homepage section anchors working; from docs they must target /#section. Keep docs readable without JavaScript and code scroll confined to labelled, keyboard-accessible blocks.
- Document the record contract and reading layout in DESIGN.md; no root package, plugin or CLI edits.

## Tests (write first)
- Built index and status detail are reachable from desktop/mobile nav and footer; cross-page homepage anchors resolve.
- Status detail renders all required content fields, unique anchors, title/description, one h1, skip link and labelled navigation; examples are escaped text.
- Mobile navigation still closes/focuses same-page destinations and handles Escape; cross-page links navigate without looking for absent headings.
- Command slugs are unique and internal links resolve; guide content is present in static HTML without client JS.
## Interface
   contracts introduced or changed, ≤ 15 lines
## Edge cases
   "- input → expected outcome"
-->

## Steps
- Write route, rendered-content and navigation regression tests using existing node:test helpers.
- Define the plain .mjs record contract and aggregator with a complete, source-backed status entry.
- Build the index, Docs layout and generated detail route with grouped navigation and in-page contents.
- Add guide links and route-aware home anchors; preserve mobile keyboard behavior.
- Document the guide conventions and verify the built pages and asset budgets.

## Acceptance
- [x] all listed tests pass
- [x] `npm --prefix website test` → exit 0
- [x] `node --test --test-reporter=dot test/*.test.mjs` → exit 0
- [x] Landing and guide navigation work at 390, 768 and 1440 px without horizontal page overflow; long commands scroll locally.
- [x] The status detail is readable with JavaScript disabled and uses the existing visual design.

## Result
Built the static /docs/ guide: a record contract (src/data/docs/commands.mjs, core.mjs with the /telos:status entry), Docs layout, index and /docs/commands/<slug>/ route, Guide links in desktop/mobile nav and footer, route-aware /#section anchors, and a DESIGN.md "Guide pages" section.
Header menu now switches at lg (seven links overflow at 768 px). New docs-foundation tests (9) plus a navigation test; website suite 108/108 pass, root suite exit 0; no horizontal overflow at 390, 768, 1440 px (checked in a browser); no client JS beyond the menu script.
Deviations: website/astro.config.mjs — inlineStylesheets 'never' keeps CSS as files after the shared chunk split (hero and budget tests read dist/_astro); website/test/foundation.test.mjs — meander scan now recurses into the new docs directories.; bench/results/RUNLOG.md — pre-existing phase 07-09 work, not touched by this task and not staged
