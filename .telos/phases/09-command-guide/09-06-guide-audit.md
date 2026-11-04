---
id: 09-06
title: "Verify guide accuracy, navigation and responsive reading"
type: audit         # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [09-05]    # task IDs, e.g. [01-01]
decisions: [D-01, D-02, D-03, D-04] # phase-local, e.g. [D-03]
scope: [.telos/]    # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Verify the complete guide against repository behavior and the built site, including mobile reading, keyboard navigation and all workflow paths.

## Read first
- README.md §Commands (in Claude Code)
- README.md §CLI
- README.md §Standard workflow
- README.md §Deep workflow
- website/DESIGN.md §Layout rules
- website/test/audit.test.mjs:12-107 (structure, accessibility and budgets)

## Files


## Constraints
- D-01/D-03: inspect every command/variant and CLI subsection for real explanatory content, example/outcome, use/avoid guidance, profiles/effects, alternatives and sources; inventory tests alone do not prove accuracy.
- D-02: audit /docs/ and representative short/long skill, CLI and workflow pages at 390, 768 and 1440 px, keyboard-only and JavaScript disabled; preserve design and asset budgets.
- D-04: walk all five recipes from their declared starting states; verify branching, confirmations and blocked/UNVERIFIED stopping points against the corresponding instructions.
- Read-only product audit: write findings/evidence only in this task Result. Fixes return to the owning task via revise; never mark unresolved acceptance as passed.
- Existing benchmark edits and other out-of-scope work are not part of the phase. No plugin behavior changes, publication or deployment.

## Tests (write first)
<!-- type: code only; every Edge case maps to a test -->

<!-- Detailed level only (effort: hard or critical: true):
## Interface
   contracts introduced or changed, ≤ 15 lines
## Edge cases
   "- input → expected outcome"
-->

## Steps
- Run website and root tests; inspect generated guide links and command/CLI coverage reports.
- Audit command and recipe accuracy against the relevant source sections, including profile gates, state changes and git effects.
- Inspect the actual rendered pages at all three widths for page overflow, confined code scrolling, sticky navigation, focus, deep links and mobile menu behavior.
- Check guide reading with JavaScript disabled and record exact routes, widths, check outcomes and any findings in Result.
- Route material failures back to their owning task; verify every phase manual acceptance before recommending closure.

## Acceptance
- [x] `npm --prefix website test` → exit 0
- [x] `node --test --test-reporter=dot test/*.test.mjs` → exit 0
- [x] Every shipped command/variant and documented CLI action/bundle is covered with accurate examples and use/avoid guidance.
- [x] Five workflows have valid starting states and realistic checkpoints; none bypasses approval, confirmation, checks or profile restrictions.
- [x] Browser evidence covers 390, 768 and 1440 px, keyboard use and disabled JS; no broken guide links, clipped reading content or horizontal page overflow.
- [x] No unresolved material accuracy, navigation, accessibility or readability findings remain; missing browser evidence is reported unverified.

## Result

Tests: website suite 155 pass, root suite exit 0. Built 42 pages; 1251 internal links and anchors checked by script: 0 broken, 0 duplicate ids.
Browser (Playwright, preview build): /docs/, /docs/workflows/, three recipes, skill-status/done/review, cli-ctx/check/help and / at 390, 768 and 1440 px: no horizontal page overflow; code regions scroll only inside their own box (390 px only). Deep links #variant-review-hard, #sub-ctx-undo and #step-10 land below the 65 px header at 390 px. Sticky contents column works at 1440 px.
Keyboard: skip link, header, breadcrumb, contents and example regions reached in order, every stop with a 2 px outline; the mobile Menu (details) opens with Enter, lists Guide, closes with Escape. JavaScript disabled: recipe and command pages keep headings, outcomes and variant sections.
Accuracy: spot-checked recipes and records against the skills, shared/plan.md, approve (tag telos/NN-start), ctx research (REFUSED without CONTEXT) and the README tables. Every recipe starts from a declared state; approval, confirmation, checks and profile gates are not bypassed; undo is optional and confirmed. No material findings.
Observations, no task needed: the index does not list ctx bundles individually (reached through /docs/commands/cli-ctx/); cli-ctx is long on mobile. Unverified: no live Claude Code run of any example or recipe, no screen reader, no visual contrast re-measurement beyond the existing token tests.
Deviations: bench/results/RUNLOG.md — untracked before this task, not changed or committed by it; flagged by the scope check only
