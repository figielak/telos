# 09 · Command guide
## Goal
Give website visitors a detailed explanation of every Telos command, practical examples, guidance on when to use it or choose an alternative, and several complete workflows.

## Decisions
- D-01: Explain every command with examples, when it is useful and when it is not, and add several workflow examples (user request).
- D-02: Add an English `/docs/` guide matching the existing website, with a command index, stable detail URLs and workflow recipes; link it from desktop/mobile navigation and the footer. Reuse Astro and the existing design, with static content and no new dependencies or search service.
- D-03: Cover both Claude Code `/telos:*` skills (including discoverable lite/hard variants) and a separate terminal CLI reference covering every public command and documented subcommand/context bundle. Each entry states syntax, prerequisites/profile, effects, examples, use/avoid guidance, alternatives and repository sources.
- D-04: Publish five recipes: a small quick fix, onboarding an existing repository, a standard feature phase, a deep critical feature, and revising/resuming/undoing work. Each names its starting state/profile, command environment, checkpoints, expected outcomes and stop conditions.

## Constraints
- Plan only now; implementation belongs to approved tasks. Do not change CLI/skill behavior or benchmark files.
- Preserve the existing website's Ancient Precision design, readability, accessibility and asset budgets; root dependency rules remain unchanged.
- Content is backed by README and the relevant skill/shared instructions or CLI implementation; label scenarios illustrative and never imply fabricated benchmark results.
- Phase 07 remains active and 07-09 remains in-progress; preserve its work and record its current next step before switching the STATUS pointer for this draft.

## Open questions
- none

## Carried over
- none

## Links
- README.md §Commands (in Claude Code)
- README.md §CLI
- README.md §Standard workflow
- README.md §Deep workflow
- website/DESIGN.md
