---
id: 09-04
title: Document the CLI with practical examples and boundaries
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [09-03]    # task IDs, e.g. [01-01]
decisions: [D-01, D-02, D-03] # phase-local, e.g. [D-03]
scope: [website/src/data/docs/cli.mjs, website/src/data/docs/commands.mjs, website/test/docs-cli.test.mjs] # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Add a separate terminal reference covering every public CLI command, with practical examples and a clear distinction from Claude Code skills.

## Read first
- README.md §CLI
- lib/cli.mjs:30-59 (public command registry and help)
- lib/cli.mjs:62-102 (exit codes, global flags and initialization)
- website/test/helpers.mjs:1-23 (built artifact helpers)

## Files
- website/src/data/docs/cli.mjs (create)
- website/src/data/docs/commands.mjs (modify)
- website/test/docs-cli.test.mjs (create)

## Constraints
- D-03: cover all commands in the CLI registry plus help/version; cover documented actions/options and ctx bundles in anchored subsections of their parent entry, avoiding dozens of duplicate pages.
- D-01/D-02: English static entries with syntax, prerequisites/profile, effects, concrete examples/outcomes, use/avoid guidance, alternatives and repository sources.
- Every documented subcommand and ctx bundle must have an example and applicability guidance; shared parent rules may be referenced rather than repeated.
- Distinguish Bash telos commands from /telos:* prompts, read-only reports from state mutation, and exit codes from semantic REFUSED/UNVERIFIED outcomes (ctx can refuse with exit 0).
- Explain that accept runs machine-checkable items, not manual proof; state setters do not replace skill checks, confirmations or git commits. Budget is an estimate, not measured savings.
- Verify against README and targeted CLI help/implementation; test only help or imports for inventory, never execute mutation examples in the development repo.

## Tests (write first)
- CLI guide inventory equals exported CLI commands plus help/version, with no missing or invented command pages.
- Documented README CLI action/bundle signatures map to guide entries or anchored subsections; aliases may share one example.
- Every entry/subsection example has an outcome and profile/state context; links, stable CLI-prefixed slugs and anchors resolve.
- CLI and skill names remain distinct; rendered guidance covers semantic refusal, manual acceptance and mutating setters.
## Interface
   contracts introduced or changed, ≤ 15 lines
## Edge cases
   "- input → expected outcome"
-->

## Steps
- Write registry and README-signature coverage tests that report missing entries rather than relying on a duplicated command-count constant.
- Read targeted help/source ranges and author the CLI records, with subcommand and ctx-bundle sections.
- Register CLI entries separately from skills and link relevant skill alternatives.
- Review syntax, quoting, effects and expected outputs without running the mutations; run checks.

## Acceptance
- [x] all listed tests pass
- [x] `npm --prefix website test` → exit 0
- [x] `node --test --test-reporter=dot test/*.test.mjs` → exit 0
- [x] Every public CLI command and documented action/context bundle has explanatory coverage and an example.
- [x] A reader can identify where to enter each command and whether it runs checks or changes project state.

## Result

Added cli.mjs with 17 records (15 registry commands plus help and version) and 30 anchored subsections for actions and ctx bundles; registered them in commands.mjs.
docs-cli.test.mjs (10 tests) compares the guide with the exported registry and with the README CLI table signatures, and checks examples, outcomes, anchors and the stated boundaries (ctx REFUSED with exit 0, MANUAL accept, setters, budget estimate).
Test RED first: guide commands missing from the registry comparison. Website suite 143 pass; root suite exit 0. No README row needed: no new command. No example was executed.
Deviations: bench/results/RUNLOG.md — untracked before this task, not changed or committed by it; flagged by the scope check only
