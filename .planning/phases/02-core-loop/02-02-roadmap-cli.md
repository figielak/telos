---
id: 02-02
title: telos roadmap set|add
type: code
status: approved
critical: false
effort: normal
depends: []
decisions: [D-03]
scope: [lib/roadmap.mjs, lib/cli.mjs, test/roadmap.test.mjs, README.md]
---
## Goal
`telos roadmap set <NN> <status>` changes a phase's status in place, and
`telos roadmap add <name> "<goal>" "<done when>"` appends a new `planned` phase with the next NN.

## Read first
- SPEC.md §4.1 (ROADMAP.md paragraph)
- templates/ROADMAP.md
- lib/status.mjs:18-36 (line-edit style to mirror)
- lib/cli.mjs:19-43 (commands registry)

## Files
- lib/roadmap.mjs (create)
- lib/cli.mjs (modify: register `roadmap`)
- test/roadmap.test.mjs (create)
- README.md (modify: `telos roadmap …` rows)

## Constraints
- statuses: `planned | drafted | active | done | dropped`; no transition graph in v0
- only the `[status]` token of the matching line changes; milestone headings and comments untouched
- `add`: name kebab-case, NN = highest NN + 1 (dropped phases count), appended at the end
- exported `phaseLine(root, nn)` returns `{ nn, name, status, goal, done }` for ctx and hooks

## Tests (write first)
- `set 02 active` changes only that line's status token
- `set 07 done` with no phase 07 → exit 1; `set 02 finished` → exit 2 listing statuses
- `add auth "login" "users can log in"` → `- 03-auth [planned] login · done when: users can log in`
- `add` keeps milestone headings and HTML comments
- `phaseLine` parses goal and criterion; returns null for a missing NN
- missing ROADMAP.md → exit 1 `not initialized`

## Steps
1. Write tests.
2. lib/roadmap.mjs: line regex `^- (\d{2})-([a-z0-9-]+) \[(\w+)\] (.*?) · done when: (.*)$`, `set`, `add`, `phaseLine`.
3. Register in lib/cli.mjs, add README rows, run the suite.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0

## Result
