# Telos

A lean, token-economical workflow plugin for Claude Code:
plan → test → implement → verify, with durable project memory in `.telos/`.

Status: **pre-alpha** (phase 01-skeleton). See [SPEC.md](SPEC.md).

## Install (per repository)

```
/plugin marketplace add figielak/telos
/plugin install telos@telos
/telos:init standard
```

Requires Claude Code with plugin support, Git and Node.js ≥ 20.10.

## Commands (in Claude Code)

All skills are user-invoked only, so they cost nothing until called.

| Command | Purpose |
|---|---|
| `/telos:init [minimal\|standard\|deep]` | Initialize Telos in the current repo: detects stack and check commands, asks once to confirm them (and the profile when not given; an initialized repo keeps its profile), runs `telos init`, prints a ≤ 10-line summary ending with the next step |
| `/telos:plan [NN\|description]` | Plan a phase (the STATUS phase, phase `NN`, or a new phase from a description): asks at most one round of questions, writes draft task files with `telos task new`, fixes them until `telos lint-plan` passes, marks the phase `drafted`, ends with a ≤ 10-line summary |
| `/telos:plan-lite [NN\|description]` | Same as `/telos:plan` on a cheaper model, for small obvious phases |
| `/telos:revise <notes>` | Apply notes to the current phase's plan with minimal edits (split, merge, reorder, change); approved tasks it changes go back to `draft`; re-lints and summarizes |
| `/telos:revise-lite <notes>` | Same as `/telos:revise` on a cheaper model, for minor edits |
| `/telos:approve` | Approve the drafted plan: refuses on lint problems, keeps tasks with unconfirmed decisions in `draft`, sets the rest `approved`, the phase `active` and STATUS, commits `docs(telos): plan phase NN-name` and creates the local tag `telos/NN-start` |
| `/telos:do [task-id]` | Execute the next approved task (or the given one): tests first → implement → `telos accept` (max 2 fix attempts, then `blocked`) → Result with Deviations → task and STATUS state → one commit `<type>(NN-MM): …` of the listed files; an `effort: hard` task stops first and suggests `/telos:do-hard` |
| `/telos:do-hard [task-id]` | Same as `/telos:do` on a stronger model, for complex or blocked tasks |
| `/telos:quick <description>` | Make a small change without a phase (≤ ~5 files, < 1 hour): ≤ 5-line mini-plan in chat, implement (test first for behavior changes), run `test_related`/`test`, `lint`, `types`, commit only the touched paths as `<type>(quick): …`; no plan file or STATUS change; larger or unclear → suggests `/telos:plan` |
| `/telos:quick-hard <description>` | Same as `/telos:quick` on a stronger model, for small but tricky fixes |
| `/telos:status` | Show phase, task, blockers, latest result and the next step in ≤ 10 lines; reads and changes nothing |

## CLI

The plugin puts `telos` on the Bash PATH (`bin/`). Skills call it; you can run it too.
Exit codes: `0` ok · `1` failure or `.telos/` missing · `2` usage error.

| Command | Purpose |
|---|---|
| `telos --help` / `-h` | List commands |
| `telos --version` / `-v` | Print the version |
| `telos init --profile <p> [--stack a,b] [--checks '<json>'] [--force]` | Create `.telos/` for `minimal`, `standard` or `deep`, sync the CLAUDE.md block, add `.telos/.cache/` to `.gitignore`. Rerun-safe: creates missing files, keeps existing ones; `--force` rewrites `config.json`. Stack/checks default to detection. Exit 1 on a profile mismatch or a broken CLAUDE.md block |
| `telos status` | Compact status: current phase/task with live states from ROADMAP and the task file, Next, Blockers, Awaiting user first |
| `telos status set <key>=<value>…` | Set STATUS lines; keys `phase`, `task`, `next`, `blockers`, `awaiting`; empty value → `none` |
| `telos status add recent "<line>"` | Prepend to Recent, keep the 3 newest |
| `telos status add carry "<line>"` | Append to Carry-over; exit 1 when 5 items exist |
| `telos status rm carry <n>` | Remove Carry-over item `n` (1-based) |
| `telos accept <id>` | Run the task's `` `cmd` → exit N `` Acceptance items (`sh -c` in the repo root, 600 s each; other items are MANUAL) and check that every changed file (work tree + commits `<type>(<id>):` since `telos/NN-start`) is in `scope`, `.telos/` or the Result's `Deviations:` line. One line per item, `accept <id>: PASS\|FAIL`; exit 1 on any FAIL |
| `telos lint-plan [NN]` | Check a phase's task files (default: phase from STATUS): sections per type and detail level, line limits, `scope` set and Files ⊆ scope, machine-checkable acceptance, depends (exist, no cycles), decisions in CONTEXT, id = file name. Prints `ok: N tasks` or one `<id>: <problem>` line each and exits 1 |
| `telos roadmap set <NN> <status>` | Change a phase's `[status]` in ROADMAP.md in place (`planned`, `drafted`, `active`, `done`, `dropped`) |
| `telos roadmap add <name> "<goal>" "<done when>"` | Append `- NN-name [planned] goal · done when: …` with the next free NN |
| `telos task new <NN> <slug> "<title>"` | Create the next task file `NN-MM-slug.md` (status `draft`) from the template; the phase dir is named after its ROADMAP line |
| `telos task set <id>… status=<s>` | Set the status of one or more tasks in place (comments kept); all ids are checked before any write |
| `telos task rm <id>` | Delete a `draft` task file; other statuses exit 1 |
| `telos ctx <bundle> [args]` | Print a skill's context bundle (≤ 6000 chars, comments stripped); unknown bundle → one line, exit 0 |
| `telos ctx init [profile]` | Bundle for `/telos:init`: profile, repo and Telos state, CLAUDE.md block state, detected stack/checks with evidence |
| `telos ctx plan [NN\|description]` | Bundle for `/telos:plan` and `/telos:revise`: profile, target phase (STATUS phase by default, plus the NN a new phase would get; a description → the next NN), PROJECT Purpose and Rules, stack, checks, ROADMAP, phase CONTEXT, numbered carry-over items for the phase, task index, format rules |
| `telos ctx approve [NN]` | Bundle for `/telos:approve`: phase line, task index, lint-plan result, draft ids, tasks blocked by proposed or awaited decisions, phase tag, uncommitted `.telos/` changes |
| `telos ctx do [id]` | Bundle for `/telos:do`: picks the in-progress task or the first approved one with done depends; `REFUSED: …` (exit 0) for draft tasks, unmet depends and proposed/awaited decisions; else the task file, STATUS, PROJECT Rules, stack, checks, CONTEXT goal and decisions, depends' Interface, Read-first excerpts (stale ones flagged) and matching MAP lines |
| `telos ctx quick` | Bundle for `/telos:quick` (the description stays in the skill body): current phase/task (warns when one is in progress), PROJECT Rules, stack, quick checks (`test_related`, `test`, `lint`, `types`), working tree (≤ 20 files), size guard |
| `telos ctx shared <name>` | Print `shared/<name>.md`, the instructions a skill and its `-lite`/`-hard` variant share (skills cannot `cat` plugin files) |
| `telos ctx status` | Bundle for `/telos:status`: status view, stack line, file pointers |

## Hooks

Node scripts in `hooks/`, no model calls; each exits silently when `.telos/` is missing.

| Event | Profile | Behavior |
|---|---|---|
| `SessionStart` (startup, resume, clear) | all | Injects a compact status (≤ 1200 chars): *Awaiting user* first (if any), PROJECT Purpose line 1, stack, profile, phase/task with live states, Next, Blockers, carry-over count, latest Recent line, file pointers |
| `PreToolUse` Bash | all | Git guard: blocks `git push`, `--no-verify` (also `commit -n`), `git add -A` / `--all` / `.` / `:/`, `git commit --amend` when HEAD is on a remote branch, and `git reset --hard`, with exit 2 and `telos git guard: <rule> — <why>`; it splits `&&`, `;`, `|`, env prefixes, `git -C`/`-c` and `sh -c '…'`, and ignores quoted text |
