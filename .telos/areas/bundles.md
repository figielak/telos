<!-- telos-area: commit 8398de51a6a618345a0e99d7e102ab061a01332b · 2026-11-16 · paths: lib/ctx/, shared/, skills/ -->
# bundles

## Purpose
Context bundles (`telos ctx <name>`) and the four skills that inject them.

## Entry points
- `lib/ctx/index.mjs:20-26` — bundle registry; `:29` `cap()`; `:39` `stripComments`
- `lib/ctx/plan.mjs:124` — plan bundle, `--area` selectors; `lib/ctx/close.mjs:25` — close
- `lib/ctx/map.mjs:105` — map bundle; `lib/ctx/status.mjs:12`; `lib/ctx/shared.mjs:12`
- `skills/<name>/SKILL.md` — `!`telos ctx …`` injection; `shared/<name>.md` — long instructions

## Invariants
- A bundle ≤ 6000 chars; mandatory lines first, so `cap()` cuts only the tail (roadmap, scan).
- Bundles only read; `REFUSED: …` (exit 0) when the step cannot start.
- Skills are user-invoked only; free `$ARGUMENTS` never reaches a `!` injection.
- Every `telos` command a skill injects is pre-approved in its `allowed-tools`.

## Decisions
- Four skills: status, map, plan, close, one model each (10) — the user picks a model in the host.
- Area files go into `ctx plan` whole while they fit, else as `Read …` pointers (11-04); with
  `--area` they outrank the roadmap, which keeps the rows nearest the target phase.
- `ctx map --refresh` lists affected area files as pointers, index blocks inline (11-03).
- `ctx close` adds `Stale areas: N` when any; it never blocks the close (12:D-05).

## Rejected
- Skill variants `-lite`/`-hard`, discuss/approve/check/accept gates, review and research
  agents (10) — the 07 benchmark showed 2–5× cost with level acceptance.

## Pitfalls
- `shared/plan.md` has a rendered size baseline (2600 chars) in `test/skills.test.mjs`.
- `ctx plan` on this repo is size-tested; a long MAP index pushes the roadmap past the cap.
- Run on real repos before trimming prompts: they expose permission and syntax defects that
  fixtures hide.
