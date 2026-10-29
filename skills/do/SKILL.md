---
name: do
description: Execute the next approved Telos task (tests, implement, accept, commit)
argument-hint: "[task-id]"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Bash(git status*), Bash(git diff*), Bash(git add *), Bash(git commit *), Agent(telos:reviewer-hard)
---
## Context
!`telos ctx do $ARGUMENTS`

## Instructions
!`telos ctx shared do`
