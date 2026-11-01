---
id: 07-01
title: Review diff continuation matches git diff permissions
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: hard        # normal | hard
depends: []         # task IDs, e.g. [01-01]
decisions: [D-03]   # phase-local, e.g. [D-03]
scope: ["lib/git.mjs", "lib/review.mjs", "test/review.test.mjs", "test/ctx-review.test.mjs"]
---
## Goal
Make every review diff continuation start with a plain `git diff ` so the reviewer's `Bash(git diff *)` permission allows it headless (F6), while paths stay literal and injection-safe.

## Read first
- lib/git.mjs:162-205 (REVIEW_DIFF, reviewDiffArgs, reviewDiff)
- lib/review.mjs:13-17 (quote, command)
- lib/review.mjs:84-90 (continuation of diff blocks)
- test/review.test.mjs:158-175 (shell continuation preserves literal paths)
- .telos/phases/06-measure/06-WORKFLOW-EVIDENCE.md §Findings and gaps (F6 denial)

## Files
- lib/git.mjs (modify)
- lib/review.mjs (modify)
- test/review.test.mjs (modify)
- test/ctx-review.test.mjs (modify)

## Constraints
- D-03: fix F6 in this phase; do not widen agent or skill permissions instead.
- The CLI never writes git; the diff stays read-only and binary-safe (`--binary`, REVIEW_DIFF flags unchanged).
- Literal pathspecs come from the `:(literal)` magic per path, not from the global `--literal-pathspecs` option.
- Bundle stays ≤ 6000 chars (`cap()`); no README change unless a README row names the continuation format.

## Tests (write first)
- continuation string starts with `git diff ` and contains no quoted `'diff'` or global option before it
- executing the continuation with `sh -c` returns exactly the bundle diff text (existing unusual-path test still passes)
- a path starting with `:` or containing `*`, `?`, `[x]` is matched literally, not as magic or glob
- a rename emits literal pathspecs for both old and new path
- a revision that is not a plain hex hash is shell-quoted
- `--numstat` and patch use the same literal pathspecs (binary detection unchanged)

## Interface
- `reviewDiffArgs(revisions, paths)` → `['diff', ...REVIEW_DIFF, '--binary', ...revisions, '--', ...paths.map((p) => ':(literal)' + p)]`
- `command(args)` in lib/review.mjs → `git diff` unquoted, then each further token single-quoted unless it is a fixed REVIEW_DIFF/`--binary`/`--` flag or a hex revision.
- Output text of `reviewDiff()` is byte-identical to before for ordinary paths.

## Edge cases
- path `src/$(touch INJECTED); 'quote' [x]\n.txt` → literal match, no file created
- path `:weird` or `a*b.ts` → literal match, other files not included
- rename `old.ts` → `new.ts` → both sides in the continuation
- revision `HEAD~1` or a tag name → quoted, command still runs
- no changes → no continuation emitted (unchanged)

## Steps
1. test/review.test.mjs: add the tests above first; confirm the prefix test fails.
2. lib/git.mjs: reviewDiffArgs — drop the global option, add `:(literal)` per path; use the same pathspecs for the `--numstat` call.
3. lib/review.mjs: command — render `git diff` and safe fixed tokens unquoted, quote everything else.
4. test/ctx-review.test.mjs: update any expected continuation strings; check the cap test still passes.
5. Run `npm test`.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
