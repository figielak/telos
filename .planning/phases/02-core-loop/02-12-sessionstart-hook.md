---
id: 02-12
title: SessionStart hook (startup, resume, clear)
type: code
status: approved
critical: false
effort: normal
depends: [02-01, 02-02]
decisions: []
scope: [hooks/, lib/session.mjs, test/session.test.mjs, README.md]
---
## Goal
On startup, resume and clear, inject a compact status (≤ 1200 chars) so a fresh session
resumes the loop without reading files.

## Read first
- SPEC.md §8 (SessionStart rows, hook rules)
- lib/status.mjs:89-104 (view)
- lib/roadmap.mjs `phaseLine` (02-02 Result: reuse instead of matching ROADMAP lines again)
- lib/ctx/stack.mjs:13-21 (stackLine)

## Files
- hooks/hooks.json (create)
- hooks/session-start.mjs (create: thin wrapper)
- lib/session.mjs (create: `sessionText(root)`)
- test/session.test.mjs (create)
- README.md (modify: Hooks section)

## Constraints
- matcher `startup|resume|clear`; `compact` is std+ (phase 04)
- order: *Awaiting user* (if any), PROJECT §Purpose line 1, stack line, profile, phase/task with live states, Next, Blockers, carry-over count, file pointers
- no `.telos/` or unreadable config → exit 0, no output; never throws to the user
- reads stdin JSON `{ cwd }`, falls back to `process.cwd()`

## Tests (write first)
- fixture output starts with `Awaiting user:` when set, else with the Purpose line
- phase and task show states from ROADMAP and the task file
- output ≤ 1200 chars with a long STATUS (truncation marker)
- no `.telos/` → empty stdout, exit 0
- hooks.json references `${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs` with the matcher above

## Steps
1. Write tests (spawn the script with stdin JSON).
2. lib/session.mjs reusing `view`, `stackLine`, `phaseLine`; hooks/session-start.mjs; hooks/hooks.json.
3. README Hooks section; `claude plugin validate .`; suite.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] `claude plugin validate .` → exit 0

## Result
