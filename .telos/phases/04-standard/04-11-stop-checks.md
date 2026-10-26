---
id: 04-11
title: Edited-file Stop checks
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: true
effort: hard        # normal | hard
depends: [04-06, 04-09]
decisions: []       # phase-local, e.g. [D-03]
scope: ["lib/edited.mjs", "lib/config.mjs", "lib/check.mjs", "hooks/edited.mjs", "hooks/stop.mjs", "hooks/hooks.json", "test/edited.test.mjs", "test/config.test.mjs", "test/manifest.test.mjs", "README.md"]
---
## Goal
Track edited paths and run one configured formatting/typecheck batch at Stop without looping or losing edits.

## Read first
- SPEC.md §8
- lib/config.mjs:8-25 (check schema)
- lib/accept.mjs:46-62 (bounded child execution)
- hooks/hooks.json:1-27 (hook registry)

## Files
- lib/edited.mjs (create)
- lib/config.mjs (modify)
- lib/check.mjs (modify)
- hooks/edited.mjs (create)
- hooks/stop.mjs (create)
- hooks/hooks.json (modify)
- test/edited.test.mjs (create)
- test/config.test.mjs (modify)
- test/manifest.test.mjs (modify)
- README.md (modify)

## Constraints
- Assumed: add optional checks.format; never auto-detect or invent formatting commands. No format configured means no formatter runs.
- Use configured {files} substitution from 04-06, not concatenated filenames; formatter operates only on accumulated paths when template supports it.
- PostToolUse produces no output; Stop emits failures only, respects stop_hook_active, and uses session-specific accumulation under .cache.
- Use atomic claim/merge of pending files so edits arriving during a check are not lost; no git/state writes.
- Minimal/missing Telos is silent; README documents format config and both hooks.

## Tests (write first)
- Repeated successful Edit/Write events deduplicate paths; unrelated tools, outside-repo paths and minimal profile are ignored.
- Stop runs configured format then types once for the claimed batch; no files/checks gives no subprocess or output.
- stop_hook_active suppresses reruns; failed/timed-out checks print bounded diagnostics without an infinite Stop loop and retain a recoverable batch.
- New edit while a batch runs survives for the next batch; failed claimed work remains recoverable.
- Spaces/metacharacters remain literal filenames; config accepts format and still rejects unknown keys.

## Interface
- checks.format is optional; format is Stop-only and does not make telos check --level full mutate source files.
- PostToolUse accumulates canonical paths in .cache/edited with session ownership; Stop atomically claims a batch.
- Reuse runChecks command execution/quoting with an explicit format/types selection; no implicit test or e2e run.

## Edge cases
- stop_hook_active true → no repeated checks.
- Concurrent new edit → retained in next pending batch.
- No format/types configured → silent no-op.
- Failure/timeout → bounded report and recoverable batch.

## Steps
1. test/edited.test.mjs and test/config.test.mjs: write lifecycle, quoting and race tests first.
2. lib/config.mjs and lib/check.mjs: support explicit format command and reusable format/types runner.
3. lib/edited.mjs: accumulate, claim and reconcile session-owned path batches safely.
4. hooks/edited.mjs and hooks/stop.mjs: wire PostToolUse/Stop with loop guard and failures-only output.
5. hooks/hooks.json, README.md and manifest tests: register/document hooks and optional checks.format.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] Stop batches run once, never lose edits arriving during checks, and do not guess formatter commands.

## Result
