---
id: 01-01
title: Plugin and marketplace scaffold
type: code
status: draft
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
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] `claude plugin validate .` → exit 0 (if the subcommand is unavailable, note it in Result)

## Result
