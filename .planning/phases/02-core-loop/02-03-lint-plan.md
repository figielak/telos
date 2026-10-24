---
id: 02-03
title: telos lint-plan
type: code
status: approved
critical: false
effort: hard
depends: [02-01]
decisions: [D-02, D-07]
scope: [lib/lint-plan.mjs, lib/scope.mjs, lib/cli.mjs, test/lint-plan.test.mjs, test/scope.test.mjs, test/fixtures/telos-phase/, README.md]
---
## Goal
`telos lint-plan [NN]` checks a phase's task files against the format rules (SPEC §4.3.1,
§4.3.3) and prints one line per problem, so `plan`/`revise` fix them before the summary.

## Read first
- lib/tasks.mjs (Interface of 02-01)
- SPEC.md §4.3.1, §4.3.3 (Rules)
- templates/task.md

## Files
- lib/scope.mjs (create: `inScope`)
- lib/lint-plan.mjs (create)
- lib/cli.mjs (modify: register `lint-plan`)
- test/scope.test.mjs (create)
- test/lint-plan.test.mjs (create)
- test/fixtures/telos-phase/ (modify: add a broken phase 02-bad)
- README.md (modify: `telos lint-plan` row)

## Constraints
- default NN = phase from STATUS `Phase:`; no phase → exit 2
- output: `ok: N tasks` (exit 0) or `<id>: <problem>` lines + `N problems` (exit 1)
- structure only (D-07); no model-judged rules
- `inScope` is reused by `accept` (02-04) and later the scope hook

## Tests (write first)
- fixture 01-demo → `ok: 3 tasks`, exit 0
- each Edge case below yields exactly its problem line
- `inScope`: prefix `src/game/` matches `src/game/a.ts`, not `src/gamer.ts`; `["*"]` matches all; `test/*.test.mjs` matches `test/a.test.mjs`, not `test/x/a.test.mjs`; `**` crosses dirs

## Interface
```js
export function inScope(path: string, scope: string[]): boolean  // prefix | exact | glob (*, **)
export function filesOf(task: Task): string[]                    // "- path (create|…)" → path
export function lintTask(task: Task, phase: { ids: Set<string>, decisions: Map<string, boolean> | null }): string[]
export function lintPhase(root, nn): { count: number, problems: string[] }
export const lintPlanCommand;
```

## Edge cases
- `scope: []` or missing → `scope empty`
- Files item outside scope → `file outside scope: <path>`
- missing `## Goal|Files|Steps|Acceptance|Result` → `missing section: <name>`
- `type: code` without `## Tests` items → `missing section: Tests`; `doc`/`audit` with Tests items → `Tests only for type code`
- `effort: hard` or `critical: true` without `Interface`/`Edge cases` → `detailed task needs: Interface, Edge cases`
- more lines than 80 (normal) / 140 (detailed) → `too long: 93 > 80 lines`
- code task: no `` `cmd` → exit N `` item → `no machine-checkable acceptance`; no `all listed tests pass` → `missing: all listed tests pass`
- detailed task with an empty `Edge cases` section → `empty section: Edge cases`
- depends on unknown id → `unknown depend: 02-09`; cycle → `depend cycle: 02-02 → 02-03 → 02-02`
- `decisions: [D-04]` not in CONTEXT (when CONTEXT exists) → `unknown decision: D-04`
- frontmatter `id` ≠ filename prefix → `id mismatch: file 02-04, id 02-05`
- audit task with scope ≠ `[".telos/"]` → `audit scope must be [".telos/"]`

## Steps
1. test/scope.test.mjs, then lib/scope.mjs `inScope` (glob → RegExp, no deps).
2. test/fixtures/telos-phase/.telos/phases/02-bad/: one file per edge case (small).
3. test/lint-plan.test.mjs: ok phase + one assertion per edge case.
4. lib/lint-plan.mjs: `filesOf`, `lintTask` (rules in Edge cases order), `lintPhase` (cycle check by DFS, decisions from `NN-CONTEXT.md` `D-NN` lines).
5. Register in lib/cli.mjs; README row; run the suite and `node bin/telos lint-plan` on this repo's .planning copy as a smoke test.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0

## Result
