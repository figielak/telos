# Telos
<!-- Constitution, ≤ 60 lines. Project-specific facts only; Telos workflow rules
     live in CLAUDE.md. Headings are stable (tasks link to "PROJECT.md §Heading"). -->

## Purpose
<!-- line 1: one sentence ≤ 100 chars (shown at session start); line 2 optional -->
Claude Code plugin for cheap, phase-based project memory, backed by a deterministic Node CLI.
Skills inject one `telos ctx` bundle each; the CLI owns all state changes in `.telos/`.

## Rules
<!-- ≤ 10 lines, injected into every do/quick bundle.
     Hard project rules: dependencies, platform, a11y, performance, security. -->
- Node ≥ 20.10, ESM `.mjs`, no runtime or dev dependencies; tests use `node:test` only.
- Exit codes: 0 ok · 1 failure or `.telos/` missing · 2 usage error (`UsageError`).
- Parse task files only via `lib/tasks.mjs`, frontmatter only via `lib/frontmatter.mjs`.
- The CLI never writes to git; it only reads (status, log, diff, rev-parse).
- Context bundles ≤ 6000 chars (`cap()`); SessionStart output ≤ 1200 chars.
- Never put free user text (`$ARGUMENTS`) into a `` !`…` `` injection.
- Every new or changed CLI command or `/telos:*` skill gets its README.md row in the same task.

## Conventions
<!-- naming, layout, patterns; read via "PROJECT.md §Conventions";
     LESSONS that became standing rules land here -->
- none

## Out of scope
<!-- things this project deliberately does not do (never built ≠ Delete-zone) -->
- none
