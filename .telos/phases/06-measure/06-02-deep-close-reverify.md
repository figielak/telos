---
id: 06-02
title: Deep close reverify without scope bypasses
type: code
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard
depends: []
decisions: []
scope: ["lib/accept.mjs","lib/ctx/check.mjs","lib/ctx/done.mjs","skills/check/SKILL.md","skills/done/SKILL.md","test/accept.test.mjs","test/ctx-close.test.mjs","test/e2e-deep.test.mjs","test/skills.test.mjs","README.md"]
---
## Goal
Resolve the known doc-sync reverify failure and remove the deep lifecycle test's SCOPE-failure workaround while retaining real scope enforcement.

## Read first
- lib/accept.mjs:61-79 (accept scope calculation)
- lib/ctx/check.mjs:154-210 (phaseReport)
- skills/done/SKILL.md:24-43 (verification and doc-sync)
- test/e2e-deep.test.mjs:267-318 (acceptOk and close)
- test/e2e-deep.test.mjs:510-514 (known regression)

## Files
- lib/accept.mjs (modify)
- lib/ctx/check.mjs (modify)
- lib/ctx/done.mjs (modify if needed)
- skills/check/SKILL.md (modify if needed)
- skills/done/SKILL.md (modify)
- test/accept.test.mjs (modify)
- test/ctx-close.test.mjs (modify)
- test/e2e-deep.test.mjs (modify)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- Carry-over #2: deep close reverify — telos accept SCOPE-fails on uncommitted doc-sync paths; fix accept or done ordering (todo test in e2e-deep) → 05-15.
- Keep normal task acceptance strict. Never ignore SCOPE failures, globally exempt docs, widen task scopes or commit before checks pass.
- Use the smallest explicit close-specific accounting or ordering fix justified by the reproducer; failed checks/manual verification still stop before phase/history changes.
- Support retry with retained doc edits and git.auto_commit=false; CLI remains read-only with respect to git. Update changed CLI/skill README rows.

## Tests (write first)
- Reproduce the existing TODO as a failing regression, then make the supported deep close/reverify route pass with real acceptance calls.
- Unrelated out-of-scope source changes, mismatched phase/task selectors and out-of-scope task commits still fail.
- Doc-sync edits plus a failing acceptance command still block close and leave phase/history unchanged.
- A retry with retained doc-sync edits succeeds without duplicate docs/history; auto_commit=false requires no intermediate commit.
- Ordinary task accept and standard/minimal behavior retain their existing scope guarantees.

## Interface
- The deep close route must account explicitly for task-owned changes and the actual permitted doc-sync edits; command acceptance is rerun against current files.
- No generic ignore-scope option or error-text whitelist. Any added selector must validate task/phase ownership and be emitted by the close bundle and documented.
- On failure, retain doc edits for inspection and leave phase active; no acceptance or scope failure is converted into PASS.

## Edge cases
- Unrelated dirty source or an out-of-scope task commit → failure, even during doc-sync.
- Command failure after doc edits → active phase with no close history.
- Retry or auto_commit=false → real verification without relying on a clean tree or a new commit.
- Wrong phase/task selector → refusal; non-close acceptance → existing strict scope behavior.

## Steps
1. test/e2e-deep.test.mjs: regression — turn the TODO into an executable failure and add negative scope/command cases first.
2. lib/accept.mjs and lib/ctx/check.mjs: close boundary — implement the narrow accounting/ordering fix and expose its exact commands.
3. skills/done/SKILL.md: close sequence — align first attempt and retry with the verified contract; update check if affected.
4. test/e2e-deep.test.mjs: close — remove acceptOk and the full-check-only workaround; rerun actual acceptance after doc-sync.
5. README.md: CLI and Commands — document the final behavior and prove standard/minimal compatibility.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] The deep lifecycle has no SCOPE-error whitelist or TODO for doc-sync reverify.
- [x] Both successful retries and blocked out-of-scope/command failures use the shipped close commands.

## Result
Added `telos accept <id> --close NN` (deep only; task done, in NN, phase active): besides scope/Deviations it admits only *uncommitted* docs-scan matches, the configured changelog when the phase has changelog candidates, and other done tasks' scope paths; task commits, other dirty paths and every command stay strict. `ctx done` emits it on the deep `Accept:` line; `ctx check` and standard keep plain accept. skills/done reruns those exact commands after doc-sync.
e2e-deep: removed `acceptOk` and the TODO; close() runs the bundle's accept commands before and after doc-sync; new cases: close accept PASS vs plain SCOPE FAIL, dirty source / out-of-scope task commit / wrong selectors fail, dirty-source close retry, auto_commit=false retry with no intermediate commit.
Tests: +1 accept, +1 ctx-close, +4 e2e-deep (todo removed), skills assertions; suite 582 pass, 0 todo.
Surprise: the close test commit used to run unconditionally; it now follows the bundle's Auto-commit line, and a missing config under --close exited with a crash until wrapped as exit 1.
Deviations: none
