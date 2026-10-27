<!-- telos-map: commit b30d110b30b96827623f72e7275331372fb4728b · 2026-10-27 · files 148 -->
# Map

## Structure
- `bin/` — CLI launcher; `lib/` — CLI modules; `lib/ctx/` — one context bundle per skill
- `skills/` — plugin skills (`skills/<name>/SKILL.md`); `shared/` — bodies shared by `-lite`/`-hard` variants
- `hooks/` — Claude Code hook scripts + `hooks/hooks.json`
- `templates/` — files `telos init` renders into `.telos/`
- `test/` — test suites; `test/fixtures/` — sample repos
- `.claude-plugin/` — plugin and marketplace manifests
- Docs: `SPEC.md` (design), `README.md` (commands), `AGENTS.md` (agent guide)

## Entry points
- `bin/telos:1-4` — calls `main()` from `lib/cli.mjs`
- `lib/cli.mjs:27-39` — command registry; `lib/cli.mjs:60-106` — `main()` dispatch and exit codes
- `hooks/hooks.json` — wires SessionStart, PreToolUse (Bash, Edit/Write), PostToolUse, Stop, PreCompact
- Skills inject their bundle via telos ctx, e.g. `skills/map/SKILL.md`

## Flows
- Skill context: `SKILL.md` → `telos ctx <name>` → `lib/ctx/index.mjs:80-93` → bundle in `lib/ctx/index.mjs:29-44` → `cap()` at `lib/ctx/index.mjs:47-50`
- Edit guard: `hooks/edit-guard.mjs` → `lib/edit-guard.mjs:94` (config/scope) + `lib/delete-guard.mjs` + `usageHint` in `lib/compaction.mjs:145`
- Bash guard: `hooks/git-guard.mjs` → `check()` in `lib/git-guard.mjs:139`
- Edited files: `hooks/edited.mjs` → `recordEdit` `lib/edited.mjs:36`; `hooks/stop.mjs` → `stopChecks` `lib/edited.mjs:98`
- Compaction: `hooks/pre-compact.mjs` → `saveSession` `lib/compaction.mjs:56`; `hooks/session-start.mjs` → `sessionText` `lib/session.mjs:34`

## Areas
### CLI commands
- `lib/init.mjs`, `lib/status.mjs`, `lib/roadmap.mjs`, `lib/tasks.mjs`, `lib/history.mjs`, `lib/profile.mjs`
- `lib/check.mjs`, `lib/accept.mjs`, `lib/lint-plan.mjs`, `lib/map-scan.mjs`
- `lib/errors.mjs` — `UsageError`

### Context bundles
- `lib/ctx/index.mjs` — registry, `cap`, `stripComments`
- `lib/ctx/plan.mjs`, `lib/ctx/do.mjs:175-224`, `lib/ctx/quick.mjs`, `lib/ctx/undo.mjs`, `lib/ctx/approve.mjs`
- `lib/ctx/map.mjs:99-172` — map bundle; `lib/ctx/stack.mjs` — stack line

### Map
- `lib/map-scan.mjs:147-261` — repo scan; `lib/map.mjs` — header and validation (`inspectMap`)
- `lib/map-refresh.mjs:74` — incremental plan; `lib/map-budget.mjs` — token estimate

### Parsing and state
- `lib/frontmatter.mjs`, `lib/tasks.mjs` — the only task/frontmatter parsers
- `lib/config.mjs` — profiles and `config.json`; `lib/repo.mjs` — root finding
- `lib/git.mjs` — read-only git queries

### Guards and hooks
- `lib/edit-guard.mjs`, `lib/delete-guard.mjs`, `lib/git-guard.mjs`, `lib/scope.mjs`
- `lib/edited.mjs`, `lib/compaction.mjs`, `lib/session.mjs`, `lib/lessons.mjs`

### Skills and templates
- `skills/`, `shared/`, `templates/`, `.claude-plugin/plugin.json`

## Find
- Add a CLI command → `lib/cli.mjs:27-39`; add a bundle → `lib/ctx/index.mjs:29-44`
- Hook wiring → `hooks/hooks.json`; manifest tests → `test/manifest.test.mjs`
- Skill text tests → `test/skills.test.mjs`; end-to-end → `test/e2e-standard.test.mjs`
- Profile defaults → `lib/config.mjs:17`
