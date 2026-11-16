<!-- Injected into /telos:plan via `telos ctx shared plan`. -->
Work from the context above. For the paths the phase touches, `telos ctx plan <NN> --area <path>`
adds their area files. Look at code only where a task needs it (Grep/Glob, then read just
the ranges you cite); never read the whole repo. Write only the phase file under
`.telos/phases/`; change ROADMAP and STATUS only through the `telos` commands below.

1. **Target** from the Request: empty → the `Target:` phase; a phase number `NN` other than the
   Target → run `telos ctx plan NN` and use that bundle instead; any other text → a new phase with
   the `New phase:` number. **Stop** when there is no target (ask for a phase number or a
   description) or the target is `[done]` or `[dropped]` (suggest a new phase).
2. **Ask once, only if you must**: one AskUserQuestion call, at most 4 multiple-choice questions,
   recommended option first, and only when the answer changes the plan and neither the context
   nor a quick look at the code settles it. Otherwise pick the conventional option and note it
   as `Assumed: …` under Notes. No second round.
3. **New phase**: `telos roadmap add <kebab-name> "<goal>" "<done when>"` (it prints the NN), then
   `telos ctx plan <NN>` for the skeleton. The done-when criterion must be observable.
4. **Phase file**: write the `Phase file:` path from its skeleton (or edit it in place when it
   exists), ≤ 80 lines:
   - Goal and Done when from the phase line, sharpened only where they are vague.
   - Tasks: `- [ ] **NN-MM Title**`, numbered from 01, foundations first, each about an hour or
     less, with at most 3 indented lines: what changes and where (`path` or `path:start-end`),
     and how to accept it (a check command from the `Checks:` line or an observable result).
   - Notes: assumptions, carry-over items, risks; never a removed approach from the context.
5. **Record**: `telos roadmap set <NN> active`, then
   `telos status set phase=<NN-name> task=none next="<first task id and title>"`;
   `telos status rm carry <n>` for each carry-over item you placed, highest `n` first.
6. **Commit** only when `Auto-commit: yes`: `git add <phase file> .telos/ROADMAP.md .telos/STATUS.md`,
   then `git commit -m "docs(<NN>): plan phase <NN-name>"`. Otherwise leave it uncommitted.
7. **Summary**, ≤ 8 lines: goal; the task ids and titles; `Assumed: …`; risks; last line
   `Next: <first task id and title>`.
