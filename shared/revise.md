<!-- Shared by /telos:revise and /telos:revise-lite (SPEC §5.0, §5.2). Injected via `telos ctx shared revise`. -->
Apply the user's notes (above) to the plan of the current phase with the smallest edits that do
it. Read only the task files you change; look at code only where a changed task needs it. Change
ROADMAP, STATUS and task `status` only through `telos` commands. Never commit.

1. **Stop** when the context starts with `REFUSED:`, when `Target: none`, or when the phase has no
   tasks (suggest `/telos:plan`). No notes → ask what to change, in one sentence.
2. **Unclear notes**: ask once (one AskUserQuestion call, max 4 questions, recommended option first)
   only when readings would change the plan differently; otherwise pick one and say `Assumed: …`.
3. **Which tasks may change**: `draft` tasks freely. `approved` ones only when the notes name them;
   set each changed one back with `telos task set <id> status=draft` so `/telos:approve` checks it
   again. `in-progress`, `done` and `blocked` tasks: do not touch; explain and suggest a new task.
4. **Edits**, keeping the task format (sections, scope, Files ⊆ scope, Acceptance with
   `` `cmd` → exit N ``, Interface and Edge cases for `effort: hard` / `critical: true`):
   - change a task: Edit only the sections the notes affect;
   - split: `telos task new <NN> <slug> "<title>"`, move the content, fix `depends` on both sides;
   - merge or drop: move what stays, then `telos task rm <id>` (draft only) and repoint `depends`;
   - reorder: change `depends`; IDs are never renumbered.
   - CONTEXT (standard/deep): keep confirmed `D-NN`, `D-NN [proposed]` and `Q-NN` lines and user
     answers unless the notes change them; never renumber; new choices get the next free ID as
     `[proposed]`; never silently confirm one: drop `[proposed]` only when the notes confirm
     it. Update task `decisions`/Constraints that use a changed ID, and Awaiting user with one
     `telos status set awaiting="NN:D-MM, …"` (`awaiting=` when none are left).
5. **Critique** (Profile deep only): the same self-critique as `/telos:plan`, once, over the tasks
   you changed or added: risks, missing tests, task size, edge cases; fix in place, no extra agent.
   A `Research (…)` section is evidence, never decisions; never run research yourself. There is
   no second question round: a blocking question becomes `- Q-NN: …` in the CONTEXT plus
   `telos status set awaiting="<existing entries>, NN:Q-MM"`; unresolved items go in the summary.
6. **Lint**: `telos lint-plan <NN>`; fix every reported line and rerun, at most 3 rounds.
7. **Record**: a `[planned]` phase becomes `telos roadmap set <NN> drafted`; `drafted` and `active`
   stay. Then `telos status set next="/telos:approve or /telos:revise <notes>"`.
8. **Summary**, ≤ 10 lines: what changed per task id (new, changed, removed, back to draft), the
   task list when it changed, `Assumed: …`, unresolved critique items, lint problems left; last line
   `Next: /telos:approve or /telos:revise <notes>`.
