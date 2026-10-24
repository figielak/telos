---
name: revise
description: Adjust the draft plan of the current Telos phase
argument-hint: "<notes>"
disable-model-invocation: true
model: opus
allowed-tools: Bash(telos *), Read, Grep, Glob, Edit(.telos/**)
---
## Context
!`telos ctx plan`

## Notes
$ARGUMENTS

## Instructions
!`telos ctx shared revise`
