# 15-resume-test: memory acceptance test

**Goal.** One command answers the only question that matters for this tool: does a fresh
session know the project better, and more cheaply, with the memory than without it?

**Done when.** One command prints correct/total and cost for both variants; `npm test` passes.

## Decisions (defaults)

- D1 Questions live in the target project, `.telos/resume-test.md`, 5–10 entries:
  `- Q: <question>` followed by `  expect: <fact>; <fact>`. Three kinds: what is next,
  where X lives, why Y was decided.
- D2 Scoring is deterministic: an answer is correct when it contains every expected fact
  (case-insensitive substring; a fact may be `a|b` for alternatives). No model judge.
- D3 Two variants per question, each in a fresh headless session: **memory** (the
  repository as is) and **bare** (a temporary copy without `.telos/` and without the rules
  block).
- D4 Reported per variant: correct/total, tokens, cost, number of tool calls (the
  exploration proxy).
- D5 The runner is `telos resume-test`, so it works in any project. Nothing is created
  under `bench` (Delete-zone); results go to stdout only.
- D6 `npm test` never calls a model: the agent command is injectable.

## Tasks

- [x] **15-01 Question file**
  - `templates/resume-test.md` with three commented examples; `lib/resume-test.mjs`:
    parse and validate (5–10 questions, each with at least one fact).
  - Accept: parser tests for valid, too few, missing `expect`.

- [x] **15-02 Runner**
  - For each question and variant: build the working copy (D3), run the agent command with
    the question and "answer in at most five lines", capture the answer and the usage.
  - Default agent command: Claude Code headless with JSON output; check the exact flags
    and usage fields against `claude --help` when implementing. `--agent-cmd '<cmd>'`
    overrides it (for Codex after phase 14, and for tests).
  - Timeouts per question; a failed run is counted as incorrect and listed.
  - Accept: tests with a stub agent command cover both variants and a timeout.

- [x] **15-03 Scoring and report**
  - Apply D2; print a table: question · memory ✓/✗ · bare ✓/✗, then the D4 totals and the
    missing facts for every incorrect answer.
  - `--variant memory|bare` runs one side; `--json` prints machine output.
  - Accept: scoring tests including alternatives and a partial match.

- [x] **15-04 Command and docs**
  - Register `telos resume-test`; README section "Does the memory work?" with a sample
    report and the cost warning (2 × N headless sessions).
  - Accept: CLI test with the stub; README row present.

- [ ] **15-05 First real run on Telos**
  - Write eight questions for this repository from HISTORY and the area files; run once;
    record the report in Notes.
  - If bare scores as well as memory, record which questions were too easy and replace them
    before phase 16 relies on the test.
  - Accept: a recorded report with both variants.

## Notes
