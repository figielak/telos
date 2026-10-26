---
id: 03-05
title: Map skills and an unconfirmed PROJECT draft
type: code
status: draft
critical: false
effort: normal
depends: [03-04]
decisions: [D-06]
scope: [skills/map/, skills/map-hard/, shared/map.md, test/skills.test.mjs, README.md]
---
## Goal
Make init's suggested `/telos:map` real: build MAP from targeted evidence and draft PROJECT
for confirmation; provide `/telos:map-hard` with the same instructions on opus.

## Read first
- SPEC.md §6
- SPEC.md §4.1
- skills/plan/SKILL.md:1-16 (context/shared injection and Request)
- skills/plan-lite/SKILL.md:1-16 (variant pattern)
- test/skills.test.mjs:46-81 (variant and shared-body contracts)
- test/skills.test.mjs:110-115 (argument injection restriction)

## Files
- skills/map/SKILL.md (create)
- skills/map-hard/SKILL.md (create)
- shared/map.md (create)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- Carry-over: init's Next names /telos:map; headless AskUserQuestion is unavailable → 02-14 Result.
- map = sonnet, map-hard = opus; user-invoked only; same body/tool permissions, identity/model metadata differ; shared body ≤ 60 lines.
- One context injection `telos ctx map` plus `telos ctx shared map`; raw arguments only under Request. No free text in shell commands.
- Allowed tools: Bash(telos *), Read, Grep, Glob, Edit/Write limited to `.telos/MAP.md` and `.telos/PROJECT.md`; no git writes.
- Read only suggested entry/key-file excerpts (3–8 distinct files when available, fewer for tiny repos); verify referenced paths/ranges and label uncertain flows as assumptions.
- Before replacement, capture the existing MAP via its exact bundle pointer for rollback; no `.telos/` enumeration or unrelated document reads.
- Draft empty PROJECT sections only: Purpose ≤ 100-char first line, Rules ≤ 10 lines, whole file ≤ 60 lines; no stack or check commands. Preserve authored content and label the draft unconfirmed in the reply.
- Until 03-07, literal --refresh reports not available; other nonempty arguments report usage. Do not pretend a full build was incremental.

## Tests (write first)
- Models/variant bodies/permissions and both fixed injections match the contracts; arguments never reach injections.
- Shared instructions require targeted reads, all MAP headings/header, stub removal, ownership rules and post-write ctx validation with at most two repair attempts.
- PROJECT handling preserves authored sections, lists assumptions and requests later confirmation without requiring AskUserQuestion; headless completion remains possible.
- Shared body stops on REFUSED, reports invalid arguments/temporary refresh unavailability, and never commits or edits ROADMAP.

## Steps
1. Extend skill contract tests for map/map-hard and the shared workflow.
2. Create the two thin skill files and shared/map.md: bundle → targeted excerpts → MAP → fresh validation → PROJECT draft → concise summary.
3. Require successful validation before reporting completion; retain an existing MAP or restore it if repair cannot produce a valid replacement.
4. Add README rows for both skills, confirmation semantics and current refresh availability; run tests and plugin validation.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] `claude plugin validate .` → exit 0
- [ ] Both skills share a ≤ 60-line body, work without questions and require MAP validation before success.
- [ ] Headless behavioral proof is explicitly deferred to 03-09; static instruction tests do not claim it.

## Result
