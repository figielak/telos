# 02 · Core loop
## Goal
Make the minimal core loop work: `/telos:plan` → `revise` → `approve` → `do` (per task,
with commits) plus `quick` and `status`, backed by deterministic CLI commands (`accept`,
`lint-plan`, `task set`, `roadmap set`, `ctx plan|approve|do|quick`) and the SessionStart and
git-guard hooks. Done when a minimal phase runs end to end with commits in a test repo (SPEC §14).

## Decisions
- D-01: One phase 02, no 02a/02b split: `NN` is two digits everywhere (dirs, task IDs, commit scope `^[a-z]+\(NN-MM\):`, `roadmap set <NN>`), and the CLI half alone is not usable; order inside the phase is CLI → skills → hooks → e2e.
- D-02: `lib/tasks.mjs` is the single task-file model (frontmatter + `## ` sections, phase listing, next-task selection); `lint-plan`, `accept`, `ctx` and hooks never parse task files themselves.
- D-03: State changes only via CLI: `telos task set <id> status=<s>` (frontmatter `setField`, D-03 of 01) and `telos roadmap set <NN> <status>`; skills never hand-edit frontmatter, ROADMAP or STATUS.
- D-04: The CLI never writes to git (read-only `git status`/`log`/`diff`/`rev-parse`); commits and the `telos/NN-start` tag are made by skills via `allowed-tools`, so the git guard sees every write.
- D-05: Machine-checkable Acceptance = `` `cmd` → exit N `` only; other `→` forms are reported as MANUAL. Commands run via `sh -c` in the repo root, 600 s timeout, a failure prints the last 15 output lines.
- D-06: Scope check set = `git status --porcelain` (untracked included, ignored excluded) ∪ files of commits matching `^[a-z]+\(<id>\):` since `telos/NN-start` (whole history without the tag); minus `.telos/` and the paths named in `Deviations:`.
- D-07: `lint-plan` checks structure only: sections per type/level, line limits (80/140), `scope` non-empty, Files ⊆ scope, Acceptance has a `→ exit` item and code tasks `all listed tests pass`, depends exist and are acyclic, id = filename, decisions defined in CONTEXT when it exists. Coverage of each edge case is judged by the `plan` skill.
- D-08: Next task = first task by ID with `in-progress`, else first `approved` whose depends are all `done`. `ctx do` refuses with exit 0 and a first line `REFUSED: <reason>` (so the skill injection still shows it) for a draft task, an unmet depend, and a task whose decisions are proposed or listed in *Awaiting user*.
- D-09: 02 builds the minimal path plus cheap std+ reads (referenced decisions + CONTEXT goal in `ctx do`); writing CONTEXT/HISTORY/LESSONS, lessons and delete-zone in bundles stay in 04 (STATUS carry-over).
- D-10: Git guard blocks with exit 2 + one-line reason on stderr; it tokenizes the whole command (`&&`, `;`, `|`, env prefixes, `git -C`); `reset --hard` is always blocked (the hook cannot see user intent; the user runs it), `commit --amend` only when HEAD is on a remote-tracking branch.
- D-11: E2E = automated CLI-level test in `npm test` (temp repo, no model) + a headless `claude -p --plugin-dir` run of plan → approve → do on a minimal fixture, recorded in Result (as 01-09); the model run is not in `npm test`.

## Constraints
- D-01…D-10 of phase 01 still apply (ESM, no deps, `node:test`, frontmatter subset, exit codes 0/1/2).
- Every new CLI command and skill is documented in README.md in the same task.
- Bundles stay ≤ 6000 chars (`cap()`), SessionStart output ≤ 1200 chars.
- Variant skills (`plan-lite`, `revise-lite`, `do-hard`, `quick-hard`) hold frontmatter only and inject `shared/<name>.md` (SPEC §5.0).
- Skill bodies use only their bundle; they never read the whole repo or `.telos/` by hand.

## Open questions
- Q-01: Does `${CLAUDE_PLUGIN_ROOT}` expand inside a skill's !`…` injection, and which `allowed-tools` entry does `cat` need? Resolved by a spike in 02-08; fallback `telos ctx shared <name>`.

## Carried over
- none

## Links
- SPEC.md §2, §4.1–4.4, §5–5.3, §8, §10, §13, §14
- 01-CONTEXT.md (D-01…D-10)
