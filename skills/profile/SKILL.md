---
name: profile
description: Switch this repository's Telos profile (minimal, standard, deep) without losing files
argument-hint: "<minimal|standard|deep>"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *)
---
## Context
!`telos ctx profile`

## Request
$ARGUMENTS

## Instructions
Use only the context above. Do not read or edit files, edit `.telos/` by hand, or commit.

1. **Stop** when the context says Telos is not initialized (suggest `/telos:init`) or starts
   with `REFUSED:` (show the reason and its fix).
2. **Profile**: take the first word of Request. Not `minimal`, `standard` or `deep` → reply
   with the current profile, the three choices and `Usage: /telos:profile <minimal|standard|deep>`;
   run nothing. Equal to the current profile → say it is already active; run nothing.
3. **Switch** with exactly one command: `telos profile <profile>`.
   Exit 2 → show the usage error; exit 1 → show the error, say the old profile stays active
   and the command is safe to retry; never repair config or HISTORY yourself.
4. **Summarize** in ≤ 8 lines: the `profile:` and `Created:` lines from the output; on a
   downgrade, that HISTORY, LESSONS, CONTEXT, RESEARCH and decisions/ are retained and only
   features of the higher profile become unavailable; that checks, stack, limits, git settings
   and CLAUDE.md are unchanged; the suggested commit
   `docs(telos): switch profile to <profile>` (stage `.telos/config.json` and each created
   or changed `.telos/` file explicitly).
