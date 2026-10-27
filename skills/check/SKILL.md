---
name: check
description: Run the full checks and verify the acceptance criteria of a Telos phase
argument-hint: "[NN]"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Read, Grep, Glob
---
## Context
!`telos ctx check`

## Request
$ARGUMENTS

## Instructions
Use the context above. Read only task files and the code a manual item needs. Change nothing:
no edits, no task, STATUS or ROADMAP changes, no commit.

1. **Target**: Request a two-digit `NN` other than the Target → run `telos ctx check <NN>` and
   use that bundle (exit 2 → say the argument must be a phase number). **Stop** when the context
   is `Requires standard profile. …` (reply with that line) or starts with `REFUSED:`.
2. **Full checks**: run the exact command from the `Full checks (…)` line,
   `telos check --level full --phase <NN>` for the Target phase. Exit 1 → FAIL, or UNVERIFIED when
   nothing is configured or an `E2E:` line says a required e2e is not configured; keep the
   failure lines. A passing unit check never covers a missing or failing required e2e.
3. **Acceptance**: run every command on the `Accept:` line, one `telos accept <id>` each.
4. **Manual items**: accept exit 0 never proves `MANUAL` items. For each done task, Read its
   `## Acceptance` and `## Result` and check every item without a command yourself (tests,
   code, docs). Mark each `verified` with its evidence or `unverified` with what is missing.
5. **Reply** in ≤ 10 lines: full-check verdict, accept verdict per task, manual items
   unverified, `Unresolved:` items, tasks under `Not done`; last line
   `Next: /telos:done` when everything passed and every task is done, else what to fix first.
