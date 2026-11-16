# Telos
<!-- Constitution, ≤ 60 lines. Project-specific facts only; Telos workflow rules
     live in CLAUDE.md. Headings are stable (tasks link to "PROJECT.md §Heading"). -->

## Purpose
<!-- line 1: one sentence ≤ 100 chars (shown at session start); line 2 optional -->
Project memory for coding agents, backed by a deterministic CLI.
Markdown files in `.telos/`; the CLI owns state changes; four skills and three hooks for Claude Code.

## Rules
<!-- ≤ 10 lines, injected into every plan bundle.
     Hard project rules: dependencies, platform, a11y, performance, security. -->
- Node ≥ 20.10, ESM `.mjs`, no runtime or dev dependencies; tests use `node:test` only.
- Exit codes: 0 ok · 1 failure or `.telos/` missing · 2 usage error (`UsageError`).
- Read phase plans only via `lib/phases.mjs`, frontmatter only via `lib/frontmatter.mjs`.
- The CLI never writes to git; it only reads (status, log, diff, rev-parse).
- Context bundles ≤ 6000 chars (`cap()`); SessionStart output ≤ 1200 chars.
- Never put free user text (`$ARGUMENTS`) into a `` !`…` `` injection.
- Every new or changed CLI command or `/telos:*` skill gets its README.md row in the same task.

## Conventions
<!-- naming, layout, patterns and lessons that became standing rules;
     read via "PROJECT.md §Conventions" -->
- Commands register one line in `commands` (`lib/cli.mjs`); bundles one line in `bundles` (`lib/ctx/index.mjs`).
- Short JSDoc on exports, small pure functions, no comments that restate the code.
- Skills are user-invoked only (`disable-model-invocation: true`) and get context from one `telos ctx <bundle>` injection.
- Long skill instructions live in `shared/<name>.md`, injected with `telos ctx shared <name>`.
- State changes go through the CLI (`telos roadmap set`, `telos status set`, `telos history add`), never by hand.
- Run on real repos before trimming prompts: they expose permission and syntax defects that fixtures hide.

## Out of scope
<!-- things this project deliberately does not do (never built ≠ Delete-zone) -->
- Fully autonomous multi-phase execution.
- Multi-agent orchestration, parallel waves, multi-model workflows.
- Continuous learning / instinct systems, LLM-generated session summaries in hooks.
- Stack notes beyond Astro, TypeScript and Python.
- Workflow gates, profiles, model variants, review/research agents.
