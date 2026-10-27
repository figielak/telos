---
name: plan-lite
description: Plan a small, obvious Telos phase with a cheaper model
argument-hint: "[NN|description]"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Read, Grep, Glob, Edit(.telos/**), Write(.telos/phases/**)
---
## Context
!`telos ctx plan`

## Request
$ARGUMENTS

## Instructions
!`telos ctx shared plan`
