# Memory-core plan

Rebuild Telos from a workflow plugin into a small project-memory tool for Claude Code and
Codex. The phase lines live in `.telos/ROADMAP.md` (10–16); this directory holds the task
breakdown. The plan is executed as ordinary work, without `/telos:*` skills.

The full pre-rebuild state is tagged `pre-memory-core`.

## Why

The phase 07 benchmark: Telos cost about 2–5× more than bare Claude Code in every measured
task, with level acceptance and no less exploration. Phase 06 showed the injected text is
small (~1.3K tokens); the cost comes from ceremony: extra turns and separate sessions for
plan, approve, check and done. The memory files and the SessionStart hook are cheap and stay.

## Principles

1. Memory, not process: the agent already plans, tests and implements.
2. Record what code cannot tell: why, rejected approaches, invariants, pitfalls, what is next.
3. Reading is nearly free (index at session start, areas on demand); writing happens at one point.
4. Memory is checkable against code: every note is anchored to a commit and paths.
5. Skipping the tool breaks nothing: one command catches up from `git log`.
6. Agent-agnostic: plain markdown plus a small CLI; works in Claude Code, Codex and by hand.
7. State is deterministic (CLI); judgment belongs to the model.
8. Block only the irreversible; everything else is at most a warning.
9. Small: at most five commands, README on one screen.

## Phases

| Phase | Sub-plan | Tasks | Depends on |
|---|---|---|---|
| 10-prune | [10-prune.md](10-prune.md) | 8 | — |
| 11-areas | [11-areas.md](11-areas.md) | 5 | 10 |
| 12-anchors | [12-anchors.md](12-anchors.md) | 5 | 11 |
| 13-close-catchup | [13-close-catchup.md](13-close-catchup.md) | 6 | 12 |
| 14-agents | [14-agents.md](14-agents.md) | 6 | 13 |
| 15-resume-test | [15-resume-test.md](15-resume-test.md) | 5 | 13 |
| 16-dogfood | [16-dogfood.md](16-dogfood.md) | 5 | 13 (15 before its last two tasks) |

Phases 10–13 run in order. The large project starts after 13 (task 16-01). Phases 14 and 15
run alongside it; 14 is needed only once Codex is actually used.

## Target shape after phase 13

- Skills: `status`, `plan`, `close`, `catchup`, `map`.
- CLI: `init`, `status`, `roadmap`, `history`, `area`, `stale`, `map-scan`, `ctx`, `budget`.
- Hooks: SessionStart (status + stale count), git guard, Delete-zone warning.
- Memory: `PROJECT.md`, `MAP.md` (index), `areas/<name>.md`, `STATUS.md`, `ROADMAP.md`,
  `HISTORY.md`, one `phases/NN-name.md` per phase.

## Working rules

- One task = one commit, `<type>(NN-MM): …`; stage specific files only; never push.
- `npm test` passes after every task.
- Tick the task's checkbox in its sub-plan in the same commit.
- Start a phase: `telos roadmap set NN active`, `telos status set phase=NN-name`.
- End a phase: verify its *Done when*, then `telos roadmap set NN done`,
  `telos history add phase NN "<one line>"`, `telos status set phase=<next> task=none`.
  These three commands survive the prune.
- A removed top-level path or skill gets a Delete-zone path entry; a removed mechanism gets
  a Delete-zone approach entry (`telos history add remove NN "…" --path|--approach …`).
- Each sub-plan lists *Decisions* with a default. Change a default before starting the phase,
  not midway.
