# Status
<!-- ≤ 40 lines. Maintained by `telos status set <key>=<value>`; never edit by hand.
     Holds pointers only: phase state lives in ROADMAP, task state in the task file. -->
Phase: 02-core-loop
Task: 02-03
Next: implement 02-03 (telos lint-plan)
Blockers: none
Awaiting user: 02:Q-01
<!-- Blockers: "NN-MM: reason". Awaiting user: IDs only, e.g. "02:Q-01, 02:D-03" -->

## Carry-over
<!-- max 5: "- NN: item → source". plan moves matching items into phase NN
     CONTEXT §Carried over (std+) or its task files (minimal). -->
- 04: `telos history add <kind> <ref> "<text>"` + Log rotation to HISTORY-archive.md → SPEC §4.1, templates/HISTORY.md
- 04: delete-zone guard hook (warn once per path per session, next-step hint; `history add revert` drops the entry) + approach lines in plan/quick bundles → SPEC §4.1, §8
- 05: `telos adr new "<title>" --source NN:D-MM [--supersedes NNN]` fills ADR header, flips superseded ADR → SPEC §11, 01-04 Result

## Recent
<!-- max 3, newest first: "- NN-MM done: one line" -->
- 02-02 done: telos roadmap set|add
- 02-01 done: task model and telos task new|set|rm
- 01-09 done: /telos:init skill and end-to-end check
