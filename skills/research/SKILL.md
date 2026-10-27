---
name: research
description: Research a Telos phase from its prepared goal and open questions with a read-only agent (deep profile)
argument-hint: "[NN] [--replace] [focus]"
disable-model-invocation: true
context: fork
agent: telos:researcher
model: sonnet
allowed-tools: Bash(telos ctx research *), Bash(telos ctx shared *), Read, Grep, Glob, WebSearch, WebFetch
---
## Context
!`telos ctx research`

## Request
$ARGUMENTS

## Instructions
!`telos ctx shared research`
