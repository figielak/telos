---
id: 02-04
title: telos accept <id>
type: code
status: approved
critical: true
effort: normal
depends: [02-01, 02-03]
decisions: [D-04, D-05, D-06]
scope: [lib/accept.mjs, lib/git.mjs, lib/cli.mjs, test/accept.test.mjs, test/git.test.mjs, README.md]
---
## Goal
`telos accept <id>` runs a task's machine-checkable Acceptance items and checks that every
changed file is inside `scope` ∪ `.telos/` or listed in `Deviations:`; it is `do`'s gate before commit.

## Read first
- SPEC.md §4.3.1 (scope, Acceptance, Result rows), §10 rules 6–7
- lib/tasks.mjs (Interface of 02-01), lib/scope.mjs `inScope` (02-03)

## Files
- lib/git.mjs (create: read-only git helpers)
- lib/accept.mjs (create)
- lib/cli.mjs (modify: register `accept`)
- test/git.test.mjs (create)
- test/accept.test.mjs (create)
- README.md (modify: `telos accept` row)

## Constraints
- read-only git (D-04); `git` via `execFileSync` with argument arrays, never a shell string
- acceptance commands run via `sh -c` in the repo root (D-05), sequentially, 600 s timeout each
- does not tick checkboxes or edit the task file
- exit 0 = no FAIL (MANUAL allowed), 1 = any FAIL or task/repo missing, 2 = usage

## Tests (write first)
- one test per Edge case, each in a fresh temp git repo with a minimal `.telos/`
- `git.mjs`: `porcelainFiles` parses `-z` output incl. renames and spaces; `taskCommitFiles` finds only commits of the given scope since a tag

## Interface
```js
// lib/git.mjs
export function isRepo(root): boolean
export function porcelainFiles(root): string[]            // git status --porcelain -z, untracked incl.
export function taskCommitFiles(root, id, since?: string): string[]  // log --grep "^[a-z]+\(<id>\):" -E
export function refExists(root, ref): boolean
// lib/accept.mjs
/** @typedef {{ text: string, cmd?: string, exit?: number, verdict: 'PASS'|'FAIL'|'MANUAL', note?: string }} Item */
export function acceptanceItems(body: string): Omit<Item, 'verdict'>[]
export function deviations(resultBody: string): string[]  // paths from "Deviations: p — why; …"
export function accept(root, id, opts?: { timeoutMs?: number }): { items: Item[], outside: string[], ok: boolean }
export const acceptCommand;
```
Output (compact, one line per item, then scope, then verdict):
```
PASS   `npm test` → exit 0
FAIL   `npx tsc` → exit 0 (got 2)
       …last 15 lines…
MANUAL all listed tests pass
SCOPE  FAIL src/x.ts (not in scope, not in Deviations)
accept 02-04: FAIL
```

## Edge cases
- `` `true` → exit 0 `` → PASS; `` `false` → exit 0 `` → FAIL `(got 1)` with output tail
- `` `exit 3` → exit 3 `` → PASS (non-zero expectation supported)
- command over timeout → FAIL `timeout 600s` (test uses `timeoutMs: 200`)
- item without backticks, or `` `cmd` → prints ok `` → MANUAL
- already ticked `- [x]` items are still run
- untracked `src/new.ts` outside scope → SCOPE FAIL; gitignored file → ignored
- outside file listed in `Deviations: src/new.ts — reason` → SCOPE ok
- `.telos/STATUS.md` changed → always ok; `scope: ["*"]` → always ok
- commit `feat(02-04): …` since `telos/02-start` counted; `feat(02-03): …` not; no tag → whole history
- renamed file `a.ts → b.ts` → `b.ts` checked
- unknown task → exit 1 `no task 02-99`; not a git repo → exit 1 `not a git repo`
- task with no Acceptance items → `no acceptance items`, still checks scope

## Steps
1. test/git.test.mjs, then lib/git.mjs (`isRepo`, `porcelainFiles`, `taskCommitFiles`, `refExists`).
2. test/accept.test.mjs: helper `repoWith(task, files)`; one test per Edge case.
3. lib/accept.mjs `acceptanceItems`: regex `` `([^`]+)`\s*→\s*exit (\d+) `` per `- [ ]`/`- [x]` line.
4. lib/accept.mjs `deviations`: last `Deviations:` line, split on `;`, path before ` — `.
5. lib/accept.mjs `accept`: run items (`spawnSync('sh', ['-c', cmd], { timeout })`), changed = porcelain ∪ commits since `telos/<NN>-start`, outside = not `.telos/`, not `inScope`, not in deviations.
6. Register in lib/cli.mjs, format output, README row, run the suite.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0

## Result
