---
id: 02-01
title: Task model and telos task new|set|rm
type: code
status: done
critical: false
effort: hard
depends: []
decisions: [D-02, D-03, D-08]
scope: [lib/tasks.mjs, lib/cli.mjs, test/tasks.test.mjs, test/fixtures/telos-phase/, README.md]
---
## Goal
One module reads task files (frontmatter + sections), lists a phase's tasks, picks the next
task, and backs the CLI commands that create, change and remove task files deterministically.

## Read first
- lib/frontmatter.mjs:62-118 (parse, setField)
- lib/cli.mjs:19-43 (commands registry)
- lib/repo.mjs:9-25 (findRoot, telosDir)
- SPEC.md §4.2, §4.3, §4.3.1
- templates/task.md

## Files
- lib/tasks.mjs (create)
- lib/cli.mjs (modify: register `task`)
- test/tasks.test.mjs (create)
- test/fixtures/telos-phase/ (create: `.telos/` with ROADMAP, STATUS, phases/01-demo/ with 3 tasks)
- README.md (modify: `telos task …` rows)

## Constraints
- no git calls; no new dependencies
- `task new` renders templates/task.md via `render()`; the phase dir name comes from the ROADMAP line `NN-name`
- `task set` accepts only `status=` in v0; values from the template's status enum
- `task rm` deletes only `draft` tasks

## Tests (write first)
- `sections()` splits on `## ` headings, keeps HTML comments in the body
- `loadTask(root, '01-02')` returns meta + sections + path from the fixture
- id `2-1` → UsageError (exit 2); unknown id `01-09` → exit 1 `no task 01-09`
- two dirs `01-a/` and `01-b/` → exit 1 naming both
- missing `phases/` or phase dir → `phaseTasks()` returns `[]`
- `nextTask`: `in-progress` wins over `approved`; `approved` with an undone depend is skipped; all done → `null`
- `task new 01 check-x "Check X"` → `01-04-check-x.md` with `id: 01-04`, `status: draft`, no `{{`
- `task new 03 …` with no ROADMAP line `03-*` → exit 1
- `task set 01-01 01-02 status=approved` changes both, keeps comments and alignment
- `task set 01-01 status=finished` → exit 2 listing allowed values; `effort=hard` → exit 2
- `task rm` of an approved task → exit 1, file kept

## Interface
```js
/** @typedef {{ id: string, nn: string, path: string, meta: Record<string, unknown>,
 *   sections: Map<string, string>, text: string }} Task */
export const STATUSES; // ['draft','approved','in-progress','done','blocked','reverted']
export function sections(text): Map<string, string>        // heading → body (no frontmatter)
export function phaseDir(root, nn): string | null           // .telos/phases/NN-*
export function phaseTasks(root, nn): Task[]                // sorted by id
export function loadTask(root, id): Task
export function nextTask(tasks: Task[]): Task | null        // D-08 order
export function listItems(body: string): string[]           // "- x" lines → "x"
export const taskCommand; // telos task new <NN> <slug> "<title>" | set <id>… status=<s> | rm <id>
```

## Edge cases
- id format `^\d{2}-\d{2}$`, NN `^\d{2}$`; anything else → exit 2
- next MM = max existing + 1 (gaps are not reused)
- slug not kebab-case → exit 2
- `task set` with one unknown id among several → exit 1, no file changed
- frontmatter outside the D-03 subset → error names file and line

## Steps
1. test/fixtures/telos-phase/: ROADMAP with `01-demo [drafted]`, STATUS, three tasks (draft, approved, done; one depends on another).
2. test/tasks.test.mjs: one test per Tests item.
3. lib/tasks.mjs: `sections`, `listItems`, `phaseDir`, `phaseTasks`, `loadTask`, `nextTask`.
4. lib/tasks.mjs: `taskCommand` with `new` (reuse `render`), `set` (validate all, then `setField`), `rm`.
5. lib/cli.mjs: register `task`; README.md: three rows.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] `node bin/telos task --help` → exit 0

## Result
- lib/tasks.mjs: `sections` (keys drop HTML comments and a trailing `(…)`, so `## Tests (write first)` is `Tests`), `listItems`, `phaseDir`, `phaseTasks`, `loadTask`, `nextTask`, `TaskError` (→ exit 1) and `taskCommand` (`new`, `set`, `rm`); 15 tests, suite 84/84.
- `task new` renders the template with a placeholder title, then writes the real one through `setField`, so titles with `#` or `:` are quoted safely. `task set` loads every id before writing anything.
- `nextTask` ignores depends on other phases (lint-plan, 02-03, checks that they exist). lib/cli.mjs: `telos <cmd> --help` prints the command usage before the .telos/ check (needed for Acceptance in a repo without .telos/).
Deviations: none
