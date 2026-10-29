---
name: done
description: Close the current Telos phase after full checks and acceptance, recording HISTORY
argument-hint: "[NN]"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Bash(git status*), Bash(git add *), Bash(git commit *), Read, Grep, Glob, Edit(.telos/phases/**), Edit, Agent(telos:reviewer-hard)
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
4. **Deep only** (`Deep close` in the context; the standard profile skips to step 5):
   - `Critical evidence` gaps are already `Close: blocked`. `Review: reuse` → no new review. Else
     run the `Review:` line's two commands and launch telos:reviewer-hard once with both outputs
     (never invoke /telos:review, the user-only skill). Verdict UNVERIFIED, `REFUSED:` or any
     HIGH or CRITICAL finding → stop; fixes belong to the owning task or a new task via
     `/telos:revise`, never here; no re-review.
   - Doc-sync: `telos docs-scan <NN>`; edit only matched ranges and docstrings of changed public
     API, behavior-neutral, keeping unrelated text. Omissions (`Sync: NOT VERIFIED`) → inspect
     them with targeted reads first; no match → no-op. `telos changelog <NN>`: no candidates →
     no-op; else ≤ 10 entry lines under one version or date heading in the configured changelog
     (never invent a version; no duplicate heading or entry when a retry finds them).
   - After any edit rerun `telos check --level full --phase <NN>` and the `Accept:` commands.
   On any stop in steps 3–4 the phase stays active, no history is written, doc edits stay
   uncommitted for the user to inspect; never mark tasks done, tick
   boxes or edit checks to make the close pass. Report what failed and `Next: /telos:check`.
5. **Promote** confirmed decisions that are hard to reverse (data model, storage, public API,
   protocol, dependency, security); leave the others. Per `Decisions:` tag:
   - `[candidate]` worth promoting → `telos history add decision <NN> "D-MM: <text>"`, then Edit
     the CONTEXT line to end with ` → HISTORY`;
   - `[in HISTORY; add → HISTORY to CONTEXT]` → only the Edit; `[promoted]` → skip.
6. **Record**, in this order (a retry skips what the context shows as recorded):
   - `History: phase entry missing` → `telos history add phase <NN> "closed <NN-name>: <done when>"`;
   - `telos roadmap set <NN> done`;
   - `telos status set task=none next="/telos:plan"` and
     `telos status add recent "<NN-name> closed: <one line>"`.
7. **Commit**: `Auto-commit: yes` → `git add .telos/ROADMAP.md .telos/STATUS.md .telos/HISTORY.md
   <CONTEXT path>` (+ `.telos/HISTORY-archive.md` when `git status` shows it, + each changed doc path
   of step 4, named explicitly), then
   `git commit -m "docs(telos): close phase <NN-name>" -m "- <2–3 bullets>"`. `Auto-commit: no` →
   do not commit; list the changed paths. A failing commit: show the error and stop.
8. **Reply** in ≤ 10 lines: verdicts, promoted decision IDs, the commit subject (or the
   uncommitted paths), a hint to run `/compact` before the next phase; last line
   `Next: /telos:plan`.
