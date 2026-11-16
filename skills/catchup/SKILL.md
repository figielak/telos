---
name: catchup
description: Bring the Telos area notes up to date with commits made without Telos, from the git delta since each area's anchor
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Bash(git status*), Bash(git diff *), Bash(git log *), Bash(git add .telos/*), Bash(git commit *), Read, Grep, Glob, Edit(.telos/areas/*), Write(.telos/areas/*), Edit(.telos/MAP.md)
---
## Context
!`telos ctx catchup`
