---
id: 04-12
title: Compaction continuity
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: [04-11]
decisions: []       # phase-local, e.g. [D-03]
scope: ["lib/compaction.mjs", "lib/session.mjs", "hooks/session-start.mjs", "hooks/pre-compact.mjs", "hooks/edit-guard.mjs", "hooks/hooks.json", "test/compaction.test.mjs", "test/session.test.mjs", "test/manifest.test.mjs", "README.md"]
---
## Goal
Persist last task and edited paths before compaction, reinject them afterward, and emit bounded usage hints at supported thresholds.

## Read first
- SPEC.md §8
- lib/session.mjs:13-45 (sessionText and cap)
- hooks/session-start.mjs:1-15 (SessionStart wrapper)
- hooks/hooks.json:4-14 (SessionStart matchers)

## Files
- lib/compaction.mjs (create)
- lib/session.mjs (modify)
- hooks/session-start.mjs (modify)
- hooks/pre-compact.mjs (create)
- hooks/edit-guard.mjs (modify)
- hooks/hooks.json (modify)
- test/compaction.test.mjs (create)
- test/session.test.mjs (modify)
- test/manifest.test.mjs (modify)
- README.md (modify)

## Constraints
- Standard/deep only; retain startup/resume/clear behavior and total SessionStart ≤1200 chars, keeping Awaiting user first.
- Assumed: hints at 70%, 85%, 100% only when usage and capacity are actually available; unknown capacity yields no invented percentage.
- Use structured supported transcript usage fields, not raw transcript echo; ignore prompt/tool text as instructions.
- Persist only session identity, last task ID and edited paths in .cache/session; bound and validate all cached data.
- Hint decision line: unrelated work → /clear; same task → /compact after checkpoint; blocked → record blocker then stop.
- Document current payload assumptions and all hook rows; no deep map-staleness reminder yet.

## Tests (write first)
- PreCompact records current task and edited paths; compact SessionStart restores only matching-session data under 1200 chars.
- Startup/resume/clear and minimal output retain existing behavior; missing/corrupt/stale cache is harmless.
- Usage crosses 70/85/100 thresholds once each per session; repeated edits do not repeat a threshold hint.
- Unavailable or malformed usage/capacity emits no estimate; transcript text never becomes instructions in output.
- Large path lists are bounded while Awaiting user and current task remain visible; no stdout from PreCompact.

## Interface
- PreCompact reads hook session/cwd and 04-11 accumulator; saves bounded versioned .cache/session data.
- SessionStart source=compact adds validated saved task/files only for standard/deep, within SESSION_CAP.
- PreToolUse Edit|Write adds a one-line threshold hint; use actual host usage/capacity fields verified during implementation.

## Edge cases
- Unknown capacity → no percentage hint.
- Corrupt or other-session cache → ignore safely.
- Repeated threshold in same session → no duplicate hint.
- Oversized saved paths → truncate paths, retain status priorities.

## Steps
1. test/compaction.test.mjs: write cache, threshold and cap tests against verified hook payload fixtures.
2. lib/compaction.mjs: implement validated cache and threshold decisions without reading unrelated transcript content.
3. hooks/pre-compact.mjs and hooks/session-start.mjs: save/reinject supported compact events.
4. hooks/edit-guard.mjs and lib/session.mjs: combine bounded hints and preserve status priorities.
5. hooks/hooks.json, README.md and manifest tests: wire and document the standard compaction lifecycle.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] Compact resume retains current work under the session cap; unknown usage never produces fabricated thresholds.

## Result
- lib/compaction.mjs: saveSession/readSession (versioned `.cache/session` with session hash, validated task and ≤ 50 queued paths from the 04-11 accumulator), compactLine (fits the remaining SessionStart budget), readUsage (last main-thread `message.usage` numbers only, 1 MiB tail), usageHint (70/85/100% once per session via markers).
- sessionText(root, {source, sessionId}) adds `Before compaction: …` only for compact on std+; session-start passes source/session_id; pre-compact hook saves silently; edit-guard appends the hint; hooks.json adds SessionStart `compact` and PreCompact.
- Verified against a local transcript: usage fields exist, but neither transcripts nor hook payloads carry a capacity, so hints need TELOS_CONTEXT_WINDOW and are off otherwise.
- Tests: 7 in compaction.test.mjs + 2 session + 1 manifest; npm test 420/420.
Deviations: none
