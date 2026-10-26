---
name: map-hard
description: Same as /telos:map on a stronger model, for large or tangled repositories
argument-hint: "[--refresh]"
disable-model-invocation: true
model: opus
allowed-tools: Bash(telos *), Read, Grep, Glob, Edit(.telos/MAP.md), Edit(.telos/PROJECT.md), Write(.telos/MAP.md), Write(.telos/PROJECT.md)
---
## Context
!`telos ctx map`

## Request
$ARGUMENTS

## Instructions
!`telos ctx shared map`
