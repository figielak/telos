# AGENTS.md

Guide for coding agents working on this repository. Telos is a Claude Code plugin
(skills + hooks) backed by a deterministic Node CLI, `telos`. The design is in
[SPEC.md](SPEC.md); user-facing commands are in [README.md](README.md).

## Layout

| Path | What lives there |
|---|---|
| `bin/telos` | CLI entry point (on the Bash PATH when the plugin is installed) |
| `lib/` | CLI modules; `lib/cli.mjs` dispatches commands, `lib/ctx/` builds skill context bundles |
| `skills/<name>/SKILL.md` | Plugin skills (`/telos:<name>`) |
| `shared/<name>.md` | Instructions shared by a skill and its `-lite`/`-hard` variant |
| `templates/` | Files `telos init` renders into a target repo's `.telos/` |
| `test/` | `node:test` suites (`*.test.mjs`) and `test/fixtures/` |
| `.claude-plugin/` | Plugin and marketplace manifests |
| `.telos/` | Telos planning itself (minimal profile): PROJECT, MAP, ROADMAP, STATUS, phases |

## Commands

- Tests: `npm test` (must pass before every commit).
- Plugin manifest check: `claude plugin validate .`
- Run the CLI from the repo: `bin/telos <command>`; `bin/telos --help` lists commands.

## Code conventions

- Node ≥ 20.10, ESM (`.mjs`), **no dependencies**, tests with `node:test` only.
- Exit codes: `0` ok · `1` failure or `.telos/` missing · `2` usage error
  (`UsageError` in `lib/errors.mjs` → 2; module errors such as `TaskError` → 1).
- Task files are parsed only through `lib/tasks.mjs`; frontmatter only through
  `lib/frontmatter.mjs` (supported subset). Do not add ad-hoc parsers.
- The CLI never writes to git; it only reads (`status`, `log`, `diff`, `rev-parse`).
  Commits and tags are made by skills.
- Context bundles stay ≤ 6000 chars (`cap()`); SessionStart output ≤ 1200 chars.
- Match the surrounding code: short JSDoc on exports, small pure functions, no comments
  that restate the code.

## Skills

- Every skill is user-invoked only (`disable-model-invocation: true`) and gets its context
  from one injection, `` !`telos ctx <bundle>` ``; it never reads the whole repo or `.telos/` by hand.
- Variant skills share their base skill's body via `` !`telos ctx shared <name>` ``
  (plugins cannot `cat` their own files) and differ only in `model`.
- Never put free user text into a `` !`…` `` injection: `$ARGUMENTS` is pasted unquoted into
  the shell. Show it in a body section (`## Request`, `## Change`) instead; only `init`
  (profile) and `do` (task id) pass `$ARGUMENTS` to `telos ctx`.
- State changes go through the CLI (`telos task set`, `telos roadmap set`, `telos status set`),
  never by editing frontmatter, ROADMAP or STATUS by hand.

## Documentation

Every new or changed CLI command or `/telos:*` skill gets its row in README.md
(CLI or Commands table) in the same task.

## Working on a task

Telos is developed with Telos (minimal profile, SPEC §14). Work goes through the skills
and the CLI, not by hand:

1. `bin/telos status` names the current phase, task and next step. Task files live in
   `.telos/phases/<NN-name>/<NN-MM>-<slug>.md`; phase decisions (`D-NN`) stay in the
   hand-maintained `NN-CONTEXT.md` of that phase and reach `/telos:do` via `telos ctx do`.
2. `/telos:plan` drafts a phase, `/telos:approve` approves its tasks, `/telos:do <id>`
   (or `/telos:do-hard <id>` for `effort: hard`) runs one task; `/telos:quick` for
   small changes outside a phase.
3. Inside a task: stay in its `scope`, write the listed tests first, check every
   Acceptance item (`bin/telos accept <id>`), fill `## Result` ending with
   `Deviations: none` or `Deviations: <path> — <why>`.
4. State changes only through the CLI: `telos task set <id> status=…`,
   `telos status set phase=… task=… next=…`, `telos status add recent "…"`,
   `telos roadmap set <NN> <status>`. Never edit task frontmatter, ROADMAP or STATUS by hand.
5. One commit per task: `<type>(<NN-MM>): <summary>` with 2–4 bullet lines in the body
   (`feat`, `fix`, `refactor`, `test`, `docs`, `build`). Planning-only commits use
   `docs(telos): …`.

## Git rules

- Stage explicit paths only: no `git add -A`, `git add .`.
- No `git push`, no `--no-verify`, no `git reset --hard`, no `--amend` of pushed commits.
- Do not commit failing work; after two failed fix attempts run
  `telos task set <id> status=blocked` and `telos status set blockers="NN-MM: reason"`, then stop.
