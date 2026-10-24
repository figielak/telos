---
name: revise-lite
description: Make minor edits to the current Telos plan with a cheaper model
argument-hint: "<notes>"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Read, Grep, Glob, Edit(.telos/**)
---
## Context
!`telos ctx plan`

## Notes
$ARGUMENTS

## Instructions
!`telos ctx shared revise`
