# 12-anchors: staleness detection

**Goal.** The CLI tells, without a model, which area notes may no longer match the code.
Stale memory is worse than none, because the agent trusts it.

**Done when.** Fixture tests detect a changed covered file and a deleted reference without
any model call; SessionStart shows the stale count; `npm test` passes.

## Decisions (defaults)

- D1 An area is **stale** when a file under its `paths` changed between its anchor commit
  and HEAD, or is dirty in the work tree.
- D2 An area has a **broken ref** when a backticked `path` or `path:line` in its body
  points to a missing file or past the end of the file.
- D3 An anchor commit that no longer exists (rebase, shallow clone) makes the area
  **unanchored**; it is reported, not treated as fresh.
- D4 `telos stale` exits 0 with a report; `telos stale --check` exits 1 when anything is
  stale, broken or unanchored.
- D5 Staleness never blocks work. It is a line in the status and a section in `ctx close`.

## Tasks

- [x] **12-01 Staleness engine**
  - `lib/stale.mjs`: group areas by anchor, one `git diff --name-only <anchor>..HEAD` per
    distinct anchor plus one `git status --porcelain`; map changed files to areas with the
    11-01 matcher. Git calls go through `lib/git.mjs` (read-only, size and time limits).
  - Accept: unit tests for fresh, stale by commit, stale by dirty file, unanchored.

- [x] **12-02 Reference check**
  - Extract the reference check from `inspectMap` (`lib/map.mjs`) into a shared function and
    apply it to area bodies;
    report `<area>: broken ref <path[:line]>`.
  - Accept: tests for a deleted file, a line past EOF and a valid range.

- [ ] **12-03 `telos stale` command**
  - `telos stale [--area <name>] [--check]`: one row per affected area,
    `<area>: stale · N files since <sha7> (a, b, +K more)`; `fresh: N areas` summary;
    files under no area listed as `unmapped: N files (top dirs)`.
  - Output ≤ 6000 chars with explicit omission counts. README row.
  - Accept: CLI tests including both exit modes.

- [ ] **12-04 `telos area anchor`**
  - `telos area anchor <name>…|--all`: set the header commit and date to HEAD, keeping
    every other byte. Refuse when a covered path is dirty (the note would claim more than
    is committed).
  - Accept: byte-compare test; refusal test.

- [ ] **12-05 SessionStart line and fixtures**
  - `lib/session.mjs`: `Stale areas: N (run telos stale)` when N > 0, inside the 1200-char
    cap. Budget: the hook stays under 300 ms with 30 areas (measure in a test with a
    generous bound).
  - Fixture `test/fixtures/areas/`: a small repo with three areas for these tests and phase 13.
  - Accept: session test shows the line only when stale; *Done when* holds.

## Notes
