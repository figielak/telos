---
id: 08-05
title: Getting Started section and footer
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [08-04]         # task IDs, e.g. [01-01]
decisions: [D-02, D-03]       # phase-local, e.g. [D-03]
scope: ["website/"]           # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Add the Getting Started section with the real install commands and first steps, plus the footer.

## Read first
- README.md:10-18 (install, requirements)
- README.md:26-28 (init, plan)
- README.md:35 (map for existing repositories)
- .claude-plugin/plugin.json:1-8 (license, version)
- website/DESIGN.md §Components

## Files
- website/src/components/GettingStarted.astro (create)
- website/src/components/Footer.astro (create)
- website/src/pages/index.astro (modify)
- website/test/getting-started.test.mjs (create)

## Constraints
- Scope is `website/` only: root `package.json`, `README.md`, `skills/`, `lib/` stay untouched.
- Content rule (D-03): state only what README, SPEC or the code says; no benchmark, token-saving or cost figures, no comparisons with other tools.
- Direction (D-02): tokens from `website/DESIGN.md`; no emoji, no pure black, no glows, no gradient text, no glassmorphism, no equal 3-column card row; concrete verbs, no filler copy.
- Below `md` every layout collapses to one column with no horizontal page scroll.
- Commands exactly as in the README: `/plugin marketplace add figielak/telos`, `/plugin install telos@telos`, `/telos:init standard`. Requirements: Claude Code with plugin support, Git, Node.js ≥ 20.10.
- Copy buttons are progressive enhancement in one small inline script: an `aria-live` status reports "Copied" or a failure, and the commands stay selectable text without JavaScript. Hide the buttons when the clipboard API is missing.
- `:active` feedback on buttons uses `transform` only.
- Footer links: GitHub, README, SPEC, and the "pre-alpha" status. The repo has no LICENSE file yet, so write "MIT" as text from the manifest and do not link a license file.

## Tests (write first)
- `<section id="getting-started">` holds the three install commands verbatim and the three requirements.
- All three install commands also appear in root `README.md`.
- Each copy button has an accessible name, and one `aria-live` status element exists.
- `<footer>` links to the GitHub repo, README and SPEC; no link to a LICENSE file.
- Every `#anchor` in the page resolves to an existing `id`.
- The shared content check passes over the whole page.

## Steps
- Write `getting-started.test.mjs` and see it fail.
- Build `GettingStarted.astro`: commands, requirements, first steps (`/telos:plan`, `/telos:approve`, `/telos:do`).
- Add the inline copy script with success and failure states.
- Build `Footer.astro` and mount both.
- Test the copy button in a browser, including the failure state.

## Acceptance
- [x] all listed tests pass
- [x] `npm --prefix website test` → exit 0
- [x] Copy works in a browser and the commands stay selectable with JavaScript off

## Result
Getting Started: the three README install commands (verbatim, selectable `<code>` with `select-all`), the three requirements, the first steps `/telos:plan`, `/telos:approve`, `/telos:do` and `/telos:map` for existing repositories. Copy buttons are `hidden` in the HTML and enabled by one 0.9 KB inline script only when the Clipboard API exists; an `aria-live` status reports "Copied: …" or a failure. Footer links GitHub, README and SPEC, shows "Pre-alpha. MIT, as declared in the plugin manifest." and links no LICENSE file.
Tests: 14 in `website/test/getting-started.test.mjs`; 54 in the site suite, all pass. Browser: copy success, failure and status reset verified with a stubbed clipboard; no page overflow at 1440 and 390 px. CSS 20 KB.
RED: node --test website/test/getting-started.test.mjs → exit 1: no #getting-started section, buttons or footer in the built page (10 of 14 failed on those assertions).
Deviations: website/test/hero.test.mjs — the "no script" assertion became "no external script", since one small inline script is now intended (file belongs to 08-02, inside scope)
