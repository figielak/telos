---
id: 01-09
title: /telos:init skill and end-to-end check
type: code
status: draft
critical: false
effort: normal
depends: [01-08]
decisions: [D-05]
scope: [skills/init/, test/skills.test.mjs]
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
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] in the test repo `/telos:init standard` creates `.telos/` with the standard file set and a valid config
- [ ] a second `/telos:init` reports all files as kept

## Result
