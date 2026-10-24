---
name: init
description: Initialize Telos in this repository (.telos/ files, config, CLAUDE.md block)
argument-hint: "[minimal|standard|deep]"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *)
---
## Context
!`telos ctx init $ARGUMENTS`

## Instructions
Use only the context above. Do not read other files, edit `.telos/` by hand, or commit.

1. **Stop early** when the context says `Git repo: no` (tell the user to run `git init`), or
   when `Telos: initialized` with a profile different from the requested one (tell the user
   that switching profiles is `/telos:profile`; offer `--force` only if they want to reset config.json).
2. **Ask once**, with one `AskUserQuestion` call (max 4 questions, recommended option first),
   only what you cannot take from the context:
   - **Profile**, only when `Requested profile` is `not given` or invalid and Telos is not
     initialized yet (when it is, reuse its current profile without asking):
     `standard` (Recommended: plan → test → implement + phase context, history, full checks),
     `minimal` (core loop only, lowest cost), `deep` (+ research, review, docs sync).
   - **Checks**, only when some were detected: "Use the detected check commands?" with
     `Use as detected` (Recommended), `Drop some` (user names which), `Use none`.
   No checks detected → do not ask; say they can be added later in `.telos/config.json`.
3. **Run** exactly one command:
   `telos init --profile <profile>` and, only if the user changed the checks,
   `--checks '<json object of the kept checks>'` (`'{}'` for none; escape `'` as `'\''`).
   Never pass `--stack`. Exit 2 → fix the arguments once and rerun; exit 1 → show the error and stop.
4. **Summarize** in ≤ 10 lines:
   - profile, and the `Created` / `Updated` / `Kept` lines from the output
   - the checks now in config (one line), and whether the CLAUDE.md block was added or updated
   - the suggested commit: `docs(telos): initialize telos` (stage `.telos/`, `CLAUDE.md`, `.gitignore`)
   - last line: the `Next:` line from the output, unchanged.
