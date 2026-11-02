---
id: 07-11
title: Headless session lifecycle and Telos transitions
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: [07-04]    # task IDs, e.g. [01-01]
decisions: [D-05, D-08, D-09, D-12]
scope: ["bench/lib/session.mjs", "bench/lib/transitions.mjs", "bench/README.md", "test/bench-session.test.mjs", "test/fixtures/bench/"]
---
## Goal
Run the sessions of one cell: build each `claude -p` invocation, enforce per-session budget and timeout, apply the retry rule, and drive the deterministic C/D multi-session transitions (plan → lint → confirm → approve → do/do-hard per generated task) and the A/B step sequence.

## Read first
- bench/PROTOCOL.md (transition script, retry rule, model and permission treatment)
- bench/lib/sandbox.mjs (sessionEnv from 07-04)
- .telos/phases/06-measure/06-WORKFLOW-EVIDENCE.md §Run matrix and accounting method (fixed before the runs)
- README.md §CLI (`telos task set`, `telos status`, `telos lint-plan`)

## Files
- bench/lib/session.mjs (create)
- bench/lib/transitions.mjs (create)
- bench/README.md (modify)
- test/bench-session.test.mjs (create)
- test/fixtures/bench/ (modify)

## Constraints
- D-09 [proposed]: every session gets the same pinned `--model`, permission mode and base allow list; Telos skills keep their shipped overrides; record argv, env names (never values), session id.
- D-12 [proposed]: every session runs with `--max-budget-usd <per-session reservation>`; the sum of a cell's sessions never exceeds the cell reservation passed in.
- D-05 [proposed]: transitions are data-driven from `telos` CLI output (lint-plan exit, `telos status` Next, task list in dependency order); any refusal, blocker, lint failure or unexpected Next → scenario `failed` with the reason; no free-form model judgement in the runner.
- Timeout kills the whole process group (child processes included); retries only for host errors before the first turn, ≤ 2, each retry's usage kept.
- Free task text is one argv element; nothing is shell-interpolated.
- D-08 [proposed]: the host process is launched as the dedicated benchmark OS user (configured launcher prefix, e.g. `sudo -u <user> --`), with the env from `sessionEnv`; a missing launcher → refused, never a silent fallback to the author's user.

## Tests (write first)
- argv per variant from a fake `claude`: same `--model` and permission flags for all; `--plugin-dir` only for C/D; `--max-budget-usd` always present
- C/D scenario on a fake host: plan → lint ok → confirm session → `telos task set … status=approved` → do per task in `depends` order; a task whose Next is `/telos:do-hard <id>` runs do-hard
- lint-plan fails, plan leaves `Awaiting user` after the confirm session, or do reports a blocker → `failed` with the reason, no further sessions
- A/B multi-session: one fresh session per protocol step, distinct session ids
- host error before the first turn → ≤ 2 retries, all attempts kept; error after turns → no retry
- timeout kills a fake host that spawned a child; no process left
- host JSON without `usage` → session recorded with `usage: null`, not zeros
- hostile task text reaches the fake host verbatim

## Interface
- `runSession({ prompt, env, argvBase, budgetUsd, timeoutMs, spawn })` → `{ sessionId, argv, exit, json, usage|null, ms, attempts }`
- `runTrajectory(cell, ctx)` → `{ sessions: [...], status: completed|failed|timeout|infra-failed, reason? }`

## Edge cases
- lint failure → `failed: lint`
- awaiting user left after confirm → `failed: awaiting`
- do-hard suggested → do-hard used
- missing usage → `usage: null`
- child process survives timeout → killed via process group
- host error before first turn → ≤ 2 retries

## Steps
1. test/fixtures/bench/: scripted fake host and fake `telos` responses; write the tests.
2. bench/lib/session.mjs: argv build, budget flag, spawn in its own process group, timeout kill, retry rule.
3. bench/lib/transitions.mjs: C/D state machine and A/B step loop.
4. bench/README.md: transition table; run `npm test`.

## Acceptance
- [x] all listed tests pass
- [x] `node --test test/bench-session.test.mjs` → exit 0
- [x] `npm test` → exit 0

## Result
Built `bench/lib/session.mjs` (`baseArgv`, `runSession`: launcher required, prompt as the last argv element after `--`, `--session-id`/`--max-budget-usd` per attempt, own process group with SIGTERM→SIGKILL on timeout, ≤ 2 pre-first-turn retries sharing the session budget, `usage`/`costUsd` null when absent, env names only) and `bench/lib/transitions.mjs` (`runTrajectory`: A/B step loop, C/D plan → lint → confirm → approve → Next loop, reservation shared across sessions). Fake host and fake `telos` fixtures; 14 tests in `bench-session` (667 total), all green; a mutation (killing the pid instead of the group) is caught.
Interpretation: approval runs as a `/telos:approve` session (PROTOCOL §6.3 amendment), not `telos task set … approved` as the Tests line says; a blocker is followed only via the shipped `/telos:do` → `/telos:do-hard` escalation, otherwise `failed: blocker`. With a sudo-style launcher SIGKILL cannot reach the other user's processes; the SIGTERM relay is what the pilot canaries must confirm (README).
Deviations: none
