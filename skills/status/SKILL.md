---
name: status
description: Show where the Telos project stands and what to run next
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *)
---
## Context
!`telos ctx status`

## Instructions
Use only the context above; read no files and change nothing.

Reply in ≤ 10 lines: phase and task, blockers and items awaiting the user (only when not
`none`), the latest Recent line, carry-over count when > 0, and the stack line. When the context
says Telos is not initialized, say so and suggest `/telos:init`. Last line: `Next: <next>` from
the context, unchanged.
