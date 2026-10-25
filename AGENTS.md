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
| `.planning/` | Telos planning itself, in the `.telos/` format (moves to `.telos/` in phase 03) |

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

Work follows the plan in `.planning/`:

1. `.planning/STATUS.md` names the current phase and task; the task file is
   `.planning/phases/<NN-name>/<NN-MM>-<slug>.md`. Phase decisions (`D-NN`) are in
   that phase's `NN-CONTEXT.md`.
2. Stay inside the task's `scope`. Write the listed tests first, then implement.
3. Check every Acceptance item; tick the boxes that pass.
4. Fill `## Result` (3–5 lines: what was built, test count, surprises) and end it with
   `Deviations: none` or `Deviations: <path> — <why>` for every file outside scope.
5. Set the task `status: done`, update STATUS (Task, Next, Recent: newest first, max 3).
6. One commit per task: `<type>(<NN-MM>): <summary>` with 2–4 bullet lines in the body
   (`feat`, `fix`, `refactor`, `test`, `docs`, `build`). Planning-only commits use
   `docs(telos): …`.

## Git rules

- Stage explicit paths only: no `git add -A`, `git add .`.
- No `git push`, no `--no-verify`, no `git reset --hard`, no `--amend` of pushed commits.
- Do not commit failing work; after two failed fix attempts mark the task `blocked` in
  STATUS and stop.
