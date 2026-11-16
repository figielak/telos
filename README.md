# Telos

Project memory for coding agents, backed by a deterministic CLI.

Telos keeps a few small markdown files in `.telos/` — what the project is, where things are,
what is next and why things were decided — and puts a short status into every new Claude Code
session. Planning, testing and implementing stay ordinary agent work: Telos records, it does not
run a process.

Status: **pre-alpha**, version 0.2.0. Version 0.1 was a full workflow plugin (profiles, gated
plan/approve/do/check/done, review agents); the [Benchmark](#benchmark) showed that ceremony cost
2–5× more without better results, so 0.2 keeps only the memory core. The old state is tagged
`pre-memory-core`.

## Install (per repository)

```text
/plugin marketplace add figielak/telos
/plugin install telos@telos
```

Then, in the repository: `telos init` (the plugin puts `telos` on the Bash PATH).
Requires Claude Code with plugin support, Git and Node.js ≥ 20.10. No dependencies.

## Five-minute walkthrough

1. `telos init` — detects the stack and check commands, creates `.telos/` (PROJECT, MAP,
   ROADMAP, STATUS, HISTORY, `config.json`), adds a short Telos block to `CLAUDE.md` and
   `.telos/.cache/` to `.gitignore`. Rerun-safe: existing files are kept.
2. `/telos:map` — on an existing codebase, writes `.telos/MAP.md`, a short index (structure,
   one row per area, where to find things), and one `.telos/areas/<name>.md` per area (entry
   points, invariants, decisions) from a deterministic scan and a few targeted reads, and
   drafts empty PROJECT sections for you to confirm.
3. `/telos:plan add login with magic links` — adds a ROADMAP phase and writes one file,
   `.telos/phases/NN-name.md`: goal, done-when, a checklist of `- [ ] **NN-MM Title**` tasks,
   notes. The phase becomes `active` and STATUS points at the first task.
4. Work as usual. Tick a task's box when it lands; `telos status set task=NN-MM next="…"`
   keeps the pointer current.
5. `/telos:close` — lists unchecked tasks (they block the close) and the configured check
   commands; the agent runs them, then records `phase` in HISTORY, sets the phase `done` and
   points STATUS at the next phase.
6. A new session starts with the status (≤ 1200 chars): project purpose, stack, phase and task,
   next step, blockers. `/telos:status` shows the same on demand.

## Memory files

| File | Holds |
|---|---|
| `PROJECT.md` | Purpose, hard Rules, Conventions, Out of scope (≤ 60 lines) |
| `MAP.md` | Index of where things are: Structure (≤ 10 lines), one Areas row per area file, Find; ≤ `limits.map_tokens` (600) |
| `areas/<name>.md` | One area's living docs, read only when work touches its paths: Purpose, Entry points, Invariants, Decisions, Rejected, Pitfalls (≤ `limits.area_tokens`, 800) |
| `ROADMAP.md` | One line per phase: `- NN-name [status] goal · done when: …` |
| `phases/NN-name.md` | The plan of one phase: Goal, Done when, Tasks checklist, Notes (≤ 80 lines) |
| `STATUS.md` | Pointers only: Phase, Task, Next, Blockers, Awaiting user, Carry-over, Recent |
| `HISTORY.md` | Why: a dated Log and the Delete-zone of removed paths and approaches |
| `config.json` | Version 2: `stack`, `checks`, `limits`, `git`, `files_language` |

## Commands (in Claude Code)

Skills are user-invoked only, so they cost nothing until called. Each injects one
`telos ctx <bundle>` and never reads the whole repository.

| Command | Purpose |
|---|---|
| `/telos:status` | Phase, task, blockers, latest Recent line and the next step in ≤ 10 lines; reads and changes nothing |
| `/telos:map [--refresh]` | Write the `.telos/MAP.md` index and the `.telos/areas/` files from `telos ctx map` and 3–8 suggested files; requires `Map validation: PASS` for MAP, every area and the row ↔ file match (at most two repairs, else the old files are restored) and drafts empty PROJECT sections, unconfirmed. `--refresh` edits only the index blocks and area files whose paths a diff since the MAP commit touches; authored area sections are kept. With `git.auto_commit` it asks once, then commits `docs(telos): map` with explicit paths |
| `/telos:plan [NN\|description]` | Plan the STATUS phase, phase `NN` or a new phase in one file (≤ 80 lines). At most one round of questions; `telos roadmap add` for a new phase, then `telos roadmap set NN active` and `telos status set`; places carry-over items. Commits `docs(NN): plan phase NN-name` only when `git.auto_commit` is true |
| `/telos:close [NN]` | Close an active phase: stops on `REFUSED:` or `Close: blocked` (unchecked tasks, unreadable HISTORY), runs every configured check (a failure leaves the phase active, nothing recorded), confirms the done-when, updates only the area notes the delta lists (decisions, rejected approaches, invariants, pitfalls, entry points; no diff retelling), fixes broken refs, places every unmapped path in an area, passes `telos area lint`, then runs the bundle's closing commands in order; a retry skips a recorded phase entry. Commits `docs(telos): close NN-name` only when `git.auto_commit` is true |

## CLI

Exit codes: `0` ok · `1` failure or `.telos/` missing · `2` usage error. The CLI never writes to git.

| Command | Purpose |
|---|---|
| `telos --help` / `--version` | List commands / print the version |
| `telos init [--stack a,b] [--checks '<json>'] [--force]` | Create the memory files, sync the CLAUDE.md block, add `.telos/.cache/` to `.gitignore`. Stack and checks default to detection (check keys: `build`, `types`, `lint`, `test`, `e2e`). Existing files are kept; `--force` rewrites `config.json` as version 2, keeping its values (a version 1 file loses `profile`, `docs`, `protected_configs`, `strict_scope` and the `format`/`test_related` checks) |
| `telos status` | Compact status: phase with its ROADMAP state, task with its checklist state (`open`/`done`), Next, Blockers, carry-over count, latest Recent line; Awaiting user first |
| `telos status set <key>=<value>…` | Set STATUS lines: `phase`, `task`, `next`, `blockers`, `awaiting`; empty value → `none` |
| `telos status add recent\|carry "<line>"` / `rm carry <n>` | Prepend to Recent (3 newest kept); append to Carry-over (max 5); remove item `n` |
| `telos roadmap add <name> "<goal>" "<done when>"` | Append a `[planned]` phase with the next free NN |
| `telos roadmap set <NN> <status>` | Set a phase's status: `planned`, `drafted`, `active`, `done`, `dropped` |
| `telos history add <kind> <ref> "<text>" [--path <p> \| --approach "<text>"]` | Prepend a dated Log entry (`decision`, `phase`, `revert`, `remove`, `quick`, `init`; refs `NN`, `NN-MM`, `quick`, `telos`). `remove` with a selector adds a Delete-zone entry; `revert` clears exactly that selector. Over `limits.history_entries` the oldest rows move to `HISTORY-archive.md` |
| `telos area new <name> --paths a,b` | Create `.telos/areas/<name>.md` from the template, anchored at HEAD (name: `a-z0-9-`, ≤ 30 chars; paths repo-relative, directories end in `/`); prints the `## Areas` row to add to MAP |
| `telos area list` / `show <name>` | One line per area: `name · paths · tokens/limit` / print one area file |
| `telos area for <path>…` | Names of the areas whose paths cover the given paths, or lie under a given directory (`src/a` never matches `src/ab/`); `none` when no area does |
| `telos area lint` | Check every area: header, the six sections in order, name and `limits.area_tokens`; no sub-directories in `.telos/areas/`; with a built MAP, `## Areas` rows and area files match one to one; one line per problem, exit 1 when any |
| `telos area anchor <name>…` / `--all` | Set the area header commit and date to HEAD, keeping every other byte; run after checking the note against its files. Refuses, writing nothing, when a covered path is uncommitted |
| `telos stale [--area <name>]… [--check]` | Without a model: one line per area whose header paths changed between its anchor commit and HEAD or are dirty (`<area>: stale · N files since <sha7> (a, b, +K more)`), whose anchor commit is gone (`unanchored`) or whose body has a backticked `path[:line]` to a missing file or past its end (`broken ref`); then `fresh: N areas` and changed files under no area (`unmapped: N files (top dirs)`). ≤ 6000 chars, omitted lines counted. Exit 0; `--check` exits 1 when anything is stale, broken or unanchored |
| `telos map-scan` | Deterministic repository inventory for `/telos:map` (≤ 2000 estimated tokens); works before init, never executes repository code |
| `telos ctx <bundle> [args]` | Print a skill's context (≤ 6000 chars, comments stripped): `status`, `map [--refresh]`, `plan [NN\|description] [--area <path>]…`, `close [NN]`, `catchup`, `shared <name>` |
| `telos budget [--ctx <bundle> [args]]` | Read-only size report: `.telos/` files, the CLAUDE.md block, the SessionStart output and optionally one bundle, in bytes, chars and ~tokens (chars / 4) |

`ctx plan` gives the target phase and its file (or the template skeleton), carry-over, PROJECT
Purpose and Rules, stack, checks, Delete-zone approaches, the MAP index and the roadmap. Each
`--area <path>` adds the area files covering that path, whole while the bundle stays under
6000 chars, else as `Read .telos/areas/<name>.md` pointers; the roadmap then keeps the rows that
still fit, nearest the target phase first.
`ctx close` gives the plan's checklist state, unchecked items, the check commands,
`Auto-commit` with the commit subject, `Stale areas: N` when any (never blocking), `Close: ready|blocked` and the exact
closing commands (`telos area anchor …` first when an area changed). Last comes the delta: per
area that needs review, the commits since its own anchor (≤ 10 subjects, newest first, quoted as
data), the changed files with kind and `+added -deleted`, broken refs, then changed files under no
area (`Unmapped`). Over 6000 chars, file rows shrink to kind counts first, then subjects go.
`ctx catchup` gives the same delta without phase bookkeeping, for work done without Telos: the
closing commands are `telos area anchor …` and, only when a decision was recorded, one
`telos history add quick quick "…"`; an empty delta prints `Nothing to catch up`.

## Hooks

Node scripts in `hooks/`, no model calls; each is silent when `.telos/` is missing.

| Event | Behavior |
|---|---|
| `SessionStart` (startup, resume, clear, compact) | Injects the compact status (≤ 1200 chars): Awaiting user first, PROJECT Purpose line 1, stack, phase/task with live states, Next, Blockers, carry-over count, latest Recent line, `Areas: N` when area files exist, `Stale areas: N (run telos stale)` when any area is stale, unanchored or has a broken ref (git only, no model), file pointers |
| `PreToolUse` Bash | Git guard: blocks `git push`, `--no-verify` (also `commit -n`), `git add -A` / `--all` / `.` / `:/`, `git commit --amend` on a pushed HEAD and `git reset --hard`, with exit 2 and the reason; it splits `&&`, `;`, `\|`, env prefixes, `git -C`/`-c` and `sh -c '…'` |
| `PreToolUse` Edit/Write | Delete-zone warning, never a block: editing a path listed in HISTORY §Delete-zone (or below it) adds its reason and the exact `telos history add revert …` command to restore it on request; once per path per session, symlinks resolved |

## Benchmark

Telos adds structure and project memory, and that costs tokens. We ran 120 sessions
of the shipped default workflows on two open-source repositories (lazygit and
anything-llm), against bare Claude Code and a static `CLAUDE.md`.

| | Telos | Without Telos |
|---|---|---|
| USD per accepted multi-session scenario | $1.24–$4.16 | $0.37–$0.81 |
| USD per accepted single task | $0.30–$0.49 | $0.11–$0.24 |
| Accepted runs | 29/30 deep, 28/30 standard | 29/30 `CLAUDE.md`, 28/30 bare |

- Telos cost more in every measured task and did not reduce exploration.
- Acceptance stayed about level.
- For small one-off tasks, plain Claude Code or a short `CLAUDE.md` is the better choice.
- Long-running projects, where project memory should matter most, were not measured.

The Telos author ran this benchmark on version 0.1 (the workflow plugin). It covers two
repositories, one Claude Code version and one model set, with five runs per case, so it does not
generalise beyond them. Version 0.2 has not been benchmarked.

## Limits

- Memory is written at two points (`/telos:plan`, `/telos:close`) and by hand; nothing checks
  yet that MAP or PROJECT still match the code.
- Work done without the skills is not caught up automatically; update STATUS and the phase
  checklist yourself.
- Claude Code only for now: the hooks and skills are plugin features. The files are plain
  markdown and the CLI runs anywhere Node does.
- Size targets: bundles ≤ 6000 chars, SessionStart ≤ 1200 chars, MAP ≤ `limits.map_tokens` and
  each area ≤ `limits.area_tokens` estimated tokens. `telos budget` measures sizes, not host token usage.

## Development

`npm test` runs the `node:test` suites. See [AGENTS.md](AGENTS.md) for the layout and rules.
