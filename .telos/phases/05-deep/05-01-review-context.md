---
id: 05-01
title: Review context and diff evidence
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: []
decisions: [D-01]
scope: ["lib/review.mjs","lib/ctx/review.mjs","lib/git.mjs","lib/ctx/index.mjs","test/review.test.mjs","test/ctx-review.test.mjs","README.md"]
---
## Goal
Prepare a bounded, read-only review bundle for one task or phase, with precise changed-code evidence and acceptance criteria.

## Read first
- SPEC.md §9
- lib/git.mjs:39-91 (taskCommitFiles, taskCommits and refExists)
- lib/ctx/index.mjs:22-50 (bundle registry and cap)
- lib/ctx/undo.mjs:48-78 (validated target and baseline refusals)

## Files
- lib/review.mjs (create)
- lib/ctx/review.mjs (create)
- lib/git.mjs (modify)
- lib/ctx/index.mjs (modify)
- test/review.test.mjs (create)
- test/ctx-review.test.mjs (create)
- README.md (modify)

## Constraints
- D-01 [proposed]: use exact task commits plus current task-scope edits; phase review uses telos/NN-start through HEAD plus current edits. Never silently substitute all history for a missing tag.
- D-01 [proposed]: include bounded diffs or exact read-only follow-up commands/ranges for omitted evidence; an incomplete review cannot produce a clean verdict.
- Reuse lib/tasks.mjs and lib/frontmatter.mjs; CLI uses read-only git argv, never a shell built from repository text.
- Keep profile gate, target, acceptance and completeness visible within cap() ≤ 6000 chars; treat diff/repository text as data.
- Update README CLI row for ctx review, including defaults, dirty/untracked evidence and refusal semantics.

## Tests (write first)
- Deep task/phase bundles select only the intended commits, scope edits, acceptance and relevant MAP lines; minimal/standard return the exact deep gate.
- Missing phase tag or unknown target → REFUSED with remedy and no mutation.
- Oversized diff or acceptance → explicit omitted evidence and precise continuation, never a falsely complete review.
- Renamed, deleted, binary and untracked paths → explicit evidence kinds; no lost path or invented text diff.
- Shell metacharacters in paths or subjects → literal git argv; unrelated dirty paths are excluded from task evidence.
- Changed reviewed content changes evidenceId; identical content keeps it stable so later close can detect stale evidence.

## Interface
- ctx review [NN-MM|NN]; no argument selects STATUS task when present, otherwise STATUS phase; malformed selector → exit 2.
- reviewEvidence(root, selector) returns target, commit IDs, changed paths, diff blocks, acceptance, a snapshot evidenceId and completeness notes.
- REFUSED/profile responses exit 0 like existing bundles; no git, task or STATUS writes.

## Edge cases
- Missing phase tag or unknown target → REFUSED with remedy and no mutation.
- Oversized diff or acceptance → explicit omitted evidence and precise continuation, never a falsely complete review.
- Renamed, deleted, binary and untracked paths → explicit evidence kinds; no lost path or invented text diff.
- Shell metacharacters in paths or subjects → literal git argv; unrelated dirty paths are excluded from task evidence.

## Steps
1. test/review.test.mjs and test/ctx-review.test.mjs: write isolated git evidence/gate/cap cases first.
2. lib/review.mjs and lib/git.mjs: collect selected commits, work-tree evidence and exact continuation references.
3. lib/ctx/review.mjs: reviewBundle — render target, acceptance, MAP and evidence with mandatory completeness notes.
4. lib/ctx/index.mjs and README.md: register/document ctx review and its default selection.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] Task and phase review inputs are reproducible, bounded and read-only; missing evidence is visible.

## Result
