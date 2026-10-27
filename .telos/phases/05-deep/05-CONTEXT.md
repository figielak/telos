# 05 · Deep profile
## Goal
Complete the deep workflow with prepared research/review agents, critical-task verification and diff-driven documentation maintenance. A deep phase must close with doc-sync, a concise retrospective and ADR promotion, and support ADR-aware undo.

## Decisions
- D-01: Review exact task commits plus current task-scope edits, or phase-tag changes plus current phase edits; missing tags refuse. Bounded prepared evidence includes snapshot identity and precise continuations; incomplete coverage is UNVERIFIED, never clean.
- D-02: Store compact real RED/GREEN/e2e and review snapshot evidence in Result. Full checks gain explicit task/phase selectors; deep critical code requires configured e2e, with missing e2e blocking; doc/audit and lower profiles keep existing verification.
- D-03: Use bounded heuristic path/public-symbol matching for diff-driven docs candidates, report omissions and inspect them before claiming sync. Scopes are literal repo-relative paths; changelog drafts are read-only and skills condense to ≤10 entry lines without inventing a version.
- D-04: ADRs require confirmed source decisions and safe retryable CLI-owned header transitions. Map undo ownership through task.decisions, require explicit ADR IDs for shared sources, and never automatically reactivate a superseded predecessor.
- D-05: Retro is a short deep done step recorded in the phase HISTORY close entry and reply, with reusable lessons proposed through the existing lesson workflow; no new retro command/file or automatic memory edits.
- D-06: Research output is ≤60 authored lines. Read-only forked researchers return text for main-thread persistence; preserve existing reports unless replacement is authorized. Deep planning consumes optional research and performs one self-critique, without automatic research or a second question round.

## Constraints
- Plan on the repository's actual standard profile; implement deep behavior without changing this repository's profile or lower-profile contracts.
- Fifteen tasks target approximately one hour each; foundations precede integration. Agent/skill contracts and deterministic fixture proof do not claim live-host or web/model-quality verification.
- Reviewer/researcher are the only deep agents; no background invocation or extra checker loop. CLI never writes git.
- Planner writes only this phase's files; ROADMAP/STATUS/task status changes use the authorized CLI. No implementation or commits in this planning session.

## Open questions
- none

## Carried over
- `telos adr new "<title>" --source NN:D-MM [--supersedes NNN]` fills ADR header, flips superseded ADR → SPEC §11, 01-04 Result ⇒ 05-10
- /telos:map asks to commit docs(telos): map (MAP.md + PROJECT.md, explicit paths) when git.auto_commit is true; else leaves commit to user → shared/map.md, quick c5bc63f ⇒ 05-14

## Links
- .telos/MAP.md §Context bundles
- SPEC.md §3, §4, §5, §8, §9, §11
- .telos/phases/04-standard/04-08-undo.md
- .telos/phases/04-standard/04-13-standard-loop.md
