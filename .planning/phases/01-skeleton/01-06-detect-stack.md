---
id: 01-06
title: Stack and check command detection
type: code
status: draft
critical: false
effort: normal
depends: [01-02]
decisions: [D-07]
scope: [lib/detect.mjs, test/detect.test.mjs, test/fixtures/]
---
## Goal
`detect(root)` returns stack, package manager, check commands and the evidence
for each, so `init` never guesses and the user confirms facts, not inventions.

## Read first
- SPEC.md §4.5 (checks keys) and the sentence below it
- SPEC.md §1 (target stacks: Astro, TypeScript, Python)

## Files
- lib/detect.mjs (create)
- test/detect.test.mjs (create)
- test/fixtures/astro-ts/, python-uv/, node-plain/, empty/ (create, minimal manifests only)

## Constraints
- returns `{ name, stack[], packageManager, checks{}, evidence{} }`; `evidence[key]` is a short reason (`package.json scripts.lint`)
- JS: package manager from lockfile (pnpm, yarn, bun, npm); prefer `package.json` scripts over tool fallbacks; `test_related` only with vitest/jest evidence
- Astro: `astro` dependency or `astro.config.*`; types adds `astro check` only for Astro
- Python: `pyproject.toml` / `requirements.txt`; `uv.lock` → `uv run` prefix; ruff, pytest, mypy/pyright only with config or dependency evidence
- `name` from package.json / pyproject, else directory name
- read manifests only; never execute anything

## Tests (write first)
- astro-ts fixture → stack `[astro, typescript]`, pnpm commands from scripts, `test_related` for vitest
- python-uv fixture → stack `[python]`, `uv run pytest`, `uv run ruff check .`
- node-plain without scripts → no build/lint keys
- empty fixture → empty stack and checks, no throw

## Steps
1. Create fixtures, write tests, implement.

## Acceptance
- [ ] all listed tests pass
- [ ] `node --test test/detect.test.mjs` → exit 0

## Result
