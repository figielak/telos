<!-- Shared by /telos:do and /telos:do-hard (SPEC §5.0, §5.1, §10). Injected via `telos ctx shared do`. -->
Work from the context above: it holds the task file, STATUS, Rules, checks and the Read-first
excerpts. Open other files only where an excerpt is cut, flagged (`changed since plan`,
`missing`, `not included`) or a listed file must be edited; read just the ranges you need.
Change task, STATUS and ROADMAP state only through `telos` commands. Never push, amend,
reset or skip hooks.

0. **Stop** when the context starts with `REFUSED:`: report the reason and the fix it names.
   When it has `HINT: effort hard` and this skill runs on sonnet (`/telos:do`), suggest
   `/telos:do-hard <id>` and wait; go on with this model only when the user replies `continue`.
1. **Start**: unless the task is already `in-progress` (resumed after `/clear`), run
   `telos task set <id> status=in-progress` and
   `telos status set task=<id> next="finish <id>: <current step>"`.
2. **Work** by `type`, inside `scope` and on the `Files` list only:
   - `code`: write the tests from `## Tests` first and run them (`test_related` or `test` from
     Checks); they must fail (RED) for the right reason, then implement and rerun until green.
   - **Deep critical** (only when the context has a `Deep critical` block; other tasks and
     profiles skip it): RED counts only when the new test fails on an assertion about the
     missing behavior. A test already green, or an environment failure (missing module, syntax,
     setup, timeout), is no RED: fix the test or environment and rerun; none → step 6b.
     At RED, before any implementation, write `RED: <cmd> → exit <n>: <reason>` into `## Result`.
     Resumed without a recorded `RED:` line (`Evidence:` says so) → step 6b; never fabricate RED.
     When green, run `telos check --level full --task <id>`: exit 0 incl. e2e; no e2e → step 6b.
   - `doc`: edit the listed docs; run doc checks (build, links) when Checks has them.
   - `audit`: inspect Read first and the listed paths; write findings, edit no code.
   Follow Constraints, Interface and Rules; every Edge case needs a passing test.
3. **Verify**: `telos accept <id>`.
   - `FAIL` on a command: fix and rerun; at most 2 fix attempts, then step 6b.
   - `SCOPE FAIL` only: revert the out-of-scope edit, or keep it and name it in `Deviations:`
     (step 4), then rerun.
   - `MANUAL` items: check each yourself; one you cannot verify → step 6b.
   - **Review** (Deep critical only, after accept passes, before any state change): run
     `telos ctx review <id>` and `telos ctx shared review`, then launch the agent
     `telos:reviewer-hard` once with both outputs as its prompt. `REFUSED:` or Verdict
     `UNVERIFIED` → step 6b. CHANGES REQUESTED: fix each supported finding within scope, then
     rerun the task check and `telos accept <id>` (counts toward the 2 fix attempts).
     A HIGH or CRITICAL finding you cannot fix in scope → step 6b. One round only, no re-review.
4. **Result**: Edit the task file's `## Result` (fill it, never rewrite the file): 3–5 lines of
   what was built, the test count, surprises (audit: ≤ 10 lines of findings and proposed
   follow-up tasks). Last line `Deviations: none` or `Deviations: <path> — <why>; …` for every
   file changed outside scope. Tick every Acceptance box that passed (`- [x]`).
   Deep critical: keep the `RED:` line and add `GREEN: <check cmd> → exit 0 · e2e PASS` and
   `Review: <verdict> · EvidenceId <id> · fixed <findings or none>` within those lines.
5. **State**:
   - `telos task set <id> status=done`
   - `telos status add recent "<id> done: <one line>"`
   - next task = the first `approved` task of the phase whose depends are done (task index in
     STATUS or ROADMAP); `telos status set task=<next id> next="/telos:do"`.
   - no task left: minimal profile → `telos roadmap set <NN> done` and
     `telos status set task=none next="/telos:plan"`; standard/deep → the phase stays active,
     `telos status set task=none next="close phase <NN> (/telos:done)"`.
6. a. **Commit** (one per task) with explicit paths only:
      `git add <each Files path> <task file> .telos/STATUS.md` (+ `.telos/ROADMAP.md` when the
      phase ended, + each Deviations path); never a directory wildcard or the whole tree.
      `git commit -m "<type>(<id>): <imperative summary ≤ 72 chars>" -m "- <2–4 bullets>"`:
      type for `code` = feat (new behavior), fix (bug), refactor or test by the change;
      `doc`/`audit` = docs. Bullets describe behavior, not files. Run `git status` after: files
      of this task left unstaged → stage and commit them in a second commit with the same scope.
      A failing commit (hook, identity): show the error and stop; do not retry with other flags.
      `Auto-commit: no` in the context → no `git add` and no commit; list the paths and the
      commit subject you would use in the Reply instead.
   b. **Blocked** (failing checks after 2 attempts, unverifiable item): leave the work tree as it
      is and commit nothing. Run `telos task set <id> status=blocked` and
      `telos status set blockers="<id>: <reason>" next="/telos:do-hard <id>"`
      (already on do-hard: `next="fix <id> by hand: <reason>"`).
7. **Reply** in ≤ 10 lines: task id and title, what changed, `telos accept` verdicts, test
   count, Deviations, the commit subject (or the block reason); last line `Next: <next>`.
