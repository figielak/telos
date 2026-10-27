---
name: discuss
description: Clarify a phase's scope and decisions before planning and write its NN-CONTEXT.md
argument-hint: "[NN]"
disable-model-invocation: true
model: opus
allowed-tools: Bash(telos *), Read, Grep, Glob, Edit(.telos/phases/**), Write(.telos/phases/**)
---
## Context
!`telos ctx discuss`

## Request
$ARGUMENTS

## Instructions
Use the context above; look at code only where a question needs it (Grep/Glob, then just the
ranges). Write only the target's `NN-CONTEXT.md`; change STATUS only through `telos` commands;
never edit task files, ROADMAP or STATUS by hand, and never commit.

1. **Target**: Request empty → the `Target:` phase. Request a two-digit `NN` other than the
   Target → run `telos ctx discuss <NN>` and use that bundle instead (exit 2 → say the argument
   must be a phase number). Other text → topics to focus on for the `Target:` phase.
   **Stop** when the context is `Requires standard profile. …` (reply with that line) or starts
   with `REFUSED:` (show the reason and its fix).
2. **Ask one round**: one AskUserQuestion call, max 4 multiple-choice questions, recommended
   option first, only where the answer changes scope, approach, data model, acceptance or the
   task split and the context, PROJECT, MAP or a quick code look cannot settle it. Existing
   `Open questions` come first. No second round.
3. **Write the CONTEXT** (Edit an existing file, Write a missing one from the `Skeleton:`):
   - keep all six sections — `## Goal`, `## Decisions`, `## Constraints`, `## Open questions`,
     `## Carried over`, `## Links` — with `- none` when empty; ≤ 60 lines in total;
   - Goal: 2–3 sentences; Constraints: phase-specific only (project rules stay in PROJECT);
   - each answer → `- D-NN: …` (confirmed); an answered `Q-NN` is removed and becomes that D-NN;
   - each choice you assumed or the user left open → `- D-NN [proposed]: …` (never confirm
     one yourself); unresolved questions stay or become `- Q-NN: …`;
   - new IDs start at `Next IDs:`; never renumber or reuse an ID, and keep existing D-NN/Q-NN
     lines and user answers word for word unless the user changed that answer now;
   - `Mode: active`: never rewrite or replace an existing D-NN; add only new `[proposed]`
     decisions and new Q-NN, and send plan changes to `/telos:revise <notes>`;
   - carry-over items for the phase go to Carried over as `- <item> → <source>`.
4. **Awaiting user**: set it to every still `[proposed]` decision and open question of this
   phase plus the other phases' entries from `Awaiting user:` with one
   `telos status set awaiting="NN:D-MM, NN:Q-MM"` (`awaiting=` when none are left).
5. **Summary** in ≤ 10 lines: confirmed decisions, proposed ones and open questions by ID, the
   CONTEXT line count; tasks under `Referenced:` whose decision changed; last line
   `Next: /telos:plan <NN>` (`planned`) or `Next: /telos:revise <notes>` (`drafted`/`active`).
