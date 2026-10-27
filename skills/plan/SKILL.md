---
name: plan
description: Plan a Telos phase: write draft task files and a short summary
argument-hint: "[NN|description]"
disable-model-invocation: true
model: opus
allowed-tools: Bash(telos *), Read, Grep, Glob, Edit(.telos/**), Write(.telos/phases/**)
---
## Context
!`telos ctx plan`

## Request
$ARGUMENTS

## Instructions
!`telos ctx shared plan`
