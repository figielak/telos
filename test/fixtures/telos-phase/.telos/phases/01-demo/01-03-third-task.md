---
id: 01-03
title: Third task
type: code          # code | doc | audit
status: draft       # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [01-02]
decisions: []
scope: [src/]
---
## Goal
Third task.

## Read first
- src/a.ts:1-5 (greet)

## Files
- src/a.ts (modify)

## Constraints
- none

## Tests (write first)      <!-- type: code only -->
- greets by name

## Steps
1. Write the test, implement.

## Acceptance
- [ ] all listed tests pass
- [ ] `true` → exit 0

## Result
