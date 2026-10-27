---
id: 05-12
title: Deep close verification and doc-sync
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: [05-06, 05-08, 05-09]
decisions: [D-01, D-02, D-03]
scope: ["lib/ctx/check.mjs","lib/ctx/done.mjs","skills/done/SKILL.md","test/ctx-close.test.mjs","test/skills.test.mjs","README.md"]
---
## Goal
Extend deep phase close with critical-work review and targeted documentation synchronization before recording successful closure.

## Read first
- SPEC.md §11
- SPEC.md §3
- lib/ctx/check.mjs:58-123 (phaseReport close gates and promotion output)
- skills/done/SKILL.md:18-47 (verification-before-state close workflow)

## Files
- lib/ctx/check.mjs (modify)
- lib/ctx/done.mjs (modify)
- skills/done/SKILL.md (modify)
- test/ctx-close.test.mjs (modify)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- D-01 [proposed]: reuse complete critical review evidence only when it names the same reviewed snapshot; missing/stale coverage requires one prepared phase review, never a re-review loop.
- D-02 [proposed]: require recorded meaningful RED and successful targeted full/e2e checks for deep critical code; manual evidence cannot be inferred from accept PASS.
- D-03 [proposed]: run docs-scan and changelog; update only matched docs/public docstrings and ≤10 changelog entry lines under a version/date heading, preserving unrelated content.
- Verify again after documentation/docstring edits with configured checks and relevant acceptance; incomplete scan/review or failed verification leaves phase active and no successful-close history.
- Call prepared agents directly where needed; never invoke user-only skills automatically. Keep standard close/README-only behavior unchanged.
- Permit only necessary docs/source-docstring edits in deep branch; stage explicit changed paths only, respecting git.auto_commit.
- README done, ctx done and ctx check rows must describe new prerequisites and failure behavior.

## Tests (write first)
- Deep close reports exact critical tasks, review/evidence needs, targeted checks and doc-sync commands within cap.
- Missing RED/e2e or incomplete/stale review → close cannot succeed on accept PASS alone.
- Unresolved HIGH/CRITICAL review finding → no successful closure; fixes stay within task scope or are proposed separately.
- Doc-sync changes behavior-neutral docs/docstrings/changelog only; failed post-edit verification → active phase and no successful-close history.
- No doc matches/commits → valid no-op; unsupported scan evidence → targeted inspection before a sync claim.
- Standard close and git.auto_commit=false preserve existing behavior; retries avoid duplicate changelog headings/entries.

## Interface
- ctx done [NN] adds deep obligations, critical task evidence pointers and docs configuration; mandatory blockers survive cap().
- Deep close sequence: existing gates → targeted full/e2e + acceptance → review → docs/changelog sync → reverify → promotion/record.
- Review output ≤40 lines; changelog entry ≤10 lines; no new retro CLI/skill in this task.

## Edge cases
- Missing RED/e2e or incomplete/stale review → close cannot succeed on accept PASS alone.
- Unresolved HIGH/CRITICAL review finding → no successful closure; fixes stay within task scope or are proposed separately.
- Doc-sync changes behavior-neutral docs/docstrings/changelog only; failed post-edit verification → active phase and no successful-close history.
- No doc matches/commits → valid no-op; unsupported scan evidence → targeted inspection before a sync claim.

## Steps
1. test/ctx-close.test.mjs and skill tests: write deep-close gate and documentation failure cases first.
2. lib/ctx/check.mjs and lib/ctx/done.mjs: expose compact evidence pointers, targeted checks and sync obligations.
3. skills/done/SKILL.md: add the deep review/doc-sync/reverification branch before existing promotion and record steps.
4. skills/done/SKILL.md: update tool permissions and exact changed-path commit handling for deep docs.
5. README.md: document deep versus standard close, unchanged-state failure outcomes and evidence limits.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] A deep phase closes only after critical evidence, review and doc-sync checks; standard close remains compatible.

## Result
