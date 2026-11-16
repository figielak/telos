---
name: close
description: Close the current Telos phase after its checks pass, updating the touched area notes and recording ROADMAP, HISTORY and STATUS
argument-hint: "[NN]"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Bash(git status*), Bash(git diff *), Bash(git log *), Bash(git add .telos/*), Bash(git commit *), Read, Grep, Glob, Edit(.telos/areas/*), Write(.telos/areas/*), Edit(.telos/MAP.md)
---
## Context
!`telos ctx close`

## Request
$ARGUMENTS
