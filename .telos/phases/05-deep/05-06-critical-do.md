---
id: 05-06
title: Critical TDD and review execution
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: [05-02, 05-05]
decisions: [D-01, D-02]
scope: ["lib/ctx/do.mjs","shared/do.md","skills/do/SKILL.md","skills/do-hard/SKILL.md","test/ctx-do.test.mjs","test/skills.test.mjs","README.md"]
---
## Goal
Require review and recorded RED/GREEN/e2e evidence before completing deep critical code tasks.

## Read first
- SPEC.md §3
- SPEC.md §4.3
- shared/do.md:8-48 (start, work, verification, Result and blocked paths)
- lib/ctx/do.mjs:175-224 (doBundle task and checks)
- skills/do-hard/SKILL.md:1-13 (hard wrapper)

## Files
- lib/ctx/do.mjs (modify)
- shared/do.md (modify)
- skills/do/SKILL.md (modify)
- skills/do-hard/SKILL.md (modify)
- test/ctx-do.test.mjs (modify)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- D-02 [proposed]: Result stores compact command/exit/failure-reason RED evidence, GREEN/e2e outcome and review verdict/evidenceId; no new evidence database or transcript ingestion.
- D-02 [proposed]: deep critical code must demonstrate a meaningful failing test before implementation; an already-green test or environment failure is not RED.
- D-01 [proposed]: invoke the reviewer agent with prepared ctx review input, not the user-invoked-only /telos:review skill; critical work uses reviewer-hard.
- Review once before task completion/commit; fix supported findings in scope, rerun tests/acceptance, and block unresolved HIGH/CRITICAL or incomplete coverage without a re-review loop.
- Preserve two failed-fix limit, auto_commit behavior and doc/audit/minimal/standard flow; no new review requirement for noncritical work.
- Expose profile/critical requirements before optional excerpts within 6000 chars; README do/do-hard and ctx do rows must match.

## Tests (write first)
- Deep critical code bundle exposes profile, RED/e2e/reviewer-hard requirements and exact task-check command.
- Already-green tests or environmental failure → no accepted RED evidence; stop with a concrete remedy.
- Resumed critical task with missing evidence → recover actual recorded evidence or block; never fabricate RED.
- Incomplete review or unresolved HIGH/CRITICAL → blocked task, no completion or commit.
- Noncritical or lower-profile task → no new deep gates; doc/audit remains type-specific.
- One successful review plus fixed findings reruns checks/acceptance, records evidence within Result limits and respects auto_commit=false.

## Interface
- ctx do keeps its current selector contract and adds mandatory deep execution requirements before optional excerpts.
- Result remains 3–5 lines ending Deviations; include compact RED, GREEN/e2e and review evidence on those lines.
- Caller launches the named reviewer agent using the prepared bundle; wrappers authorize that operation consistently.

## Edge cases
- Already-green tests or environmental failure → no accepted RED evidence; stop with a concrete remedy.
- Resumed critical task with missing evidence → recover actual recorded evidence or block; never fabricate RED.
- Incomplete review or unresolved HIGH/CRITICAL → blocked task, no completion or commit.
- Noncritical or lower-profile task → no new deep gates; doc/audit remains type-specific.

## Steps
1. test/ctx-do.test.mjs and test/skills.test.mjs: write deep/type/resume and failure contract tests first.
2. lib/ctx/do.mjs: doBundle — surface profile and critical verification requirements ahead of excerpts.
3. shared/do.md: work/verify/Result — require real RED, targeted checks and one prepared reviewer invocation before state changes.
4. skills/do*/SKILL.md: permit the named reviewer handoff without enabling arbitrary delegation.
5. README.md: document the changed execution and evidence contract.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] Deep critical completion requires meaningful RED, green e2e and a resolved review; lower profiles retain their workflow.

## Result
ctx do adds `Profile:` and, for deep critical code only, a never-cut `Deep critical (D-02)` block: real-RED rule, exact `telos check --level full --task <id>` with e2e (missing → blocked), one reviewer-hard round on `telos ctx review <id>`, Result evidence lines and recorded-RED recovery on resume.
shared/do.md gates deep critical work on real RED written to Result before implementing, the targeted check and one review before state changes (unfixable HIGH/CRITICAL, UNVERIFIED or REFUSED → blocked); do/do-hard allow only `Agent(telos:reviewer-hard)`.
489 tests pass (+7). README do/do-hard and ctx do rows updated.
Deviations: none
