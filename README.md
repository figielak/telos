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
| `telos task new <NN> <slug> "<title>"` | Create the next task file `NN-MM-slug.md` (status `draft`) from the template; the phase dir is named after its ROADMAP line |
| `telos task set <id>… status=<s>` | Set the status of one or more tasks in place (comments kept); all ids are checked before any write |
| `telos task rm <id>` | Delete a `draft` task file; other statuses exit 1 |
| `telos ctx <bundle> [args]` | Print a skill's context bundle (≤ 6000 chars, comments stripped); unknown bundle → one line, exit 0 |
| `telos ctx init [profile]` | Bundle for `/telos:init`: profile, repo and Telos state, CLAUDE.md block state, detected stack/checks with evidence |
| `telos ctx status` | Bundle for `/telos:status`: status view, stack line, file pointers |
