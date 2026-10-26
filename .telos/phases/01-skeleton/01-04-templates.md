---
id: 01-04
title: File templates and renderer
type: code
status: done
critical: false
effort: normal
depends: [01-02]
decisions: []
scope: [templates/, lib/template.mjs, test/templates.test.mjs]
---
## Goal
All Telos file templates plus a tiny `{{key}}` renderer, with tests that keep
every template inside its SPEC size limit.

## Read first
- SPEC.md §4 (file list and limits), §4.3, §4.3.2, §4.4 (templates)
- SPEC.md §4 last paragraph (CLAUDE.md block, ≤ 15 lines, ≤ ~250 tokens)

## Files
- templates/PROJECT.md, MAP.md, ROADMAP.md, STATUS.md, HISTORY.md, LESSONS.md (create)
- templates/CONTEXT.md, task.md, adr.md (create)
- templates/claude-block.md (create)
- lib/template.mjs (create)
- test/templates.test.mjs (create)

## Constraints
- MAP.md template is a stub pointing to `/telos:map` (real map is phase 03)
- claude-block.md includes the `<!-- telos:start v1 -->` / `<!-- telos:end -->` markers (D-06)
- `render(name, vars)` throws on a missing variable; no logic in templates
- templates are short: no explanatory prose beyond one-line HTML comments

## Tests (write first)
- every template renders with sample vars and leaves no `{{`
- line limits: PROJECT ≤ 60, ROADMAP ≤ 80, STATUS ≤ 40, CONTEXT ≤ 60, task ≤ 80, adr ≤ 30, claude-block ≤ 15
- claude-block ≤ 1000 chars (≈ 250 tokens)
- missing variable → error naming it

## Steps
1. Write templates from SPEC examples, trimmed.
2. Write tests, implement renderer, run.

## Acceptance
- [x] all listed tests pass
- [x] `node --test test/templates.test.mjs` → exit 0

## Result
- 10 templates + `render(name, vars)` (throws on a missing var); 5 tests, RED seen first; suite 22/22. Vars: name, profile, date, next, id, title, nn, number, source, supersedes.
- After user review all templates use comment guidance + `- none`; STATUS is pointer lines only, PROJECT has no Stack, MAP has fixed sections, task needs `scope` and a `Deviations:` line, claude-block uses a `v1` marker.
- New code work from the review is in SPEC (§2 comment stripping, §4.1, §4.3, §4.4, §6, §8, §11, §14) and carry-over (04 history/delete-zone, 05 adr new).
- Deviations: SPEC.md, .planning/ROADMAP.md, STATUS.md, 01-CONTEXT.md, 01-05…01-09 — review decisions recorded and later tasks replanned.
