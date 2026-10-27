---
id: 05-14
title: Deep map reminders and commit prompt
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: []
decisions: []
scope: ["lib/map-stale.mjs","hooks/stop.mjs","lib/ctx/map.mjs","shared/map.md","skills/map/SKILL.md","skills/map-hard/SKILL.md","test/map-stale.test.mjs","test/ctx-map.test.mjs","test/skills.test.mjs","test/manifest.test.mjs","README.md"]
---
## Goal
Warn about deep map staleness at Stop and complete map maintenance with the carried-over explicit commit prompt.

## Read first
- SPEC.md §8
- hooks/stop.mjs:1-18 (Stop subprocess protocol)
- lib/edited.mjs:98-117 (stopChecks loop guard)
- lib/map.mjs:126-140 (inspectMap header)
- lib/map-scan.mjs:147-205 (scanRepo entry candidates)
- lib/ctx/map.mjs:99-146 (mapBundle fixed metadata)
- shared/map.md:28-45 (validation and final commit guidance)

## Files
- lib/map-stale.mjs (create)
- hooks/stop.mjs (modify)
- lib/ctx/map.mjs (modify)
- shared/map.md (modify)
- skills/map/SKILL.md (modify)
- skills/map-hard/SKILL.md (modify)
- test/map-stale.test.mjs (create)
- test/ctx-map.test.mjs (modify)
- test/skills.test.mjs (modify)
- test/manifest.test.mjs (modify)
- README.md (modify)

## Constraints
- Carry-over #3: /telos:map asks to commit docs(telos): map (MAP.md + PROJECT.md, explicit paths) when git.auto_commit is true; else leaves commit to user → shared/map.md, quick c5bc63f.
- Deep Stop reminder is mechanical and advisory: new top-level directories or entry points since MAP header commit; no LLM calls or automatic refresh.
- Reuse map/header and entry-candidate conventions, but keep the hook bounded and avoid a full source-content scan on every Stop.
- Minimal/standard/missing Telos are silent; stop_hook_active suppresses reminder loops; preserve existing blocking format/type failure behavior.
- Map commit requires the explicit user confirmation from the carry-over; auto_commit=false performs no git writes. Unrelated staged files must never enter a map commit.
- Bundle includes auto-commit policy; both variants share the body; add README map/map-hard, ctx map and Stop rows.

## Tests (write first)
- New top-level source directory or declared entry point after MAP baseline → concise deep advisory reminder.
- Existing-directory ordinary edit → no reminder; vendor/cache/.telos paths are excluded.
- Minimal/standard, missing/broken MAP baseline or stop_hook_active → silent safe no-op.
- Existing format/type failure plus stale map → failure still blocks; reminder never becomes an exit-2 gate itself.
- auto_commit=true and confirmed validated map → explicit MAP/changed PROJECT paths and docs(telos): map subject.
- Declined prompt, auto_commit=false, validation failure or unrelated staged files → no unintended git commit.

## Interface
- mapStaleness(root, input) returns a short advisory or null; read-only git/files, bounded path/manifest evidence.
- Stop emits the advisory through the host's nonblocking output channel while preserving existing check failure exit 2.
- Map asks once after successful validation; only confirmed relevant paths may be committed by the skill.

## Edge cases
- New top-level source directory or declared entry point after MAP baseline → concise deep advisory reminder.
- Existing-directory ordinary edit → no reminder; vendor/cache/.telos paths are excluded.
- Minimal/standard, missing/broken MAP baseline or stop_hook_active → silent safe no-op.
- Existing format/type failure plus stale map → failure still blocks; reminder never becomes an exit-2 gate itself.
- Declined prompt, auto_commit=false, validation failure or unrelated staged files → no unintended git commit.

## Steps
1. test/map-stale.test.mjs and map/skill tests: write profile, baseline, Stop-composition and commit-policy cases first.
2. lib/map-stale.mjs: mapStaleness — compare bounded path/entry evidence against the MAP commit.
3. hooks/stop.mjs: compose advisory output without changing stopChecks failure semantics or loop guard.
4. lib/ctx/map.mjs and shared/map.md: expose commit policy and replace never-commit instructions with the exact confirmation flow.
5. skills/map*/SKILL.md, tests and README.md: grant narrow commit/prompt tools and document both map variants and reminder.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] Deep map drift is advisory; a map commit occurs only after requested confirmation and includes no unrelated work.

## Result
