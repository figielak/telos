---
id: 07-05
title: Run metrics from host JSON and transcripts
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [07-12]    # task IDs, e.g. [01-01]
decisions: [D-01, D-06, D-09]
scope: ["bench/lib/metrics.mjs", "bench/lib/sanitize.mjs", "bench/README.md", "test/bench-metrics.test.mjs", "test/fixtures/bench/"]
---
## Goal
Turn one raw run record (host JSON per session plus transcripts, including subagents) into a flat metrics row, and produce sanitized transcripts, patches and grading outputs that can be published and re-scored.

## Read first
- bench/PROTOCOL.md (metric definitions, redaction process)
- bench/lib/orchestrate.mjs (record shape from 07-12)
- .telos/phases/06-measure/06-RESULTS.md (fresh = input + cache_creation; cache_read never added)

## Files
- bench/lib/metrics.mjs (create)
- bench/lib/sanitize.mjs (create)
- bench/README.md (modify)
- test/bench-metrics.test.mjs (create)
- test/fixtures/bench/ (modify)

## Constraints
- D-06 [proposed]: row fields: cost_usd (all attempts, retries, timeouts), input, cache_creation, fresh (named "fresh", never "total"), output, cache_read, turns, wall_ms, sessions, per-model cost and turns (D-09), tool counts, denied tool calls, explore_calls, explore_bytes, out_of_scope_paths, status, accepted.
- Exploration is a narrow proxy and labelled so: calls and returned bytes (tool_result content length) of Read/Grep/Glob and read-like Bash commands (`cat`, `head`, `tail`, `sed -n`, `grep`, `rg`, `find`, `ls`, `git show|log|diff`), including subagent transcripts, before the first product-code mutation; edits to `.telos/`, CLAUDE.md and other instruction files are not product-code mutations; unclassifiable Bash is counted separately.
- Missing or unparsable transcript → exploration `null` with `unverified: true`, never 0; missing usage stays `null`.
- Sanitizer removes home paths, user names, e-mail addresses, API-key-like strings and absolute work dirs from transcripts, patches and grading output, and logs every rule hit count; the raw sha256 is kept only as a pointer.
- Fixtures are hand-made host-like samples; audit the classifier on pilot transcripts in 07-08.

## Tests (write first)
- usage of two sessions sums per field; fresh = input + cache_creation; cache_read separate; retry attempts included in cost
- per-model cost from a transcript with sonnet and opus turns
- exploration stops at the first product-code edit; an earlier `.telos/STATUS.md` edit does not stop it
- `cat src/a.py` via Bash counts as exploration; `npm test` does not; an unknown command counts as unclassified
- subagent transcript reads before the main session's first product edit are included
- missing transcript → `unverified: true`, exploration `null`
- changed paths outside expectedPaths → out_of_scope_paths
- sanitizer strips `/home/<user>`, e-mail and `sk-ant-…`-like tokens from transcript and patch text and reports hit counts

## Steps
- Fixtures and tests first.
- bench/lib/metrics.mjs: `rowFromRecord(record, { transcriptsDir })`, `readTranscript(path)`, `classifyBash(command)`.
- bench/lib/sanitize.mjs: `sanitize(text, { home, user, workDir })` → `{ text, hits }`.
- bench/README.md: metric glossary and redaction rules.
- Run `npm test`.

## Acceptance
- [ ] all listed tests pass
- [ ] `node --test test/bench-metrics.test.mjs` → exit 0
- [ ] `npm test` → exit 0

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
