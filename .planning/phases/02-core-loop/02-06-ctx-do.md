---
id: 02-06
title: telos ctx do bundle
type: code
status: done
critical: false
effort: hard
depends: [02-01, 02-04]
decisions: [D-02, D-08, D-09]
scope: [lib/ctx/do.mjs, lib/ctx/index.mjs, test/ctx-do.test.mjs, test/fixtures/telos-phase/, README.md]
---
## Goal
`telos ctx do [id]` picks the task (D-08), refuses when it may not run, and builds the bundle
of SPEC §5.1 step 1 with exact excerpts instead of whole files.

## Read first
- SPEC.md §5.1, §4.3.1 (decisions, Read first rows), §4.3.3 (Interface rule)
- lib/ctx/index.mjs:23-53 (cap, stripComments, excerpt)
- lib/tasks.mjs (Interface of 02-01), lib/git.mjs (Interface of 02-04)

## Files
- lib/ctx/do.mjs (create)
- lib/ctx/index.mjs (modify: register `do`)
- test/ctx-do.test.mjs (create)
- test/fixtures/telos-phase/ (modify: Read-first targets, a CONTEXT with D-01 and D-02 [proposed])
- README.md (modify: `telos ctx do` row)

## Constraints
- bundle order (cap truncates from the end): refusal/hint, task file, STATUS lines, PROJECT §Rules, stack line, checks, decisions + CONTEXT goal (std+), depends' Interface, Read-first excerpts, MAP lines
- task file is never truncated; excerpts are cut first
- read-only git for stale detection (D-04)
- exits 0 with a `REFUSED: …` first line instead of exit 1, so the skill's injection still shows the reason

## Tests (write first)
- one test per Edge case
- full bundle for an approved fixture task contains task text, Rules, stack line and its excerpts in order

## Interface
```js
export function resolveRef(root, ref: string): { label: string, text: string, note?: string }
  // "path:20-60 (label)" | "FILE.md §Section"; FILE.md looked up in .telos/ then repo root
export function doBundle({ root, args }): string
```
Bundle head examples:
```
Task: 02-06 [approved] telos ctx do bundle · type code · effort hard
HINT: effort hard → suggest /telos:do-hard 02-06 before any work
REFUSED: 02-07 depends on 02-06 [approved]
```

## Edge cases
- no arg, an `in-progress` task exists → that task; else first `approved` with done depends
- no runnable task, all done → `REFUSED: no approved task (phase complete)`
- explicit id of a `draft` task → `REFUSED: 02-03 is draft, run /telos:approve`
- explicit id with an unmet depend → `REFUSED: 02-07 depends on 02-06 [approved]`
- decision `D-02 [proposed]` or `02:D-02` in *Awaiting user* → `REFUSED: decision D-02 awaits the user`
- `effort: hard` → `HINT:` line, bundle still complete
- `src/a.ts:5-9 (fn)` → lines 5–9 with `src/a.ts:5-9 (fn)` header
- range past EOF → clamped, note `file has 7 lines`
- missing file → `missing: src/x.ts (re-locate by label)`
- file changed since `telos/NN-start` → note `changed since plan, re-locate by label`
- `PROJECT.md §Conventions` → that section of .telos/PROJECT.md; `SPEC.md §5.1` → heading containing `5.1` in root SPEC.md
- depend with `## Interface` → only that section included, not its Result or Steps
- MAP.md stub (`not built`) → no MAP section; otherwise lines mentioning a scope path (max 10)

## Steps
1. Fixture: CONTEXT with D-01 / D-02 [proposed]; small `src/a.ts`; tasks covering each edge case.
2. test/ctx-do.test.mjs: one test per Edge case, temp git repo + tag for the stale case.
3. lib/ctx/do.mjs `resolveRef`: parse both ref forms, clamp, stale check via `git diff --quiet <tag> -- path`.
4. lib/ctx/do.mjs `doBundle`: select task (`nextTask` or id), refusals, sections in Constraints order, `cap()`.
5. Register `do`; README row; run the suite.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0

## Result
- lib/ctx/do.mjs `resolveRef` + `doBundle` (registered as `ctx do`); fixture gained src/a.ts (7 lines); 15 tests, suite 158/158.
- Refs: `path:a-b (label)`, `FILE.md §A[, §B] (label)` (numbered headings match exactly, sections ≤ 60 lines), `path (label)` (whole file when ≤ 80 lines); anything else is listed as unresolved. One ref per line: a second path on the same line is not resolved.
- Smoke on real 02-07: the first big ref took the whole budget, so excerpts are water-filled (short ones whole, long ones share the rest, each with its own `…[cut; open <ref> for the rest]`); 3 refs now fit in 5970 chars.
- Depends are rechecked for in-progress and blocked tasks too; the stale check runs `git diff --quiet <tag> -- path` locally (lib/git.mjs outside scope).
Deviations: none
