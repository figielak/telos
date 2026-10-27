---
id: 05-03
title: Prepared research workflow
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: [05-02]
decisions: [D-06]
scope: ["lib/ctx/research.mjs","lib/ctx/index.mjs","agents/researcher.md","agents/researcher-hard.md","skills/research/SKILL.md","skills/research-hard/SKILL.md","shared/research.md","test/ctx-research.test.mjs","test/agents.test.mjs","test/skills.test.mjs","README.md"]
---
## Goal
Provide research context and forked researcher skills that return a short sourced recommendation for a selected phase.

## Read first
- SPEC.md §9
- SPEC.md §5.0
- lib/ctx/plan.mjs:42-95 (phase target and CONTEXT lookup)
- lib/ctx/index.mjs:22-50 (registry and cap)
- test/skills.test.mjs:24-60 (variant contracts)

## Files
- lib/ctx/research.mjs (create)
- lib/ctx/index.mjs (modify)
- agents/researcher.md (create)
- agents/researcher-hard.md (create)
- skills/research/SKILL.md (create)
- skills/research-hard/SKILL.md (create)
- shared/research.md (create)
- test/ctx-research.test.mjs (create)
- test/agents.test.mjs (modify)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- D-06 [proposed]: one page means ≤60 authored lines for NN-RESEARCH.md; preserve existing research unless the user explicitly requests replacement.
- D-06 [proposed]: the researcher returns text with Read/Grep/Glob/WebSearch/WebFetch only; the invoking main thread persists it to the exact target phase path. Do not grant agent Write to bypass this boundary.
- Input is phase goal, open questions, stack and relevant MAP lines; search current primary docs/versions before proposing new dependencies.
- Do not browse the repository beyond prepared pointers, decide open questions for the user, or mutate CONTEXT/STATUS/ROADMAP.
- Use Sonnet/Opus agent variants with shared instructions and disable-model-invocation: true; free text stays in Request.
- Node ESM, no dependencies; context ≤6000 chars; README rows cover research/research-hard and ctx research.

## Tests (write first)
- Deep bundle includes only target goal/questions, stack and relevant MAP; other profiles return exact deep gate.
- Missing phase or CONTEXT → REFUSED with remedy, no file creation.
- No open questions → goal-based research, without inventing a user decision.
- Unavailable source/network → explicit uncertainty and no fabricated citation.
- Existing research without replacement authorization → preserve it and return the proposed update.
- Forked agents have no write tools; result handoff names one NN-RESEARCH.md and enforces ≤60 lines.

## Interface
- ctx research [NN] defaults to STATUS phase; malformed selector → exit 2; valid unavailable target → REFUSED.
- Forked research returns recommendations, options/trade-offs, dated sources and unresolved items; main-thread handoff persists the bounded report.
- The phase path and overwrite policy are part of the prepared bundle, never chosen by web content.

## Edge cases
- Missing phase or CONTEXT → REFUSED with remedy, no file creation.
- No open questions → goal-based research, without inventing a user decision.
- Unavailable source/network → explicit uncertainty and no fabricated citation.
- Existing research without replacement authorization → preserve it and return the proposed update.

## Steps
1. test/ctx-research.test.mjs and agent/skill tests: write target, gate, cap and handoff cases first.
2. lib/ctx/research.mjs: researchBundle — assemble bounded phase inputs and existing-report status.
3. agents/researcher*.md and shared/research.md: define search-first output and main-thread persistence handoff.
4. skills/research*/SKILL.md and lib/ctx/index.mjs: wire fork variants and register the bundle.
5. README.md: document research commands, report bounds and fork handoff limitations.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] Research never silently overwrites a report or changes a decision; automated tests do not claim live web/host proof.

## Result
Added `telos ctx research [NN]` (`lib/ctx/research.mjs`): deep-gated, read-only bundle with the phase target, CONTEXT Goal, open questions, stack, topic-matched MAP lines, one `Report:` path with its overwrite policy, the date and any existing report as `| `-prefixed data; lists are budgeted with omission lines under the 6000-char cap; missing STATUS/ROADMAP phase or CONTEXT → REFUSED, nothing created.
Added read-only `researcher` (Sonnet) / `researcher-hard` (Opus) agents, `shared/research.md` (search-first, ≤ 60-line report with dated sources, no invented citations or decisions, one `Handoff:` line: create / replace with `--replace` / keep + proposed update) and forked `/telos:research*` skills; README rows and agent notes.
Tests: `test/ctx-research.test.mjs` (9) plus agent and skill contract tests; 467 tests pass.
Surprise: like the reviewer, the researcher gets `Bash(telos ctx research *)` (read-only) so a validated `NN` can rerun the bundle; it still has no write tools. Live web search, fork and main-thread handoff are not exercised by tests (README says so).
Deviations: none
