<!-- telos-area: commit 81b817107d4b937b98e44b11816c113d8891bfb8 · 2026-11-16 · paths: lib/resume-run.mjs, lib/resume-test.mjs, test/resume-run.test.mjs, test/resume-test.test.mjs, test/fixtures/resume-agent.mjs -->
# resume-test

## Purpose
`telos resume-test`: asks the questions in `.telos/resume-test.md` in fresh headless sessions with
and without the memory, scores the answers without a model and prints the report.

## Entry points
- `lib/resume-test.mjs:173` — `resumeTestCommand`; `:34` `parseQuestions`; `:99` `score`;
  `:111` `summarize`; `:149` `renderReport`
- `lib/resume-run.mjs:202` — `runAll`; `:173` `ask`; `:55` `workingCopy`; `:91` `runAgent`;
  `:132` `parseOutput`; `:19` `DEFAULT_AGENT_CMD`
- `test/fixtures/resume-agent.mjs` — stub agent (`json`, `text`, `fail`, `sleep` modes)
- `templates/resume-test.md` — question file format (area cli owns `templates/`)

## Invariants
- `npm test` never calls a model: the agent command is injectable (`--agent-cmd`, 15:D6).
- Scoring is deterministic (15:D2): every fact must be in the answer, case-insensitive; a fact
  that starts or ends with a digit never matches inside a longer number.
- Results go to stdout only; nothing is written under `bench` (Delete-zone) or into the repo.
- Both variants run in temporary copies without the questions file; `bare` also drops `.telos/`
  and the Telos block. A failed run counts as incorrect and is listed.
- SIGINT/SIGTERM kills the running agent's process group and removes the copies (exit 130/143).

## Decisions
- One working copy per variant for the whole run, not per question — a large repo is copied
  twice; the sessions are read-only and told to change nothing.
- The default agent command grants no git commands — the copies keep `.git` (the memory side's
  `telos stale` needs it), where the removed memory and the questions file are still in history.
- Copies skip `node_modules` at any depth, `.telos/.cache` and `.claude/settings.local.json` —
  that file enabled plugins and left one local-scope install record per session.
- Exit 1 only when the file is missing or invalid or every run failed; partial failures show in
  the report.
- On Telos itself bare scored as well as memory (6/8 vs 6/8): `plan/` and README repeat the
  memory. The test proves something only on a project whose decisions live in `.telos/` (16).

## Rejected
- A model judge (15:D2) — not reproducible and costs a session per answer.
- Treating not-all-JSON output as plain text whenever one line fails to parse — a stray stdout
  line made the whole transcript, tool results included, count as the answer.

## Pitfalls
- Write facts as the shortest stem (`trust`, not `trusted`) and prefer identifiers, paths and
  numbers: the user's language setting can override "Answer in English".
- A custom `--agent-cmd` that grants git, or write tools on the shared copy, reopens the leak or
  carries changes between questions.
- Agents run detached in their own process group, so only the handlers in `runAll` stop them;
  `ask` called alone has no interrupt handling.
- Timers overflow past 2^31 − 1 ms and fire at once: `--timeout` is bounded by `MAX_TIMEOUT_S`.
