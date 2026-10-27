---
id: 04-13
title: Standard lifecycle proof
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: true
effort: hard        # normal | hard
depends: [04-03, 04-04, 04-05, 04-07, 04-08, 04-10, 04-12]
decisions: []       # phase-local, e.g. [D-03]
scope: ["test/e2e-standard.test.mjs", "test/fixtures/standard-loop/package.json", "test/fixtures/standard-loop/README.md", "test/fixtures/standard-loop/src/index.mjs", "README.md"]
---
## Goal
Prove a standard phase completes and can be undone in an isolated repository, including profile gates, memory and hook behavior.

## Read first
- SPEC.md §14
- test/e2e-core-loop.test.mjs:1-43 (isolated fixture harness)
- test/e2e-core-loop.test.mjs:104-170 (plan/approve/do lifecycle)
- test/skills.test.mjs:24-38 (skill contract checks)

## Files
- test/e2e-standard.test.mjs (create)
- test/fixtures/standard-loop/package.json (create)
- test/fixtures/standard-loop/README.md (create)
- test/fixtures/standard-loop/src/index.mjs (create)
- README.md (modify)

## Constraints
- Reuse the established CLI-level harness: test plays skill commands; do not claim this proves live LLM/Claude interaction.
- Git mutations occur only in temporary fixtures playing skills; production CLI remains read-only with respect to git.
- No network, extra dependencies or deep-only agents/research/review/doc-sync.
- Test successful and failed close/undo paths without broad production fixes; report any failure in Result rather than expand scope.
- Update README availability and standard workflow examples, including limitations of automated proof.

## Tests (write first)
- Fresh minimal→standard→discuss context→plan→approve→two dependent tasks→check→done yields history and a closed phase.
- Proposed decision blocks approval/do; failed check and unresolved manual acceptance prevent phase close.
- Confirmed undo of latest task restores code, marks reverted and reopens phase while preserving earlier task/STATUS/history data.
- Undo of prerequisite previews transitive warning and blocks affected tasks only after successful revert; conflict records no successful undo state or history.
- Lessons/approaches reach correct bundles; edit protection, delete warning/revert and Stop/compact hooks work through subprocess payloads.
- Downgrade retains data, suppresses standard hooks and returns exact profile gates; all context/session outputs stay capped.

## Interface
- Use the public CLI and hook stdin/stdout protocols; no private task/frontmatter parser in tests.
- Fixture check commands are deterministic Node scripts; all git histories are local temporary repositories.
- Record machine workflow proof separately from any live-host smoke evidence in Result.

## Edge cases
- Close check fails → phase active and no successful close history.
- Undo conflicts → no successful undo state/history.
- Downgrade after history exists → data retained, standard behavior gated.
- Task revert includes .telos metadata → unrelated completed task stays intact.

## Steps
1. test/e2e-standard.test.mjs: write the listed public-interface scenarios first using isolated fixture repositories.
2. test/fixtures/standard-loop/: add minimal deterministic source/check inputs for the lifecycle.
3. test/e2e-standard.test.mjs: exercise hook processes and failure paths without invoking network or LLMs.
4. README.md: document delivered standard flow and distinguish CLI proof from live-host validation.
5. Run npm test and claude plugin validate .; record verdicts and any remaining integration limits.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] A standard phase including confirmed undo is proven in temporary git repositories.
- [x] `claude plugin validate .` → exit 0

## Result
- Added 9 isolated standard lifecycle scenarios and deterministic fixtures covering close/undo gates, memory, hook subprocesses, profile downgrade and output caps; README documents availability and workflow.
- Verification: 9/9 new scenarios, npm test 429/429, telos accept 04-13 PASS (scope ok), claude plugin validate . exit 0 (root CLAUDE.md and missing-icon warnings).
- Conflict proof preserves committed state and successful history; Git can leave inverse metadata and conflict markers in the working tree until manual recovery.
- Machine workflow proof only: the harness supplies confirmation/manual-review outcomes; no live Claude Code host smoke evidence was collected.
Deviations: none
