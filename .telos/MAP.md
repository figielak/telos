<!-- telos-map: commit ba2f4cc8574e9355ad6d67661bb04d3f511a9298 · 2026-10-29 · files 181 -->
# Map

## Structure
- `bin/` — CLI launcher; `lib/` — CLI modules; `lib/ctx/` — one context bundle per skill
- `skills/` — plugin skills (`skills/<name>/SKILL.md`); `shared/` — bodies shared by `-lite`/`-hard` variants
- `agents/` — deep researcher/reviewer agent definitions
- `hooks/` — Claude Code hook scripts + `hooks/hooks.json`
- `templates/` — files `telos init` renders into `.telos/`
- `test/` — test suites; `test/fixtures/` — sample repos
- `.claude-plugin/` — plugin and marketplace manifests
- Docs: `SPEC.md` (design), `README.md` (commands), `AGENTS.md` (agent guide)

## Entry points
- `bin/telos:1-4` — calls `main()` from `lib/cli.mjs`
- `lib/cli.mjs:30-45` — command registry; `lib/cli.mjs:66-112` — `main()` dispatch and exit codes
- `hooks/hooks.json` — wires SessionStart, PreToolUse (Bash, Edit/Write), PostToolUse, Stop, PreCompact
- Skills inject their bundle via telos ctx, e.g. `skills/map/SKILL.md`

## Flows
- Skill context: `SKILL.md` → `telos ctx <name>` → `lib/ctx/index.mjs:86-99` → bundle in `lib/ctx/index.mjs:32-50` → `cap()` at `lib/ctx/index.mjs:53-56`
- Edit guard: `hooks/edit-guard.mjs` → `lib/edit-guard.mjs:94` (config/scope) + `lib/delete-guard.mjs` + `usageHint` in `lib/compaction.mjs:145`
- Bash guard: `hooks/git-guard.mjs` → `check()` in `lib/git-guard.mjs:139`
- Edited files: `hooks/edited.mjs` → `recordEdit` `lib/edited.mjs:36`; `hooks/stop.mjs` → `stopChecks` `lib/edited.mjs:98` + `mapStaleness` `lib/map-stale.mjs:60`
- Compaction: `hooks/pre-compact.mjs` → `saveSession` `lib/compaction.mjs:56`; `hooks/session-start.mjs` → `sessionText` `lib/session.mjs:34`
- Deep review: `skills/review/SKILL.md` → `lib/ctx/review.mjs:59` → `reviewEvidence` `lib/review.mjs:66` → `agents/reviewer.md`

## Areas
### CLI commands
- `lib/init.mjs`, `lib/status.mjs`, `lib/roadmap.mjs`, `lib/tasks.mjs`, `lib/history.mjs`, `lib/profile.mjs`
- `lib/check.mjs`, `lib/accept.mjs`, `lib/lint-plan.mjs`, `lib/detect.mjs`, `lib/template.mjs`
- `lib/errors.mjs` — `UsageError`

### Context bundles
- `lib/ctx/index.mjs` — registry, `cap`, `stripComments`
- `lib/ctx/plan.mjs`, `lib/ctx/do.mjs:195-247`, `lib/ctx/quick.mjs`, `lib/ctx/undo.mjs`, `lib/ctx/approve.mjs`
- `lib/ctx/check.mjs`, `lib/ctx/done.mjs`, `lib/ctx/discuss.mjs`, `lib/ctx/stack.mjs` — stack line

### Map
- `lib/map-scan.mjs:147-261` — repo scan; `lib/map.mjs` — header and validation (`inspectMap`)
- `lib/map-refresh.mjs:74` — incremental plan; `lib/map-budget.mjs` — token estimate
- `lib/map-stale.mjs` — stale-map reminder; `lib/ctx/map.mjs:102-177` — map bundle

### Deep workflow
- `agents/` — researcher and reviewer agents; `shared/research.md`, `shared/review.md`
- `lib/review.mjs`, `lib/ctx/review.mjs`, `lib/ctx/research.mjs`
- `lib/adr.mjs` — ADRs; `lib/docs-scan.mjs`, `lib/ctx/docs.mjs`; `lib/changelog.mjs`

### Parsing and state
- `lib/frontmatter.mjs`, `lib/tasks.mjs` — the only task/frontmatter parsers
- `lib/config.mjs` — profiles and `config.json`; `lib/repo.mjs` — root finding
- `lib/git.mjs` — read-only git queries

### Guards and hooks
- `lib/edit-guard.mjs`, `lib/delete-guard.mjs`, `lib/git-guard.mjs`, `lib/scope.mjs`
- `lib/edited.mjs`, `lib/compaction.mjs`, `lib/session.mjs`, `lib/lessons.mjs`

### Skills and templates
- `skills/`, `templates/`, `.claude-plugin/plugin.json`

## Find
- Add a CLI command → `lib/cli.mjs:30-45`; add a bundle → `lib/ctx/index.mjs:32-50`
- Hook wiring → `hooks/hooks.json`; manifest tests → `test/manifest.test.mjs`
- Skill text tests → `test/skills.test.mjs`; agent tests → `test/agents.test.mjs`
- End-to-end → `test/e2e-standard.test.mjs`, `test/e2e-deep.test.mjs`
- Profile defaults → `lib/config.mjs:17`
