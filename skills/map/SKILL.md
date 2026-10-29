---
name: map
description: Map an existing repository into .telos/MAP.md and draft PROJECT for confirmation
argument-hint: "[--refresh]"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Read, Grep, Glob, Edit(.telos/MAP.md), Edit(.telos/PROJECT.md), Write(.telos/MAP.md), Write(.telos/PROJECT.md), AskUserQuestion, Bash(git status*), Bash(git diff --cached*), Bash(git add .telos/MAP.md*), Bash(git commit *)
---
## Context
!`telos ctx map`

## Request
$ARGUMENTS

## Instructions
!`telos ctx shared map`
