# 13-close-catchup: one write point

**Goal.** Memory is written in one place. `/telos:close` updates it at the end of a phase;
`/telos:catchup` does the same for work done without Telos. Both read the same delta from
git, so skipping the tool for a week costs one command.

**Done when.** An e2e test with commits made without Telos yields a bundle of at most 6000
chars listing the changed areas, and `telos stale` is empty after the run; `npm test` passes.

## Decisions (defaults)

- D1 The delta is computed per area from its own anchor to HEAD, not from a phase tag.
- D2 The agent edits only the sections of affected areas. Unaffected areas are not opened.
- D3 What goes in: decisions with reasons, rejected approaches, new invariants and
  pitfalls, changed entry points. What stays out: a retelling of the diff.
- D4 Files under no area are reported as `unmapped`; the agent proposes a new area or adds
  the path to an existing one. It never ignores them silently.
- D5 `catchup` with an empty delta prints `Nothing to catch up` and ends; no model work.
- D6 One commit at the end, `docs(telos): close NN-name` or `docs(telos): catch up`, only
  when `git.auto_commit` is true.

## Tasks

- [x] **13-01 Delta engine**
  - `lib/delta.mjs`: per stale area: commit subjects since the anchor (≤ 10, newest
    first), changed files with `--stat` numbers, added/deleted/renamed kinds; plus the
    unmapped list. Budgeted rows with omission counts; commit messages are quoted data.
  - Accept: unit tests on the `areas` fixture: two areas changed, one fresh, one unmapped file.

- [x] **13-02 `telos ctx close [NN]`**
  - Extend the phase 10 bundle: phase file state, delta per area, broken refs, configured
    checks, the exact closing commands in order (`telos area anchor …`,
    `telos history add phase …`, `telos roadmap set NN done`, `telos status set …`).
  - Over 6000 chars: per-file rows shrink to counts first, then commit subjects.
  - Accept: `test/ctx-close.test.mjs` covers ready, blocked (unchecked items), and overflow.

- [x] **13-03 `telos ctx catchup`**
  - The same delta without phase bookkeeping; closing commands are `telos area anchor …`
    and one `telos history add quick quick "…"` line when a decision was recorded.
  - Accept: test for the empty delta and for a populated one.

- [x] **13-04 Shared instructions**
  - `shared/close.md`, used by both skills: read the bundle; for each affected area read
    only the changed files you need; edit the area under D2 and D3; fix broken refs; handle
    unmapped paths under D4; run `telos area lint`; run the closing commands; report in
    ≤ 10 lines what was recorded and what was left unverified.
  - Accept: `test/skills.test.mjs` asserts the instruction file is referenced by both skills.

- [ ] **13-05 Skills**
  - `skills/close/SKILL.md` (update) and `skills/catchup/SKILL.md` (new): one
    `telos ctx …` injection each, user-invoked only, no free user text in the injection.
  - README rows; CLAUDE.md block mentions catch-up after work outside Telos.
  - Accept: manifest test lists five skills: `status plan close catchup map`.

- [ ] **13-06 End-to-end proof**
  - `test/e2e-memory.test.mjs`: copy the `areas` fixture, make three commits without Telos
    (edit in area A, new file in area B, new top-level dir), assert the catch-up bundle
    (≤ 6000 chars, lists A, B and the unmapped dir), apply scripted area edits, run the
    closing commands, assert `telos stale --check` exits 0.
  - The harness plays the model; it proves the CLI and file contracts, not model judgment.
  - Accept: *Done when* holds.

## Notes
