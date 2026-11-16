<!-- telos-map: commit 5afe8f252ac208b25bfeddf191ef5476312c1e49 · 2026-11-16 · files 101 -->
# Map

## Structure
- `bin/`, `lib/` — CLI; `lib/ctx/` — bundles
- `skills/`, `shared/` — skills and their instructions
- `hooks/` — hook scripts and `hooks/hooks.json`
- `templates/` — rendered by `telos init`
- `test/` — suites; `test/fixtures/` — sample repos
- `.claude-plugin/` — manifests; `plan/` — phases 10–16
- `README.md`, `AGENTS.md`, `CHANGELOG.md` — docs

## Areas
- cli — dispatch, exit codes, init, budget, templates, install · `lib/cli.mjs`, `templates/`, `package.json`
- bundles — `telos ctx` steps, the git delta and the skills · `lib/ctx/`, `lib/delta.mjs`, `skills/`, `shared/`
- map — MAP index, scan, refresh, area files, staleness · `lib/map.mjs`, `lib/areas.mjs`
- hooks-guards — SessionStart, git guard, Delete-zone warning · `hooks/`, `lib/session.mjs`
- state — STATUS, ROADMAP, HISTORY, phases, config · `lib/status.mjs`, `lib/history.mjs`

## Find
- Add a CLI command → cli; add a bundle → bundles
- Config keys and defaults → `lib/config.mjs:19-26`
- Phase file template → `templates/phase.md`; parser → state
- Tests: skills → `test/skills.test.mjs`; e2e → `test/e2e-core.test.mjs`
