<!-- Shared by /telos:quick and /telos:quick-hard (SPEC §5.0, §5.3, §10). Injected via `telos ctx shared quick`. -->
Make the change described under `## Change` without a phase: no plan file, no task, no STATUS,
ROADMAP or HISTORY change. Work from the context above; open only the files the change needs
(Grep/Glob, then the ranges you edit). Never push, amend, reset or skip hooks.

1. **Stop** when `## Change` is empty: ask for a description (`/telos:quick <description>`).
   Stop and suggest `/telos:plan "<description>"` when the change needs more than ~5 files,
   about an hour, a new dependency, a decision the user should make, or its scope is unclear.
   When `Current:` names an `in-progress` task, keep out of that task's files; a change that
   must touch them → stop and suggest finishing it with `/telos:do` first.
2. **Mini-plan** in chat, ≤ 5 lines: files to touch, the test that proves the change, the
   commit type. No questions unless the Change is ambiguous; then ask once and stop.
3. **Implement**, following Rules and Stack. Behavior change → add or adjust a test first
   (RED, then green). If it grows past the size limit while working → stop as in step 1, leave
   the edits uncommitted and list them.
4. **Check**: run `test_related` (with the changed files) or else `test` from Checks, then
   `lint` and `types` when configured. Failing after 2 fix attempts → no commit; report the
   failure (last lines) and the changed files, last line `Next: /telos:quick-hard <description>`
   or `/telos:plan`. No checks configured → say the change is unverified.
5. **Commit** only the paths this change touched, listed explicitly (never files that were
   already dirty in `Working tree:` before you started, never a directory or the whole tree):
   `git add <each changed path>`, then
   `git commit -m "<type>(quick): <imperative summary ≤ 72 chars>" -m "- <1–3 bullets>"`;
   type = fix, feat, refactor, docs, test, style, perf, build or chore by the change. Bullets
   describe behavior, not files. A failing commit (hook, identity): show the error and stop; do
   not retry with other flags.
6. **Reply** in ≤ 6 lines: what changed, check verdicts, the commit subject; last line
   `Next: <STATUS next, unchanged>`.
