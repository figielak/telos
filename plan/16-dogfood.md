# 16-dogfood: real project and decision

**Goal.** Use the tool on the large project, pause, come back, and decide with numbers
whether Telos continues.

**Done when.** The post-pause resume-test result and the overhead of status, close and
catch-up sessions against the total are recorded; over 15% overhead or no advantage over no
memory closes the project.

Starts after phase 13. Tasks 16-04 and 16-05 need phase 15.

## Decisions (defaults)

- D1 **Overhead** = cost of sessions or turns spent on `plan`, `close`, `catchup` and `map`
  divided by the total cost of the period. Read from the host's own cost report at the end
  of each session; no extra tooling.
- D2 **Go** needs both: overhead ≤ 15%, and the memory variant of the resume test beats the
  bare one on correct answers or matches it at visibly lower cost and fewer tool calls.
- D3 The pause is at least 7 days without opening the project.
- D4 Telos is not changed during the trial except for defects that block work; ideas go
  to the friction log.

## Tasks

- [ ] **16-01 Set up the project**
  - `telos init`, `/telos:map`, first ROADMAP phases. Record in Notes: date, repository
    size (files, lines), number of areas, `telos budget` totals.
  - Accept: `telos area lint` and `telos stale --check` exit 0 in the project.

- [ ] **16-02 Work period (2–3 weeks) with a cost log**
  - Work normally; close each phase with `/telos:close`. After each session add one row to
    the table in Notes: date · kind (work / plan / close / catchup / map) · cost.
  - At least once, deliberately work a few days without Telos and then run `/telos:catchup`.
  - Accept: at least two closed phases, one catch-up, a complete log.

- [ ] **16-03 Friction log**
  - One line whenever the tool was skipped, got in the way, recorded something wrong, or
    the agent ignored the memory: date · what · what would have helped.
  - Before the pause, write `.telos/resume-test.md` in the project from decisions actually
    made (8 questions, D1 of phase 15).
  - Accept: the question file validates; the log exists (empty is a valid result).

- [ ] **16-04 Pause and resume test**
  - After the pause (D3): run `telos resume-test` once, both variants; paste the report
    into Notes. Then do one real task in a fresh session and note how many clarifying
    turns it took before useful work started.
  - Accept: report and the one-task note recorded.

- [ ] **16-05 Decision**
  - Compute overhead (D1) from the log; apply D2.
  - Go: turn the friction log into the next ROADMAP phases. No-go: record why, archive the
    repository, keep the plain `.telos/` files in the project as ordinary notes.
  - Record the decision with `telos history add decision 16 "…"`.
  - Accept: the HISTORY entry exists and names the numbers behind it.

## Notes

| Date | Kind | Cost |
|---|---|---|
