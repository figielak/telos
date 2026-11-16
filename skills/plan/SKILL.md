---
name: plan
description: Plan a Telos phase: write its one phase file and set it active
argument-hint: "[NN|description]"
disable-model-invocation: true
model: opus
allowed-tools: Bash(telos *), Bash(git add *), Bash(git commit *), Read, Grep, Glob, Edit(.telos/phases/**), Write(.telos/phases/**)
---
## Context
!`telos ctx plan`

## Request
$ARGUMENTS

## Instructions
!`telos ctx shared plan`
