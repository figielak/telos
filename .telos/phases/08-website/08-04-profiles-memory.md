---
id: 08-04
title: Profiles and Project Memory sections
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [08-03]         # task IDs, e.g. [01-01]
decisions: [D-02, D-03]       # phase-local, e.g. [D-03]
scope: ["website/"]           # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Add the Profiles section comparing minimal, standard and deep, and the Project Memory section showing what `.telos/` holds and why.

## Read first
- SPEC.md:41-55 (profiles table)
- SPEC.md:57-79 (files in the target repository)
- SPEC.md:81-93 (one canonical home per fact)
- README.md:221-232 (hook profile column)
- website/DESIGN.md §Components

## Files
- website/src/components/Profiles.astro (create)
- website/src/components/Memory.astro (create)
- website/src/data/profiles.mjs (create)
- website/src/pages/index.astro (modify)
- website/test/profiles-memory.test.mjs (create)

## Constraints
- Scope is `website/` only: root `package.json`, `README.md`, `skills/`, `lib/` stay untouched.
- Content rule (D-03): state only what README, SPEC or the code says; no benchmark, token-saving or cost figures, no comparisons with other tools.
- Direction (D-02): tokens from `website/DESIGN.md`; no emoji, no pure black, no glows, no gradient text, no glassmorphism, no equal 3-column card row; concrete verbs, no filler copy.
- Below `md` every layout collapses to one column with no horizontal page scroll.
- Profiles use the SPEC §3 rows Workflow, Files, Tests, Docs, Subagents and Hooks. Leave out "Target cost vs. plain Claude Code": those are targets, not measurements (D-03).
- A real `<table>` with `<th scope>`; below `md` it stacks by profile with explicit ARIA table roles so the semantics survive the display change.
- State that each profile is a superset of the previous one and can be changed with `/telos:profile`.
- Memory shows the `.telos/` tree as text in `<pre>`, with each file's role and its real limit (PROJECT ≤ 60 lines, MAP ≈ 1500 tokens, ROADMAP ≤ 80 lines, STATUS ≤ 40 lines, LESSONS max 20). Mark which profile adds a file.
- Say plainly that the memory is plain files committed in the user's repository.

## Tests (write first)
- `<section id="profiles">` has a `<table>` with minimal, standard and deep column headers and six row headers.
- `profiles.mjs` and built text contain no "Target cost", "1.1×" or "2.5×".
- `<section id="memory">` names PROJECT.md, MAP.md, ROADMAP.md, STATUS.md, HISTORY.md, LESSONS.md and `decisions/`.
- Every template file the section names exists under `templates/`; `decisions/` is exempt.
- The shared content check passes over the new sections.

## Steps
- Write `profiles-memory.test.mjs` and see it fail.
- Write `profiles.mjs` from SPEC §3, checking the hook row against the README table.
- Build `Profiles.astro` with its stacked mobile layout.
- Build `Memory.astro` with the tree and the roles.
- Mount both and check them at 390 and 1440 px.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm --prefix website test` → exit 0
- [ ] The profile table reads correctly with its stacked layout at 390 px

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
