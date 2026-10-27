---
name: lesson
description: Record a lesson learned in .telos/LESSONS.md (max 20, deduplicated by area)
argument-hint: "[area] <lesson> [(ref)]"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Read, Edit(.telos/LESSONS.md), Edit(.telos/PROJECT.md)
---
## Context
!`telos ctx lesson`

## Request
$ARGUMENTS

## Instructions
Use only the context above and the Request. Edit only `.telos/LESSONS.md`, and
`.telos/PROJECT.md` only for a promotion the user chose. Never touch task files, ROADMAP or
STATUS, never create files, never commit.

1. **Stop** when the context is `Requires standard profile. …` (reply with that line) or starts
   with `REFUSED:` (show the reason and its fix). Empty Request → ask for the lesson in one sentence.
2. **Shape** one line `- [area] lesson (ref)`: area is a path prefix (`src/game/`) or a topic
   (`tests`, `git`); the lesson is one short imperative sentence; ref is the one the user gave,
   else `Ref:` from the context — only `NN-MM` or `quick`. Unclear area → pick the narrowest
   one and say `Assumed: area …`.
3. **Duplicates, area first**: compare only with entries whose area equals the new one or
   contains / is contained by it as a path prefix. Same meaning → a duplicate: add nothing and
   name the existing `L<n>` (sharpen its wording only if the user asks).
   A distinct lesson in the same area is a separate line: keep both, never merge them.
4. **Malformed lines** in the context: list them and leave them untouched; never delete them
   without the user's choice.
5. **Room left** (`Lessons:` below 20): Edit LESSONS.md, appending the line after the last entry
   (replace `- none` when it is the only line). Nothing else changes.
6. **Full list (20/20)**: never add a 21st. Ask once with AskUserQuestion: up to 3 concrete
   options, each naming one entry — `Promote L<n> to PROJECT.md §Conventions` (a lesson that
   became a standing rule) or `Drop L<n>` (stale) — plus `Keep the list, discard the new lesson`.
   Never delete or remove a lesson without that answer. Then:
   - **Promote**: Read PROJECT.md, add the rule to `## Conventions` (replace `- none`), re-read
     it to confirm the line is there; only after that remove `L<n>` from LESSONS.md and add the
     new lesson. A failed or unconfirmed PROJECT edit → stop with both files as they are.
   - **Drop**: replace `L<n>` with the new lesson in one Edit.
7. **Reply** in ≤ 5 lines: the line added (or the duplicate `L<n>`), the count `N/20`, any
   promotion or drop, `Assumed: …`; suggest committing `.telos/LESSONS.md` (and PROJECT.md).
