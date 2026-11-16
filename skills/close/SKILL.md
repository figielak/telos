---
name: close
description: Close the current Telos phase after its checks pass, recording ROADMAP, HISTORY and STATUS
argument-hint: "[NN]"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Bash(git status*), Bash(git add *), Bash(git commit *), Read
---
## Context
!`telos ctx close`

## Request
$ARGUMENTS

## Instructions
Use the context above. Change ROADMAP, STATUS and HISTORY only through `telos` commands.
Never push, amend, tag or use `--no-verify`.

1. **Target**: Request a two-digit `NN` other than the Target → run `telos ctx close <NN>` and
   use that bundle. Context starts with `REFUSED:` → show it and stop.
2. **Blocked**: `Close: blocked` → list each item and stop, changing nothing. Never mark work
   done or tick boxes to make the close pass.
3. **Checks**: run every command on the `Checks:` line from the repo root. Any non-zero exit →
   report the command and its last lines and stop; the phase stays active, nothing is recorded.
   Then confirm the Target's `done when` holds; one item you cannot confirm → stop.
4. **Record**: run the `Closing commands` in order; replace each `<…>` placeholder with one
   short line (the evidence for done when, the summary). A retry skips what is recorded.
5. **Commit**: `Auto-commit: yes` → `git add .telos/ROADMAP.md .telos/STATUS.md .telos/HISTORY.md`
   (+ `.telos/HISTORY-archive.md` when `git status` shows it), then
   `git commit -m "docs(<NN>): close phase <NN-name>"`. `Auto-commit: no` → list the changed paths.
6. **Reply** in ≤ 8 lines: check verdicts, what was recorded, the commit subject (or the
   uncommitted paths); last line `Next: <next from the status set command>`.
