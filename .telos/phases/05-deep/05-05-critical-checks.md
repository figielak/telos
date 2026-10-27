---
id: 05-05
title: Critical-task verification
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: true
effort: hard        # normal | hard
depends: []
decisions: [D-02]
scope: ["lib/check.mjs","lib/ctx/check.mjs","skills/check/SKILL.md","test/check.test.mjs","test/ctx-close.test.mjs","test/skills.test.mjs","README.md"]
---
## Goal
Extend deterministic verification with explicit task/phase targeting and required e2e for deep critical code work.

## Read first
- SPEC.md §3
- SPEC.md §4.3.3
- lib/check.mjs:126-191 (runNamed, runChecks and CLI options)
- lib/config.mjs:6-26 (existing checks and deep defaults)
- lib/ctx/check.mjs:58-98 (phaseReport check selection)

## Files
- lib/check.mjs (modify)
- lib/ctx/check.mjs (modify)
- skills/check/SKILL.md (modify)
- test/check.test.mjs (modify)
- test/ctx-close.test.mjs (modify)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- D-02 [proposed]: check --level full accepts mutually exclusive --task NN-MM or --phase NN; a deep full check without a selector uses the STATUS phase.
- D-02 [proposed]: e2e is required only for deep critical code tasks (or phases containing them); missing checks.e2e is UNVERIFIED/exit 1, never guessed or installed.
- Keep minimal/standard and quick checks unchanged; type doc/audit does not acquire TDD/e2e requirements.
- Reuse runNamed's literal path substitution, timeouts and bounded output; no new command execution or task/frontmatter parsers.
- Only report results; no git writes or task/STATUS changes. Document changed check and ctx check rows plus /telos:check.

## Tests (write first)
- Deep critical code runs configured full checks then e2e; target phase independent of STATUS selects its own tasks.
- Missing e2e for applicable work → UNVERIFIED and exit 1, even when other checks pass.
- Failed or timed-out e2e → FAIL and exit 1 without state writes.
- Noncritical, doc/audit or standard work → existing check set, no deep e2e requirement.
- Malformed, conflicting or quick-level selectors → usage exit 2 before executing checks.
- Missing task/phase or missing default phase in deep full mode → exit 1 with remedy, not a false PASS.

## Interface
- check [--level quick|full] [--files path…] [--task NN-MM|--phase NN]; selectors valid only for full.
- runChecks(root, options) retains {checks, ok, note?}; task/phase selection adds e2e only when applicable.
- ctx check/done identify the exact full-check target and report missing required e2e as a blocker.

## Edge cases
- Missing e2e for applicable work → UNVERIFIED and exit 1, even when other checks pass.
- Failed or timed-out e2e → FAIL and exit 1 without state writes.
- Noncritical, doc/audit or standard work → existing check set, no deep e2e requirement.
- Malformed, conflicting or quick-level selectors → usage exit 2 before executing checks.
- Missing task/phase or missing default phase in deep full mode → exit 1 with remedy, not a false PASS.

## Steps
1. test/check.test.mjs and test/ctx-close.test.mjs: write task/phase/profile and failure fixtures first.
2. lib/check.mjs: parse and runChecks — validate selectors, derive critical code applicability through tasks.mjs, require configured e2e.
3. lib/ctx/check.mjs: phaseReport — render the exact phase check and missing-e2e blockers.
4. skills/check/SKILL.md: invoke the targeted full check while retaining manual acceptance verification.
5. README.md and skill tests: document/enforce selector, exit-code and profile behavior.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] An absent or failing required e2e cannot be masked by passing unit checks; existing command interpolation protections remain tested.

## Result
`telos check --level full` accepts mutually exclusive `--task NN-MM` / `--phase NN` (full only; malformed, repeated or quick-level → exit 2 before execution); deep without a selector uses the STATUS phase. Deep critical `code` tasks in the target append `e2e` after the full set through `runNamed` (same substitution, timeout, output bounds); unconfigured e2e → `UNVERIFIED`, exit 1, even when other checks pass. Missing task/phase/STATUS phase → `REFUSED`, exit 1, nothing runs. Standard, noncritical and doc/audit targets keep the plain set; `Target:` line printed for selected targets.
`ctx check`/`ctx done` show the exact `telos check --level full --phase NN` and, on deep, an `E2E:` line; an unconfigured required e2e is a close blocker. `/telos:check` runs that exact command; README rows updated.
Evidence: RED 11 failing tests before implementation (selectors and e2e absent); GREEN 482/482 (`npm test`). e2e: n/a (this repo is standard, no `checks.e2e`).
Note: `/telos:done` and `/telos:undo` still run plain `telos check --level full`, which on deep targets the STATUS phase; aligning `done` belongs to 05-12.
Deviations: none
