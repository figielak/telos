---
id: 01-01
title: Plugin and marketplace scaffold
type: code
status: done
critical: false
effort: normal
depends: []
decisions: [D-01, D-02]
scope: [.claude-plugin/, package.json, .gitignore, README.md, test/manifest.test.mjs]
---
## Goal
Make the repo a loadable Claude Code plugin that is also its own marketplace,
packaged as a zero-dependency Node project with a working `npm test`.

## Read first
- SPEC.md §13 (layout, skill pattern, installation)
- https://code.claude.com/docs/en/plugins-reference (plugin.json fields, `bin/` on PATH, marketplace.json schema)

## Files
- .claude-plugin/plugin.json (create)
- .claude-plugin/marketplace.json (create)
- package.json (create)
- .gitignore (create)
- README.md (create, ≤ 15-line stub: what, install, status "pre-alpha")
- test/manifest.test.mjs (create)

## Constraints
- no `dependencies` / `devDependencies`; `"type": "module"`, `"engines": {"node": ">=20"}`
- version `0.1.0` in plugin.json and package.json
- marketplace owner `OWNER` placeholder (open question in CONTEXT)
- record in Result whether `bin/` is on the Bash PATH per the docs

## Tests (write first)
- plugin.json parses, `name` is `telos`, version equals package.json version
- marketplace.json lists plugin `telos` with source `./`
- package.json declares no dependencies of any kind

## Steps
1. Check the plugins reference for current manifest fields and `bin/` behavior.
2. Write the manifests, package.json (`"test": "node --test test/"`), .gitignore (`node_modules/`, `.telos/.cache/`).
3. Write the tests, run them.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] `claude plugin validate .` → exit 0 (if the subcommand is unavailable, note it in Result)

## Result
- Manifests, package.json (no deps, Node ≥ 20), .gitignore, README stub; 3 manifest tests pass; `claude plugin validate .` passes (v2.1.309; only a directory-listing ICON_MISSING warning).
- Docs confirm `bin/` is on the Bash tool PATH while the plugin is enabled → skills can call bare `telos`.
- `${CLAUDE_PLUGIN_ROOT}` is NOT in the Bash env; it is substituted only in skill/agent bodies and hook commands.
- Deviation: `npm test` is `node --test test/*.test.mjs` (`node --test test/` treats the dir as a file); 01-CONTEXT D-02 updated.
- No GitHub owner needed yet: `repository` omitted, marketplace `owner.name` = figielak; README uses `figielak/telos`.
