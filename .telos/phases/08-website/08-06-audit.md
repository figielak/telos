---
id: 08-06
title: "Responsive, accessibility and performance audit"
type: code          # code | doc | audit
status: draft       # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [08-05]         # task IDs, e.g. [01-01]
decisions: [D-02, D-03, D-04]       # phase-local, e.g. [D-03]
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
- Direction (D-02): tokens from `website/DESIGN.md`; no emoji, no pure black, no glows, no gradient text, no glassmorphism, no equal 3-column card row; concrete verbs, no filler copy.
- Below `md` every layout collapses to one column with no horizontal page scroll.
- D-04 [proposed]: a clean install must work from the lockfile, and root `package.json` stays unchanged.
- Browser checks use the available Playwright tools or local Chrome, and add no dependency. Lighthouse, if used, runs one-off through `npx` and is not added to `package.json`.
- Budgets: JavaScript sent to the client ≤ 2 KB, CSS ≤ 40 KB, the three fonts ≤ 250 KB together, no images in the critical path. Report real measured values, and do not loosen a budget to pass.
- Every copy fix found here stays within D-03; a claim that cannot be traced is removed, not reworded.

## Tests (write first)
- Exactly one `<h1>`, heading levels never skip, and landmarks header, nav, main and footer are present.
- Sections appear in order: hero, workflow, features, profiles, memory, getting-started.
- Every `<svg>` has `aria-hidden` or an accessible name; every link and button has a name.
- Built output meets the JavaScript, CSS and font budgets; no external script or stylesheet host.
- Every external link targets `github.com/figielak/telos`.

## Steps
- Write `audit.test.mjs` and fix what it finds.
- At 390, 768 and 1440 px: measure `scrollWidth` against `clientWidth` and take screenshots.
- Walk the page by keyboard (skip link, nav disclosure, terminal region, copy buttons), and test with reduced motion and with JavaScript off.
- Read all copy once against README and SPEC.
- Update `DESIGN.md` to match the final components, and record measured sizes in Result.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm --prefix website ci && npm --prefix website test` → exit 0
- [ ] `npm test` → exit 0
- [ ] `git diff --quiet telos/08-start -- package.json` → exit 0
- [ ] No horizontal scroll at 390, 768 and 1440 px
- [ ] Keyboard, reduced-motion and JavaScript-off checks pass

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
