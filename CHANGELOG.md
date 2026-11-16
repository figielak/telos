# Changelog

## 0.2.0 — 2026-11-16

Telos is cut down to a memory core: the 0.1 benchmark showed the workflow ceremony cost 2–5× more
than bare Claude Code with level acceptance. The full 0.1 state is tagged `pre-memory-core`.

- Skills: `status`, `map`, `plan`, `close` only. Removed `init`, `discuss`, `approve`, `revise`,
  `do`, `quick`, `check`, `done`, `undo`, `lesson`, `profile`, `review`, `research`, `docs` and
  every `-lite`/`-hard` variant; the reviewer and researcher agents are gone.
- `/telos:plan` writes one file per phase, `.telos/phases/NN-name.md`, with a task checklist;
  no task files, lint or approve step. `/telos:close` replaces `/telos:done`: it lists unchecked
  tasks and the configured check commands, then the exact closing commands.
- CLI: removed `accept`, `check`, `lint-plan`, `task`, `profile`, `adr`, `changelog`,
  `docs-scan` and `ctx init`; `telos init` takes no profile.
- Config version 2 (`stack`, `checks`, `limits`, `git`, `files_language`); a version 1 file still
  loads and `telos init --force` rewrites it.
- Hooks: SessionStart, the Bash git guard and a Delete-zone warning on Edit/Write. Removed the
  protected-config and scope guards, edited-file checks at Stop, PreCompact session saves and
  context-usage hints.
- Removed `website/`, `SPEC.md` and LESSONS.md (its lesson moved to PROJECT.md §Conventions).
- README rewritten to one screen.

## 2026-11-03

- Added a landing page in `website/`, a standalone Astro and Tailwind package outside the plugin runtime.
- Page sections: hero with an illustrative terminal, Workflow, Core features, Project memory, Profiles, Getting Started and a final call to action.
- Added `website/DESIGN.md` with color tokens, typography, spacing and component rules.
- Copy buttons and the mobile menu use two small inline scripts; content and navigation work without JavaScript.
- Added site tests under `website/test/`, run with `npm --prefix website test`, including budgets and checks of page claims.
- Telos's own full check now uses the dot test reporter so its output stays under the 64 KiB limit.
