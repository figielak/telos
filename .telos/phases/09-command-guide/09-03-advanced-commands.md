---
id: 09-03
title: Explain profile-gated commands and complete skill coverage
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [09-02]    # task IDs, e.g. [01-01]
decisions: [D-01, D-02, D-03] # phase-local, e.g. [D-03]
scope: [website/src/data/docs/advanced.mjs, website/src/data/docs/commands.mjs, website/test/docs-skills.test.mjs] # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Explain the standard/deep commands and prove that every shipped user-invoked skill is discoverable in the guide.

## Read first
- README.md §Commands (in Claude Code)
- README.md §Review and research agents (deep)
- README.md §Deep workflow
- website/test/audit.test.mjs:121-129 (skill inventory coverage)
- website/test/shared-content.mjs:1-31 (built-text helpers)

## Files
- website/src/data/docs/advanced.mjs (create)
- website/src/data/docs/commands.mjs (modify)
- website/test/docs-skills.test.mjs (create)

## Constraints
- D-01/D-03: cover discuss, lesson, check, done, undo, review, research and docs, plus discoverable review-hard and research-hard variants with indexed anchors.
- D-02: reuse the guide record contract and English visual conventions from 09-01.
- Each base/variant gets syntax, profile/state prerequisites, effects, an illustrative example/outcome, use/avoid guidance, linked alternatives and source links.
- Explain existing-phase requirements, proposed decisions, manual acceptance, configured checks, review UNVERIFIED, research handoff, and docs scope/no-op behavior without inventing automatic steps.
- Describe undo confirmation and dependent blocking; review is read-only and does not fix findings. Deep critical work requires real RED, configured e2e and review evidence.
- Inspect only matching skill/shared sources for factual checks; agent names are implementation details, not extra user commands.

## Tests (write first)
- Guide base/variant inventory equals the directories under skills/; unknown entries and missing shipped commands fail with actionable names.
- Every skill/variant link resolves in built HTML and includes example, profile, use/avoid guidance and source attribution.
- Standard/deep gates, check versus done, review versus fixes, and undo confirmation/dependent handling remain explicit.
## Interface
   contracts introduced or changed, ≤ 15 lines
## Edge cases
   "- input → expected outcome"
-->

## Steps
- Write final skill inventory and advanced content tests before adding records.
- Inspect the corresponding instructions and author the advanced command entries and two variants.
- Register the entries and connect alternatives to the core command pages.
- Audit the complete skill inventory, source-backed state effects and profile restrictions.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm --prefix website test` → exit 0
- [ ] `node --test --test-reporter=dot test/*.test.mjs` → exit 0
- [ ] Every shipped skill, including variants, has a discoverable detail page or anchored variant section.
- [ ] Reading check, done, review and undo makes their prerequisites, effects and alternatives clear.

## Result

