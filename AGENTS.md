# AGENTS.md

Guide for coding agents working on this repository. Telos is project memory for coding
agents: a few markdown files in `.telos/`, a deterministic Node CLI (`telos`) and a small
Claude Code plugin (five skills, three hooks). User-facing commands are in
[README.md](README.md); the plan for the current rebuild is in [plan/](plan/README.md).

## Layout

| Path | What lives there |
|---|---|
| `bin/telos` | CLI entry point (on the Bash PATH when the plugin is installed) |
| `lib/` | CLI modules; `lib/cli.mjs` dispatches commands, `lib/ctx/` builds skill context bundles |
| `skills/<name>/SKILL.md` | Plugin skills: `status`, `map`, `plan`, `close` |
| `shared/<name>.md` | Long skill instructions, injected with `telos ctx shared <name>` |
| `hooks/` | SessionStart status, Bash git guard, Edit/Write Delete-zone warning |
| `templates/` | Files `telos init` renders into a target repo's `.telos/` |
| `test/` | `node:test` suites (`*.test.mjs`), `test/memory-repo.mjs` helper, `test/fixtures/` |
| `.claude-plugin/` | Plugin and marketplace manifests |
| `.telos/` | Telos's own memory; phases 01–09 are archived directories of the old format |

## Commands

- Tests: `npm test` (must pass before every commit).
- Plugin manifest check: `claude plugin validate .`
- Run the CLI from the repo: `bin/telos <command>`; `bin/telos --help` lists commands.

## Code conventions

- Node ≥ 20.10, ESM (`.mjs`), **no dependencies**, tests with `node:test` only.
- Exit codes: `0` ok · `1` failure or `.telos/` missing · `2` usage error
  (`UsageError` in `lib/errors.mjs` → 2).
- Phase plans are read only through `lib/phases.mjs`; frontmatter only through
  `lib/frontmatter.mjs`. Do not add ad-hoc parsers.
- The CLI never writes to git; it only reads (`status`, `log`, `diff`, `rev-parse`).
- Context bundles stay ≤ 6000 chars (`cap()`); SessionStart output ≤ 1200 chars.
- Match the surrounding code: short JSDoc on exports, small pure functions, no comments
  that restate the code.

## Skills

- Every skill is user-invoked only (`disable-model-invocation: true`) and gets its context
  from one injection, `` !`telos ctx <bundle>` ``; it never reads the whole repo.
- Never put free user text into a `` !`…` `` injection: `$ARGUMENTS` is pasted unquoted into
  the shell. Show it in a body section (`## Request`) instead.
- State changes go through the CLI (`telos roadmap set`, `telos status set`,
  `telos history add`), never by editing ROADMAP, STATUS or HISTORY by hand.
- Every new or changed CLI command or skill gets its README.md row in the same task.

## Working on a task

The memory-core rebuild runs as ordinary work from `plan/NN-name.md` (see `plan/README.md`):

1. `bin/telos status` names the current phase and next step.
2. Read only the files the task names; locate code via `.telos/MAP.md`.
3. Never recreate a path or approach listed in `.telos/HISTORY.md` §Delete-zone.
4. One commit per task: `<type>(<NN-MM>): <summary>` (`feat`, `fix`, `refactor`, `test`,
   `docs`, `build`), ticking the task's box in its plan in the same commit.

## Git rules

- Stage explicit paths only: no `git add -A`, `git add .`.
- No `git push`, no `--no-verify`, no `git reset --hard`, no `--amend` of pushed commits.
- Do not commit failing work.
