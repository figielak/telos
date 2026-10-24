<!-- Shared by /telos:plan and /telos:plan-lite (SPEC §5.0, §5.2). Injected via `telos ctx shared plan`. -->
Work from the context above. Look at code only where a task needs it (Grep/Glob, then read just
the ranges you cite); never read the whole repo. Write only task files under `.telos/phases/`;
change ROADMAP, STATUS and task `status` only through the `telos` commands below. Never commit.

1. **Target** from the Request: empty → the `Target:` phase; a phase number `NN` other than the
   Target → run `telos ctx plan NN` and use that bundle instead; any other text → a new phase with
   the `New phase:` number (its carry-over is listed there). **Stop** when the context starts with
   `REFUSED:`, when there is no target (ask for a phase number or a description), or when the
   target is `[active]`, `[done]` or `[dropped]` (suggest `/telos:revise <notes>` or a new phase).
2. **Ask once, only if you must**: one AskUserQuestion call, max 4 questions, multiple choice,
   recommended option first. Ask only when the answer changes the plan (scope, approach, data
   model, acceptance, task split) and the context or a quick look at the code cannot settle it.
   Everything else: pick the conventional option and list it as `Assumed: …` in the summary.
   Record answers in the Constraints of the tasks they affect. No second round.
3. **New phase**: `telos roadmap add <kebab-name> "<goal>" "<done when>"` (it prints the NN);
   the done-when criterion must be observable.
4. **Tasks**: split the phase into tasks of about an hour or less; foundations first, so `depends`
   point backwards. For each: `telos task new <NN> <slug> "<title>"`, then Edit the new file:
   - frontmatter: `type` (code | doc | audit), `effort: hard` for complex logic, cross-module
     refactors or subtle bugs, `critical: true` for security, payments, concurrency, data integrity,
     `depends`, `decisions` (only D-NN from the CONTEXT), `scope` always (path prefixes or globs;
     `["*"]` only when deliberate; audit: `[".telos/"]`).
   - Goal: 1–2 sentences. Read first: one ref per line, `path:start-end (symbol)` or
     `FILE.md §Section`, only ranges you checked. Files: `- path (create|modify|delete)`, inside scope.
   - Constraints: task rules, carried-over items, PROJECT Rules that bite here.
   - Tests (type code only): behaviors to test first, one line each.
   - Steps: 3–6 bullets; detailed tasks: `N. path: function — what`, each verifiable.
   - Acceptance: `- [ ] all listed tests pass` (code) and at least one ``- [ ] `cmd` → exit 0``
     built from the Checks line; other criteria as plain checkboxes. Leave Result empty.
   - `effort: hard` or `critical: true`: add `## Interface` (contracts, ≤ 15 lines) and
     `## Edge cases` (`- input → outcome`) before Steps; every edge case also appears in Tests.
   - ≤ 80 lines per task (detailed ≤ 140). Edit sections in place; never rewrite a whole file.
5. **Carry-over**: copy each `Carry-over for NN` item into the Constraints of the task that covers
   it, then `telos status rm carry <n>` for each, highest `n` first (numbers shift).
6. **Lint**: `telos lint-plan <NN>`; fix every reported line and rerun, at most 3 rounds. Then check
   yourself what lint cannot: each edge case has a test, Read-first ranges point at the right code.
7. **Record**: `telos roadmap set <NN> drafted`, then
   `telos status set phase=<NN-name> task=none next="/telos:approve or /telos:revise <notes>"`.
8. **Summary**, ≤ 10 lines: phase goal; tasks as `NN-MM title`, marking `[hard]` / `[critical]`;
   risks; `Assumed: …`; open questions and lint problems left; last line
   `Next: /telos:approve or /telos:revise <notes>`.
