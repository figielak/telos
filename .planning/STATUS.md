# Status
<!-- ≤ 40 lines. Maintained by `telos status set <key>=<value>`; never edit by hand.
     Holds pointers only: phase state lives in ROADMAP, task state in the task file. -->
Phase: 01-skeleton
Task: 01-08
Next: 01-08 telos init (deterministic file creation)
Blockers: none
Awaiting user: 01:D-01, 01:D-02, 01:D-03, 01:D-04, 01:D-05, 01:D-06, 01:D-07, 01:D-08
<!-- Blockers: "NN-MM: reason". Awaiting user: IDs only, e.g. "02:Q-01, 02:D-03" -->

## Carry-over
<!-- max 5: "- NN: item → source". plan moves matching items into phase NN
     CONTEXT §Carried over (std+) or its task files (minimal). -->
- 04: `telos history add <kind> <ref> "<text>"` + Log rotation to HISTORY-archive.md → SPEC §4.1, templates/HISTORY.md
- 04: delete-zone guard hook (warn once per path per session, next-step hint; `history add revert` drops the entry) + approach lines in plan/quick bundles → SPEC §4.1, §8
- 05: `telos adr new "<title>" --source NN:D-MM [--supersedes NNN]` fills ADR header, flips superseded ADR → SPEC §11, 01-04 Result

## Recent
<!-- max 3, newest first: "- NN-MM done: one line" -->
- 01-07 done: telos ctx bundle skeleton
- 01-06 done: stack and check command detection
- 01-05 done: frontmatter module and telos status
