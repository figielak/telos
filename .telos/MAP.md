<!-- telos-map: commit a4ffa27fc6c67ae76feceaf8eba1375ba8753207 · 2026-11-16 · files 96 -->
# Map

## Structure
- `bin/` — CLI launcher; `lib/` — CLI modules; `lib/ctx/` — one context bundle per skill
- `skills/` — the four plugin skills (`status`, `map`, `plan`, `close`); `shared/` — long skill instructions
- `hooks/` — hook scripts + `hooks/hooks.json` (SessionStart, Bash git guard, Edit/Write Delete-zone warning)
- `templates/` — files `telos init` renders into `.telos/`, incl. `templates/phase.md`
- `test/` — test suites; `test/memory-repo.mjs` — temp-repo helper; `test/fixtures/` — sample repos
- `.claude-plugin/` — plugin and marketplace manifests; `plan/` — memory-core rebuild plan
- Docs: `README.md` (commands), `AGENTS.md` (agent guide), `CHANGELOG.md`

## Entry points
- `bin/telos:1-4` — calls `main()` from `lib/cli.mjs`
- `lib/cli.mjs:23-31` — command registry; `lib/cli.mjs:52-98` — `main()` dispatch and exit codes
- `hooks/hooks.json` — wires the three hooks to `hooks/*.mjs`
- Skills inject their bundle via `telos ctx`, e.g. `skills/plan/SKILL.md`

## Flows
- Skill context: `SKILL.md` → `telos ctx <name>` → `lib/ctx/index.mjs:61-75` → bundle from `lib/ctx/index.mjs:20-26` → `cap()` at `lib/ctx/index.mjs:29-32`
- Plan: `lib/ctx/plan.mjs:60` → `checklist`/`phaseSkeleton` in `lib/phases.mjs:68-90` → agent writes `.telos/phases/NN-name.md`
- Close: `lib/ctx/close.mjs:24` → unchecked items, checks, closing commands (`telos history`, `roadmap`, `status`)
- Session start: `hooks/session-start.mjs` → `sessionText` `lib/session.mjs:30` → `view` `lib/status.mjs:114`
- Bash guard: `hooks/git-guard.mjs` → `check()` in `lib/git-guard.mjs:139`
- Edit guard: `hooks/edit-guard.mjs` → `editTarget` `lib/edit-guard.mjs:50` → `deleteGuard` `lib/delete-guard.mjs:37`

## Areas
### CLI commands
- `lib/init.mjs:66` — `init`; `lib/status.mjs:146`, `lib/roadmap.mjs:87`, `lib/history.mjs:278`
- `lib/budget.mjs:97` — size report; `lib/detect.mjs:119` — stack/check detection; `lib/template.mjs`
- `lib/errors.mjs` — `UsageError`

### Context bundles
- `lib/ctx/index.mjs` — registry, `cap`, `stripComments`; `lib/ctx/stack.mjs:13` — stack line
- `lib/ctx/status.mjs`, `lib/ctx/plan.mjs`, `lib/ctx/close.mjs`, `lib/ctx/shared.mjs`

### Map
- `lib/map-scan.mjs:147-261` — repo scan; `lib/map.mjs:126` — header and validation (`inspectMap`)
- `lib/map-refresh.mjs:74` — incremental plan; `lib/map-budget.mjs` — token estimate; `lib/ctx/map.mjs:102`

### Memory and state
- `lib/phases.mjs` — phase files and checklists; `lib/frontmatter.mjs` — the only frontmatter parser
- `lib/config.mjs:84-108` — version 2 config, v1 `upgrade`; `lib/repo.mjs` — root finding
- `lib/history.mjs:186-249` — Log, Delete-zone, archive rotation; `lib/git.mjs` — read-only git queries

### Guards and hooks
- `lib/git-guard.mjs`, `lib/edit-guard.mjs`, `lib/delete-guard.mjs`, `lib/session.mjs`

## Find
- Add a CLI command → `lib/cli.mjs:23-31`; add a bundle → `lib/ctx/index.mjs:20-26`
- Hook wiring → `hooks/hooks.json`; manifest tests → `test/manifest.test.mjs`
- Skill text tests → `test/skills.test.mjs`; end-to-end → `test/e2e-core.test.mjs`, `test/e2e-map.test.mjs`
- Config keys and defaults → `lib/config.mjs:17-26`
- Phase file template → `templates/phase.md`; parser → `lib/phases.mjs:68`
