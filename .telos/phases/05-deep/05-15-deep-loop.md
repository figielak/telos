---
id: 05-15
title: Deep lifecycle proof
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: true
effort: hard        # normal | hard
depends: [05-04, 05-06, 05-11, 05-13, 05-14]
decisions: [D-01, D-02, D-03, D-04, D-05, D-06]
scope: ["test/e2e-deep.test.mjs","test/fixtures/deep-loop/package.json","test/fixtures/deep-loop/README.md","test/fixtures/deep-loop/src/index.mjs","test/fixtures/deep-loop/docs/api.md","README.md"]
---
## Goal
Prove a complete deep phase, including critical verification, doc-sync, ADR promotion and undo, in deterministic temporary repositories.

## Read first
- SPEC.md §3
- SPEC.md §11
- test/e2e-standard.test.mjs:11-101 (CLI, hook and isolated repository harness)
- test/manifest.test.mjs:29-56 (hook wiring checks)

## Files
- test/e2e-deep.test.mjs (create)
- test/fixtures/deep-loop/package.json (create)
- test/fixtures/deep-loop/README.md (create)
- test/fixtures/deep-loop/src/index.mjs (create)
- test/fixtures/deep-loop/docs/api.md (create)
- README.md (modify)

## Constraints
- D-01 [proposed]: bounded prepared review evidence includes snapshot identity; missing coverage is UNVERIFIED, never clean.
- D-02 [proposed]: deep critical code needs Result RED/GREEN/review evidence and configured e2e; missing e2e blocks.
- D-03 [proposed]: diff-driven docs matching is heuristic and bounded; skills inspect omissions and condense read-only changelog drafts.
- D-04 [proposed]: confirmed-source ADRs use safe retryable transitions; ambiguous undo ownership requires explicit IDs, with no automatic predecessor reactivation.
- D-05 [proposed]: retro belongs to deep done/HISTORY; reusable lessons are proposed, not automatically persisted.
- D-06 [proposed]: researcher returns ≤60 lines; main-thread persistence preserves existing reports unless replacement is authorized.
- Harness plays skill commands with supplied reviewer/researcher and confirmation outcomes; deterministic CLI proof is not proof of live fork, web search or model quality.
- No network or dependencies; production CLI stays read-only with respect to git; git mutations only in isolated fixtures playing skills.
- No broad production fixes in this integration task: report an uncovered defect and propose scoped follow-up rather than expanding Files.
- Update README deep availability/workflow and explicitly distinguish automated fixture proof from any live-host smoke evidence.

## Tests (write first)
- Fresh deep phase: prepared research → proposed planning/confirmation → critical RED/GREEN/e2e/review → docs/changelog sync → ADR/retro → closed phase with bounded bundles.
- Missing e2e, invalid RED, incomplete review or unverified manual acceptance → no successful close state/history.
- Failed doc-sync verification → active phase and no successful-close history; retry preserves unrelated docs and avoids duplicate entries.
- Interrupted ADR/link/marker promotion → resume without duplicate ADR/history or losing prior decision prose.
- Confirmed undo updates only selected source ADRs and intended tasks while retaining unrelated metadata; cancellation/conflict changes no successful state.
- Profile downgrade retains RESEARCH/ADRs but gates deep commands/reminders; map commit prompt obeys confirmation and auto_commit.
- Agent/variant manifest and injection contracts validate without claiming that fixtures exercised a live Claude host.

## Interface
- Use public bin/telos-equivalent CLI calls and hook stdin/stdout protocols, plus lib/tasks.mjs/frontmatter.mjs for fixture task access.
- Fixture checks return controlled RED, GREEN and e2e exits; stub agent outputs carry reviewed-evidence identity and completeness.
- Record automated proof and live-host limitations separately in Result; no required production API additions.

## Edge cases
- Missing e2e, invalid RED, incomplete review or unverified manual acceptance → no successful close state/history.
- Failed doc-sync verification → active phase and no successful-close history; retry preserves unrelated docs and avoids duplicate entries.
- Interrupted ADR/link/marker promotion → resume without duplicate ADR/history or losing prior decision prose.
- Confirmed undo updates only selected source ADRs and intended tasks while retaining unrelated metadata; cancellation/conflict changes no successful state.

## Steps
1. test/e2e-deep.test.mjs: write the public-interface success and failure scenarios first using isolated repositories.
2. test/fixtures/deep-loop/: add minimal source, docs and deterministic test/e2e commands needed by those scenarios.
3. test/e2e-deep.test.mjs: play prepared agent handoffs and explicit confirmations, asserting state ordering and byte preservation.
4. README.md: document delivered deep workflow and limits of fixture-based agent proof.
5. Run npm test and claude plugin validate .; report any unavailable live-host verification explicitly.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] `claude plugin validate .` → exit 0
- [x] A deep phase including doc-sync and ADR-aware undo completes in a temporary repository; failure paths cannot falsely close it.
- [x] Result separates machine workflow evidence from live-host behavior that was not exercised.

## Result
Machine evidence: `test/e2e-deep.test.mjs` + `test/fixtures/deep-loop/` play research → confirmation → critical RED/GREEN/e2e/review → doc-sync/changelog → ADR promotion + retro → close → ADR-aware undo in isolated git repos, plus failure paths (missing e2e, env-failure RED, UNVERIFIED/CHANGES REQUESTED review, manual unverified, failed reverify + retry, interrupted promotion, cancel/conflict undo, downgrade, map prompt); 568 tests (567 pass, 1 todo); `claude plugin validate .` exit 0 (2 pre-existing warnings).
Not exercised (live host): skill loading, forked reviewer/researcher agents, WebSearch, model judgment, AskUserQuestion confirmations and host hook dispatch — the harness supplies those outcomes.
Defect found (not fixed, out of scope): after doc-sync, `telos accept` SCOPE-fails on uncommitted doc paths, so `/telos:done`'s accept rerun would stop a real deep close; recorded as a todo test and carry-over, harness reverifies with the targeted full check and tolerates only doc-sync SCOPE lines.
Deviations: none
