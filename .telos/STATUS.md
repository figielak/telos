# Status
<!-- ≤ 40 lines. Maintained by `telos status set <key>=<value>`; never edit by hand.
     Holds pointers only: phase state lives in ROADMAP, task state in the task file. -->
Phase: 04-standard
Task: 04-11
Next: /telos:do
Blockers: none
Awaiting user: none
<!-- Blockers: "NN-MM: reason". Awaiting user: IDs only, e.g. "02:Q-01, 02:D-03" -->

## Carry-over
<!-- max 5: "- NN: item → source". plan moves matching items into phase NN
     CONTEXT §Carried over (std+) or its task files (minimal). -->
- 05: `telos adr new "<title>" --source NN:D-MM [--supersedes NNN]` fills ADR header, flips superseded ADR → SPEC §11, 01-04 Result
- 06: headless map/refresh proof on one real Astro and one real Python repo at pinned revisions (map + map-hard, evidence, §12 usage) → 03-CONTEXT D-09, D-07

## Recent
<!-- max 3, newest first: "- NN-MM done: one line" -->
- 04-10 done: delete-zone warnings once per canonical path/session with exact revert guidance
- 04-09 done: edit guard for protected configs and task scope (warn, strict deny)
- 04-08 done: ctx undo preview and confirmation-gated /telos:undo preserving Telos metadata
