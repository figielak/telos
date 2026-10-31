---
id: 06-03
title: Derive the next step after a completed map
type: code
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal
depends: []
decisions: []
scope: ["lib/status.mjs","test/status.test.mjs","test/session.test.mjs","test/ctx.test.mjs","test/e2e-map.test.mjs","README.md"]
---
## Goal
Replace init's stale map suggestion at read time once MAP is valid, consistently in status, ctx status and SessionStart.

## Read first
- lib/init.mjs:15-18 (init next-step constants)
- lib/status.mjs:84-103 (view)
- lib/map.mjs:120-139 (inspectMap)
- lib/ctx/status.mjs:11-20 (statusBundle)
- lib/session.mjs:34-52 (shared view and cap)

## Files
- lib/status.mjs (modify)
- test/status.test.mjs (modify)
- test/session.test.mjs (modify)
- test/ctx.test.mjs (modify)
- test/e2e-map.test.mjs (modify)
- README.md (modify)

## Constraints
- Carry-over #3: stale Next after map — init sets Next=/telos:map on repos with code, map never edits STATUS, so status/SessionStart keep suggesting it; derive Next at read time when MAP is built → lib/init.mjs:17,90.
- Recognize only init's exact default map hint; preserve explicit user Next text, active work and blockers. Use inspectMap and configured limits, not a new parser.
- Never write STATUS from a reader or let map edit it. SessionStart stays <=1200 chars; bundle stays <=6000 chars.
- Update status/ctx status CLI and SessionStart README rows for the derived hint.

## Tests (write first)
- Valid built MAP plus init's unchanged map hint and no active work yields the first-plan hint in all three consumers.
- Missing/stub/malformed/over-budget MAP retains the map hint; custom Next and active phase/task are preserved.
- Blockers and Awaiting user remain visible and are not displaced by derived guidance.
- All read paths leave STATUS and repository bytes unchanged and preserve existing output caps.


## Steps
- Add status/session/context regressions for the init-to-map transition and preservation cases.
- Derive the default Next in the shared status view using existing MAP validation.
- Extend the map lifecycle proof and document the read-time behavior.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] status, ctx status and SessionStart agree without any STATUS write or manual repair.

## Result
