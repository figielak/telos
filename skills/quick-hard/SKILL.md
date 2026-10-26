---
name: quick-hard
description: Make a small but tricky change without a phase on a stronger model
argument-hint: "<description>"
disable-model-invocation: true
model: opus
allowed-tools: Bash(telos *), Bash(git status*), Bash(git diff*), Bash(git add *), Bash(git commit *)
---
## Context
!`telos ctx quick`

## Change
$ARGUMENTS

## Instructions
!`telos ctx shared quick`
