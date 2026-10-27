---
name: done
description: Close the current Telos phase after full checks and acceptance, recording HISTORY
argument-hint: "[NN]"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Bash(git status*), Bash(git add *), Bash(git commit *), Read, Grep, Glob, Edit(.telos/phases/**)
---
## Context
!`telos ctx done`

## Request
$ARGUMENTS

## Instructions
Use the context above. Change ROADMAP, STATUS, task state and HISTORY only through `telos`
commands; edit only the phase CONTEXT. Never push, amend, tag or use `--no-verify`.

1. **Target**: Request a two-digit `NN` other than the Target → run `telos ctx done <NN>` and use
   that bundle. **Stop** when the context is `Requires standard profile. …` (reply with that line)
   or starts with `REFUSED:` (show it; an already done phase is not closed again).
2. **Blocked**: `Close: blocked` → list every reason with its fix (`/telos:do`, `/telos:discuss`,
   configure checks) and stop, changing nothing.
3. **Verify, before any state change**:
   - `telos check --level full` must exit 0; FAIL or UNVERIFIED → stop.
   - each `telos accept <id>` on the `Accept:` line must end `PASS`; a FAIL → stop.
   - manual items: accept exit 0 never proves them. Read each done task's Acceptance and Result
     and check every item without a command yourself; one you cannot verify → stop.
   On any stop the phase stays active, no history is written; never mark tasks done, tick
   boxes or edit checks to make the close pass. Report what failed and `Next: /telos:check`.
4. **Promote** confirmed decisions that are hard to reverse (data model, storage, public API,
   protocol, dependency, security); leave the others. Per `Decisions:` tag:
   - `[candidate]` worth promoting → `telos history add decision <NN> "D-MM: <text>"`, then Edit
     the CONTEXT line to end with ` → HISTORY`;
   - `[in HISTORY; add → HISTORY to CONTEXT]` → only the Edit; `[promoted]` → skip.
5. **Record**, in this order (a retry skips what the context shows as recorded):
   - `History: phase entry missing` → `telos history add phase <NN> "closed <NN-name>: <done when>"`;
   - `telos roadmap set <NN> done`;
   - `telos status set task=none next="/telos:plan"` and
     `telos status add recent "<NN-name> closed: <one line>"`.
6. **Commit**: `Auto-commit: yes` → `git add .telos/ROADMAP.md .telos/STATUS.md .telos/HISTORY.md
   <CONTEXT path>` (+ `.telos/HISTORY-archive.md` when `git status` shows it), then
   `git commit -m "docs(telos): close phase <NN-name>" -m "- <2–3 bullets>"`. `Auto-commit: no` →
   do not commit; list the changed paths. A failing commit: show the error and stop.
7. **Reply** in ≤ 10 lines: verdicts, promoted decision IDs, the commit subject (or the
   uncommitted paths), a hint to run `/compact` before the next phase; last line
   `Next: /telos:plan`.
