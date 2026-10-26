---
id: 04-06
title: Verification runner
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: true
effort: hard        # normal | hard
depends: [04-02]
decisions: []       # phase-local, e.g. [D-03]
scope: ["lib/check.mjs", "lib/cli.mjs", "test/check.test.mjs", "README.md"]
---
## Goal
Implement telos check with configured quick/full checks, bounded failure reports and safe file substitution.

## Read first
- SPEC.md §7
- lib/accept.mjs:46-62 (configured command execution)
- lib/config.mjs:8-25 (check keys/defaults)
- lib/cli.mjs:54-92 (dispatch and errors)

## Files
- lib/check.mjs (create)
- lib/cli.mjs (modify)
- test/check.test.mjs (create)
- README.md (modify)

## Constraints
- Run only configured commands; never guess tools or parse framework-specific success counts as universal facts.
- Assumed: quick runs related-test fallback plus configured lint/types; full runs build, types, lint, test in that order; deep extras wait for phase 05.
- Shell command templates are trusted repo config, but --files values must be individually shell-quoted; bounded time/output and no git writes.
- Missing checks print SKIP; no configured checks is explicitly unverified and exit 1. README includes check CLI row.

## Tests (write first)
- Full checks run in order and aggregate failures; quick uses test_related only with files, otherwise test.
- Missing checks are SKIP; no configured checks returns unverified exit 1; minimal returns exact profile requirement.
- Failing, timed-out, output-overflow, signalled or missing executable checks return exit 1 and at most 30 failure lines per check; timeout/overflow terminates the child.
- Spaces, quotes, shell metacharacters and leading dashes in files cannot execute commands or become unintended options.
- Unknown flags/level or empty --files returns usage exit 2; read-only check does not mutate Telos state or git.

## Interface
- telos check [--level quick|full] [--files <path>…]; default full; exit 0 verified, 1 failed/unverified, 2 usage.
- runChecks(root, {level, files, timeoutMs}) returns per-check verdicts for CLI and Stop reuse; timeout defaults to 600 seconds.
- Only {files} placeholders receive quoted paths; commands without placeholders run unchanged; reject unsafe outside-repo paths.

## Edge cases
- No checks → explicit unverified failure.
- Timeout/output overflow → bounded failed result; runner terminates child.
- Hostile file name → literal argument, never code.
- Related tests without files → ordinary test fallback.

## Steps
1. test/check.test.mjs: write stub-command order, failure and adversarial filename tests first.
2. lib/check.mjs: runChecks — implement selection, quoting, timeout and compact failure output.
3. lib/cli.mjs: register check with profile and usage validation.
4. README.md: document defaults, SKIP/unverified behavior and exits.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] Verification output is compact, failures are nonzero and malicious filenames cannot run shell code.

## Result
