---
id: 01-09
title: /telos:init skill and end-to-end check
type: code
status: done
critical: false
effort: normal
depends: [01-08]
decisions: [D-05]
scope: [skills/init/, test/skills.test.mjs, README.md]
---
## Goal
The `/telos:init [profile]` skill: inject `ctx init`, confirm detected checks with
the user in one batch, run `telos init`, report briefly. Verified in a test repo.

## Read first
- SPEC.md §13 skill pattern, §5 command table (init row), §5.2 question rules
- https://code.claude.com/docs/en/skills (frontmatter, `!` injection, allowed-tools)

## Files
- skills/init/SKILL.md (create)
- test/skills.test.mjs (create)
- README.md (modify: Commands section with `/telos:init [profile]`)

## Constraints
- frontmatter: `name: init`, `argument-hint: "[minimal|standard|deep]"`, `disable-model-invocation: true`, `model: sonnet`, `allowed-tools: Bash(telos *)`
- if profile missing ask it together with the check confirmation: one `AskUserQuestion` batch, ≤ 4 questions, recommended first
- final chat summary ≤ 10 lines, last line = STATUS `Next:`; no commit (prints the suggested one)
- body ≤ 60 lines

## Tests (write first)
- every `skills/*/SKILL.md` has `disable-model-invocation: true` and `name` equal to its directory (read with a regex, not the task-frontmatter parser: SKILL.md values exceed the D-03 subset)
- init SKILL.md injects `telos ctx init`

## Steps
1. Write tests and SKILL.md.
2. Manual e2e: copy test/fixtures/astro-ts into a temp git repo, run `claude --plugin-dir <telos repo>`, call `/telos:init standard`, confirm checks.
3. Record observations (tokens via `/context`, PATH behavior) in Result.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] in the test repo `/telos:init standard` creates `.telos/` with the standard file set and a valid config
- [x] a second `/telos:init` reports all files as kept

## Result
- skills/init/SKILL.md (29 lines, ~2 KB) + test/skills.test.mjs (4 tests, frontmatter read by regex); suite 69/69; `claude plugin validate .` passes.
- E2E headless (`claude -p "/telos:init standard" --plugin-dir`, Claude Code 2.1.309) on astro-ts: files created, rerun kept everything; `$ARGUMENTS` expands inside !`…`; bare `telos` works from bin/ PATH.
- E2E found a gap: `/telos:init` with no profile on an initialized repo guessed the profile → ctx init now shows `initialized, profile <p>` and the skill reuses it (re-verified on a minimal python-uv repo).
- Interactive run verified by the user (2026-10-24): `/telos:init` without a profile asked profile + checks in one round and created `.telos/`. Token count via /context not measured (→ 06-measure).
Deviations: lib/ctx/init.mjs, test/ctx.test.mjs — current profile added to the init bundle (gap found by E2E).
