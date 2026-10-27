---
name: review-hard
description: Review critical Telos work (security, payments, concurrency, data integrity) with a stronger read-only agent
argument-hint: "[NN-MM|NN]"
disable-model-invocation: true
context: fork
agent: telos:reviewer-hard
model: opus
allowed-tools: Bash(telos ctx review *), Bash(telos ctx shared *), Bash(git diff *), Bash(git log *), Read, Grep, Glob
---
## Context
!`telos ctx review`

## Request
$ARGUMENTS

## Instructions
!`telos ctx shared review`
