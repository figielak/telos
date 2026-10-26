---
name: map
description: Map an existing repository into .telos/MAP.md and draft PROJECT for confirmation
argument-hint: "[--refresh]"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Read, Grep, Glob, Edit(.telos/MAP.md), Edit(.telos/PROJECT.md), Write(.telos/MAP.md), Write(.telos/PROJECT.md)
---
## Context
!`telos ctx map`

## Request
$ARGUMENTS

## Instructions
!`telos ctx shared map`
