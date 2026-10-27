---
name: undo
description: Revert one Telos task's commits after confirming the exact hashes, keeping other Telos state
argument-hint: "<NN-MM>"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Bash(git status*), Bash(git diff*), Bash(git revert --no-commit *), Bash(git revert --quit), Bash(git restore --source=HEAD --staged --worktree -- *), Bash(git add *), Bash(git commit *)
---
## Context
!`telos ctx undo`

## Request
$ARGUMENTS

## Instructions
Use the context above. Change task, ROADMAP, STATUS and HISTORY only through `telos`
commands. Never reset, stash, push, amend, rebase or use `--no-verify`.

1. **Target**: the first word of Request must be a task id `NN-MM`; otherwise show the
   `Candidates` line and `Usage: /telos:undo <NN-MM>` and stop. Run `telos ctx undo <NN-MM>`
   and use that bundle. **Stop** when it is `Requires standard profile. …` or starts with
   `REFUSED:` (show the reason and its remedy; change nothing).
2. **Confirm**: show every commit (full hash, subject, stat), `Telos files`, `Dependents`
   (they are never reverted) and `Block after undo`. Ask once with AskUserQuestion:
   `Revert <n> commits: <short hashes>` or `Cancel`. Anything but that confirmation → stop;
   no git revert, no state change.
3. **Revert**, one commit at a time in `Revert order` (newest first):
   `git revert --no-commit <hash>`. On a non-zero exit list the conflicts with
   `git diff --name-only --diff-filter=U`:
   - only `.telos/` paths → `git restore --source=HEAD --staged --worktree -- <each path>`,
     then `git revert --quit`, and go on;
   - any other path → stop at once: run no further git or telos command, write no HISTORY,
     and tell the user to resolve the conflicts by hand or discard everything with
     `git revert --abort` and `git restore --source=HEAD --staged --worktree -- <changed paths>`.
4. **Keep current Telos metadata**: `git restore --source=HEAD --staged --worktree -- <each path
   on the Telos files line>`, so other tasks, STATUS and ROADMAP keep their current content.
5. **Verify**: `telos check --level full` must exit 0; otherwise stop before any state change,
   leave the staged revert and report the failures.
6. **State**, only now and through the CLI:
   - `telos task set <NN-MM> status=reverted`;
   - `Block after undo` ids → `telos task set <id> <id> … status=blocked`;
   - `Phase after undo: reopen …` → run that `telos roadmap set <NN> active`;
   - `telos status set blockers="<blocked ids>: depend on reverted <NN-MM>" next="/telos:revise <notes> to redo <NN-MM>"`
     (`blockers=` unchanged when nothing was blocked);
   - `telos history add revert <NN-MM> "reverted <NN-MM>: <title> (<n> commits)"` — once.
7. **Commit**: git revert already staged the code. `Auto-commit: yes` → `git add` each changed
   `.telos/` path explicitly (task files, STATUS, ROADMAP, HISTORY; see `git status`), then
   `git commit -m "revert(<NN-MM>): undo <title>" -m "- reverts <short hashes>" -m "- <blocked or reopened, if any>"`.
   `Auto-commit: no` → leave it staged and list the paths. A failing commit: show it and stop.
8. **Reply** in ≤ 8 lines: reverted hashes, blocked dependents, reopened phase, check verdict,
   the commit subject; last line `Next: /telos:revise <notes>` or `/telos:plan`.
