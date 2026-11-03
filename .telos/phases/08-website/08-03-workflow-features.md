---
id: 08-03
title: Workflow and Features sections
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [08-02]         # task IDs, e.g. [01-01]
decisions: [D-02, D-03]       # phase-local, e.g. [D-03]
scope: ["website/"]           # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Add the Workflow section showing the real path from plan to commit, and the Features section listing only behavior Telos ships today.

## Read first
- README.md:22-33 (plan, approve, do)
- README.md:174 (telos accept)
- README.md:221-232 (hooks and guards)
- SPEC.md:27-40 (design principles)
- website/DESIGN.md §Components

## Files
- website/src/components/Workflow.astro (create)
- website/src/components/Features.astro (create)
- website/src/pages/index.astro (modify)
- website/test/shared-content.mjs (create)
- website/test/workflow-features.test.mjs (create)

## Constraints
- Scope is `website/` only: root `package.json`, `README.md`, `skills/`, `lib/` stay untouched.
- Content rule (D-03): state only what README, SPEC or the code says; no benchmark, token-saving or cost figures, no comparisons with other tools.
- Direction (D-02): tokens from `website/DESIGN.md`; no emoji, no pure black, no glows, no gradient text, no glassmorphism, no equal 3-column card row; concrete verbs, no filler copy.
- Below `md` every layout collapses to one column with no horizontal page scroll.
- Workflow is an `<ol>` in this real order: `/telos:plan`, `/telos:approve`, `/telos:do` (tests first, then implementation), `telos accept`, commit. State that the commit depends on `git.auto_commit` and that Telos never pushes.
- Features use an asymmetric grid (for example `2fr 1fr`) or rows split by rules, not equal cards. Candidates, each traceable to the README: task files with scope and acceptance, machine-checked acceptance, git guard, scope guard, confirmed undo, capped context bundles (6000 chars) and SessionStart status (1200 chars).
- README says skills "cost nothing until called", but SPEC §12 measured 363 always-on tokens. Write only "skills are user-invoked"; make no zero-cost claim.
- Inline SVG only for marks; decorative ones are `aria-hidden`.

## Tests (write first)
- `<section id="workflow">` has an `<ol>` with five items in the stated order.
- `<section id="features">` exists with its own `<h2>`; heading levels do not skip.
- Shared content check over all built text: every `/telos:*` command exists under `skills/`.
- Shared content check: no emoji, no filler words (elevate, seamless, unleash, next-gen), no `%` or `×` figures, no "faster", "cheaper", "saves" or "cost nothing".

## Steps
- Write `shared-content.mjs` and `workflow-features.test.mjs`, and see them fail.
- Build `Workflow.astro`, using the meander as the connecting motif.
- Build `Features.astro`, checking each claim against the README lines above.
- Mount both after the hero and check them at 390 and 1440 px.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm --prefix website test` → exit 0
- [ ] Each feature claim was checked against its README or SPEC line

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
