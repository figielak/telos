---
id: 08-11
title: Clarify first-visit copy and fix mobile navigation
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [08-10]    # task IDs, e.g. [01-01]
decisions: []       # phase-local, e.g. [D-03]
scope: [website/src/components/, website/test/, website/DESIGN.md] # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Implement the user's first-visit audit: clear product promise, benefit-led copy, profile guidance, a runnable first plan, mobile menu dismissal and an illustrative request-to-commit example.

## Read first
- website/src/components/Hero.astro:1-35 (hero)
- website/src/components/Nav.astro:1-48 (navigation)
- website/src/components/Workflow.astro:1-65 (workflow)
- website/src/data/profiles.mjs:1-60 (comparison data)

## Files
- website/src/components/Hero.astro (modify)
- website/src/components/Features.astro (modify)
- website/src/components/Profiles.astro (modify)
- website/src/components/GettingStarted.astro (modify)
- website/src/components/Nav.astro (modify)
- website/src/components/Workflow.astro (modify)
- website/test/hero.test.mjs (modify)
- website/test/workflow-features.test.mjs (modify)
- website/test/profiles-memory.test.mjs (modify)
- website/test/getting-started.test.mjs (modify)
- website/test/navigation.test.mjs (create)
- website/DESIGN.md (modify)

## Constraints
- User's current audit supersedes earlier exact hero copy and unhighlighted profile cards.
- Keep graphite/gold colors, fonts, slogan, pre-alpha and illustrative labels.
- No new dependencies, invented product behavior or benchmark claims.
- Keep technical information available in native disclosures; preserve no-JS navigation.
- Keep the unrelated pre-existing phase 07 and LESSONS edits untouched.

## Tests (write first)
- Hero identifies Claude Code, repo memory and session/scope problems.
- Feature mechanics remain behind closed disclosures; profile guidance recommends Standard.
- First plan includes a description; the illustrative example connects scope, acceptance and commit.
- Menu closes for every anchor and Escape, with appropriate keyboard focus.

## Steps
- Update content expectations and add menu regression tests; record RED.
- Implement focused component changes and update the design reference.
- Run website and root tests; verify menu, disclosures and overflow in browser.

## Acceptance
- [x] all listed tests pass
- [x] `npm --prefix website test` → exit 0
- [x] `npm test` → exit 0
- [x] Mobile menu closes after link selection; destination remains visible at 390 px.
- [x] Profiles are concise by default and full comparison can be expanded.
- [x] No horizontal page overflow at 390, 768 and 1440 px.

## Result
Benefit-led hero/features, concise profile guidance with Standard recommended, runnable first plan and illustrative request-to-commit panel.
RED: website tests failed on missing product copy/disclosures/example and menu enhancement before implementation; GREEN: all 75 website tests pass.
Browser: 390/768/1440 px without overflow; all menu anchors, focus, Escape, keyboard activation, disclosures and no-JS fallback pass.
Verification: telos accept 08-11 PASS, including npm test; first sandbox run ended with SIGTERM, rerun outside sandbox passed.
Deviations: none
