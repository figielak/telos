---
name: review
description: Review a Telos task or phase from prepared deep-profile evidence with a read-only agent
argument-hint: "[NN-MM|NN]"
disable-model-invocation: true
context: fork
agent: telos:reviewer
model: sonnet
allowed-tools: Bash(telos ctx review *), Bash(telos ctx shared *), Bash(git diff *), Bash(git log *), Read, Grep, Glob
---
## Context
!`telos ctx review`

## Request
$ARGUMENTS

## Instructions
!`telos ctx shared review`
