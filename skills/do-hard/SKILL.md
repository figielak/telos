---
name: do-hard
description: Execute a hard or blocked Telos task with a stronger model
argument-hint: "[task-id]"
disable-model-invocation: true
model: opus
allowed-tools: Bash(telos *), Bash(git status*), Bash(git diff*), Bash(git add *), Bash(git commit *)
---
## Context
!`telos ctx do $ARGUMENTS`

## Instructions
!`telos ctx shared do`
