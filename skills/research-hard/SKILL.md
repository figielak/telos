---
name: research-hard
description: Research architectural decisions and library choices with real trade-offs using a stronger read-only agent (deep profile)
argument-hint: "[NN] [--replace] [focus]"
disable-model-invocation: true
context: fork
agent: telos:researcher-hard
model: opus
allowed-tools: Bash(telos ctx research *), Bash(telos ctx shared *), Read, Grep, Glob, WebSearch, WebFetch
---
## Context
!`telos ctx research`

## Request
$ARGUMENTS

## Instructions
!`telos ctx shared research`
