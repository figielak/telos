---
name: quick
description: Make a small change without a phase: mini-plan, implement, check, one (quick) commit
argument-hint: "<description>"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Bash(git status*), Bash(git diff*), Bash(git add *), Bash(git commit *)
---
## Context
!`telos ctx quick`

## Change
$ARGUMENTS

## Instructions
!`telos ctx shared quick`
