---
name: approve
description: Approve the drafted plan of the current Telos phase, commit it and tag the phase start
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Bash(git status*), Bash(git add *), Bash(git commit *), Bash(git tag telos/*)
---
## Context
!`telos ctx approve`

## Instructions
Use only the context above. Do not read or edit files, and change task, ROADMAP and STATUS
state only through `telos` commands. Never push, amend or use `--no-verify`.

1. **Stop** and explain, changing nothing, when:
   - the context starts with `REFUSED:`;
   - `Lint:` lists problems: show them and suggest `/telos:revise <notes>`;
   - `Draft: none`: nothing to approve (say whether the phase is already active).
2. **Pick** the tasks to approve: every `Draft:` id that is not under `Blocked:`. Blocked tasks stay
   `draft`; name each with its reason (a decision to confirm in the phase CONTEXT or *Awaiting
   user*). If every draft task is blocked, stop here.
3. **Run**, in this order:
   - `telos task set <id> <id> … status=approved` (all picked ids in one call);
   - `telos roadmap set <NN> active`;
   - `telos status set task=<first approved id whose depends are done> next="/telos:do"`.
4. **Commit** only these paths, listed explicitly:
   `git add .telos/phases/<NN-name>/ .telos/ROADMAP.md .telos/STATUS.md`, then
   `git commit -m "docs(telos): plan phase <NN-name>" -m "- <2–4 bullets: what the phase delivers, task count>"`.
   When `Tag:` says `exists` (a revised plan of a running phase), use
   `docs(telos): approve revised plan of <NN-name>` instead.
   Other changes under `Telos changes:` (outside these paths) stay unstaged; mention them.
   A failing commit (hook, no identity): show the error and stop; do not retry with other flags.
5. **Tag**: only when `Tag:` says `missing`, run `git tag telos/<NN>-start` after the commit.
   It stays local; the user pushes when they want.
6. **Reply** in ≤ 5 lines: approved ids, ids left in draft and why, the commit subject, the tag,
   last line `Next: /telos:do`.
