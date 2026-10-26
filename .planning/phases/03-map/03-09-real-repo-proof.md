---
id: 03-09
title: Recorded headless proof on real Astro and Python repos
type: audit
status: draft
critical: false
effort: normal
depends: [03-08]
decisions: [D-02, D-04, D-06, D-07, D-08]
scope: [.telos/]
---
## Goal
Close the phase only after real model-built MAPs for the agreed Astro and Python repos
meet the size/format/navigation criteria and demonstrate a preserved incremental refresh.

## Read first
- SPEC.md §6
- SPEC.md §12
- SPEC.md §14
- lib/ctx/approve.mjs:43-57 (proposed-decision approval gate)

## Files
- .telos/phases/03-map/03-MAP-EVIDENCE.md (create)
- .telos/phases/03-map/evidence/ (create: MAP snapshots and compact run measurements)

## Constraints
- Q-01 must be answered and D-08 confirmed before approval/execution; record the selected paths and full revisions in evidence. Never substitute synthetic fixtures for the real-repo criterion.
- Use disposable local copies/checkouts, not the original repos; prepare a clean committed source baseline. Initialize via CLI so headless init's unavailable questions do not block map testing.
- Carry-over: no AskUserQuestion in headless runs → 02-14 Result; require an assumptions list and unconfirmed PROJECT draft, not an invented user approval.
- Run `claude -p --plugin-dir <telos>` using base map for one repo and map-hard for the other; refresh both with their corresponding skill. No pushes or dependency installation needed for mapping.
- Audit writes only this task's Result/evidence in Telos; model output and probe commits stay in disposable repos. If verification fails, record findings and block completion; implementation fixes require a reviewed follow-up.

## Steps
1. Record repo identity/revision, source inventory size, Telos revision, model/command/date and config limit; prepare isolated initialized checkouts with clean source state.
2. Run each full map headlessly; save MAP/PROJECT output, compact transcript evidence and actual token usage when available. Re-run CLI validation; measure scan, bundle and MAP sizes.
3. Spot-check at least three concrete navigation refs per repo (entry, flow, Area), including file existence and cited line ranges; verify PROJECT section/line limits, ownership and pending confirmation.
4. In each disposable repo commit a small probe change chosen to affect ≤30% of units; run --refresh, compare every unaffected block byte-for-byte, verify changed refs/header and total cap; then run a no-change refresh.
5. Save before/after MAP artifacts and results in evidence; run repository checks, record deviations/gaps and only close phase when every gate passes.

## Acceptance
- [ ] `npm test` → exit 0
- [ ] `claude plugin validate .` → exit 0
- [ ] Evidence identifies one real Astro and one real Python repo at pinned revisions and records successful headless full/refresh invocations.
- [ ] Both MAPs have the exact header and five sections, no Not built yet text, correct checked refs, and estimated tokens ≤ configured limits; scans and bundles obey their caps.
- [ ] Both refreshes update affected sections/Areas, preserve unaffected bytes and remain under limit; no-change refresh preserves the body.
- [ ] PROJECT is a clearly unconfirmed draft without stack/check duplication; authored content survives; assumptions are listed without questions blocking execution.
- [ ] Saved artifacts and measurements substantiate the done criterion; §12 actual usage is recorded if available, with any target miss noted for phase 06 rather than hidden.

## Result
