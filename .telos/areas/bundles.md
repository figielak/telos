<!-- telos-area: commit 27b0d07d0fd8970db052d63d2d0bdb87f3400d07 · 2026-11-16 · paths: lib/ctx/, lib/delta.mjs, shared/, skills/ -->
# bundles

## Purpose
Self-contained steps (`telos ctx <name>`: context, then instructions), the per-area git delta
behind close and catch-up, and the five skills that inject the steps.

## Entry points
- `lib/ctx/index.mjs:28` — bundle registry; `:38` `INSTRUCTIONS`; `:47` `renderBundle`; `:63` `cap()`
- `lib/ctx/plan.mjs:131` — plan, `--area` selectors; `lib/ctx/close.mjs:49`; `lib/ctx/catchup.mjs:13`
- `lib/ctx/map.mjs:106`; `lib/ctx/status.mjs:13`; `lib/ctx/shared.mjs:12` (`ctx shared <name>`)
- `lib/delta.mjs:63` `computeDelta`; `:154` `fitDelta`; `:170` `anchorPlan`
- `skills/<name>/SKILL.md` — one `!`telos ctx <name>`` line; `shared/<name>.md` — the instructions

## Invariants
- Context ≤ 6000 chars, mandatory lines first; instructions ≤ 5600 (`INSTRUCTIONS_CAP`), after it.
- Bundles only read; `REFUSED: …` and `Nothing to catch up` print alone (exit 0), no instructions.
- Skills are user-invoked only; free `$ARGUMENTS` never reaches a `!` injection.
- Every `telos` command a skill injects is pre-approved in its `allowed-tools`.

## Decisions
- Five skills: status, map, plan, close, catchup, one model each (10, 13) — one model per skill.
- Context first, instructions second (14-02): `shared/*.md` say "the context above" and line 1
  carries `REFUSED:` / `Map validation:`; any agent runs a step as "run `telos ctx <name>`".
- `ctx plan` lists Delete-zone paths on one line and fits the roadmap to the budget (14-05):
  the edit warning is a Claude Code hook; other agents learn the paths from the plan.
- The delta runs per area from its own anchor (13:D1); close and catch-up share `shared/close.md`.
- Area files go into `ctx plan` whole while they fit, else as `Read …` pointers (11-04); with
  `--area` they outrank the roadmap, which keeps the rows nearest the target phase.
- `ctx map --refresh` lists affected area files as pointers, index blocks inline (11-03).
- `ctx close` adds `Stale areas: N` when any; it never blocks the close (12:D-05).

## Rejected
- Skill variants `-lite`/`-hard`, discuss/approve/check/accept gates, review and research
  agents (10) — the 07 benchmark showed 2–5× cost with level acceptance.

## Pitfalls
- `shared/plan.md` has a rendered size baseline (2600 chars) in `test/skills.test.mjs`.
- Tests compare the context part through `contextOf()`; a new bundle needs an `INSTRUCTIONS` entry.
- Instructions name Claude Code tools only as "(AskUserQuestion in Claude Code)"; keep them agent-neutral.
- `ctx plan` on this repo is size-tested; a long MAP index pushes the roadmap past the cap.
- Run on real repos before trimming prompts: they expose permission and syntax defects that
  fixtures hide.
