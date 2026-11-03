---
id: 08-06
title: "Responsive, accessibility and performance audit"
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [08-10]         # task IDs, e.g. [01-01]
decisions: [D-02, D-03, D-04, D-05]       # phase-local, e.g. [D-03]
scope: ["website/"]           # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Verify the finished page for responsiveness, accessibility, performance and truthfulness, fix what fails, and bring `website/DESIGN.md` in line with what was built.

## Read first
- website/DESIGN.md §Components
- website/test/helpers.mjs (dist readers)
- website/test/shared-content.mjs (content check)

## Files
- website/test/audit.test.mjs (create)
- website/DESIGN.md (modify)
- website/src/ (modify)

## Constraints
- Scope is `website/` only: root `package.json`, `README.md`, `skills/`, `lib/` stay untouched.
- Content rule (D-03): state only what README, SPEC or the code says; no benchmark, token-saving or cost figures, no comparisons with other tools.
- Direction (D-02): tokens from `website/DESIGN.md`; no emoji, no pure black, no glows, no gradient text, no glassmorphism; the Profiles cards are the only row of three equal cards (D-05); concrete verbs, no filler copy.
- Below `md` every layout collapses to one column with no horizontal page scroll.
- D-04: a clean install must work from the lockfile, and root `package.json` stays unchanged.
- Browser checks use the available Playwright tools or local Chrome, and add no dependency. Lighthouse, if used, runs one-off through `npx` and is not added to `package.json`.
- Budgets: JavaScript sent to the client ≤ 2 KB, CSS ≤ 40 KB, the three fonts ≤ 250 KB together, no images in the critical path. Report real measured values, and do not loosen a budget to pass.
- Every copy fix found here stays within D-03; a claim that cannot be traced is removed, not reworded.

## Tests (write first)
- Exactly one `<h1>`, heading levels never skip, and landmarks header, nav, main and footer are present.
- Sections appear in order: hero, workflow, features, memory, profiles, getting-started, final-cta.
- Every `<svg>` has `aria-hidden` or an accessible name; every link and button has a name.
- Built output meets the JavaScript, CSS and font budgets; no external script or stylesheet host.
- Every external link targets `github.com/figielak/telos`.

## Steps
- Write `audit.test.mjs` and fix what it finds.
- At 390, 768 and 1440 px: measure `scrollWidth` against `clientWidth` and take screenshots.
- Walk the page by keyboard (skip link, nav disclosure, terminal region, copy buttons), and test with reduced motion and with JavaScript off.
- Read all copy once against README and SPEC.
- Delete `.playwright-mcp/` before `telos accept`.
- Update `DESIGN.md` to match the final components, and record measured sizes in Result.

## Acceptance
- [x] all listed tests pass
- [x] `npm --prefix website ci && npm --prefix website test` → exit 0
- [x] `npm test` → exit 0
- [x] `git diff --quiet telos/08-start -- package.json` → exit 0
- [x] No horizontal scroll at 390, 768 and 1440 px
- [x] Keyboard, reduced-motion and JavaScript-off checks pass
- [x] Measured distance between sections is 120 to 144 px at 1440 px and 64 to 80 px at 390 px
- [x] Hero communicates the product alone, and the terminal is the central element of the first screen
- [x] Section layouts vary, gold accents stay sparing, and text widths are comfortable
- [x] Workflow reads clearly on a phone, and every CTA leads to a real resource

## Result
Audited the final page, including the 08-11 commit (first-visit copy, disclosures, mobile menu) that a separate session landed while this phase ran; audit covers that state. `audit.test.mjs` adds 18 tests (structure, landmarks, section order, accessible names, budgets, hosts, links, truthfulness); 93 in the site suite, all pass. No src fix was needed.
Measured: JS 1351 B in two inline scripts (copy buttons 694, mobile menu 657; budget 2048); CSS 21.3 KB (40); fonts 113.5 KB (250); HTML 35.8 KB; no images, no external host, console clean. Sections are 137 px apart at 768 and 1440 px (136 padding + 1 px rule) and 81 px at 390 (80 + rule); no horizontal scroll at 390, 768 or 1440 px.
Browser: skip link first and visible, tab order equals visual order (27 stops); JavaScript off keeps the headline, all three commands, native menu and the full terminal; reduced motion shows the final state; copy buttons are hidden without JS.
Copy check: every claim traces to README or SPEC (all 24 skills have a README row) except two from the user's 08-11 audit: "Recommended start / Start with Standard" (only the install example `/telos:init standard`, README:15, SPEC:572) and the profile audience lines ("small projects…"). Left unchanged as the user's decision; D-03 would drop them.
Not run: Lighthouse, the real system clipboard, a physical phone. RED: none; the audit tests passed on first run because earlier tasks already met them.
Deviations: none
