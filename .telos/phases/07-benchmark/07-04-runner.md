---
id: 07-04
title: Disposable copies, setup snapshots and sandbox
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: true
effort: hard        # normal | hard
depends: [07-03]    # task IDs, e.g. [01-01]
decisions: [D-01, D-02, D-05, D-08, D-10]
scope: ["bench/lib/workspace.mjs", "bench/lib/sandbox.mjs", "bench/README.md", "test/bench-workspace.test.mjs", "test/fixtures/bench/"]
---
## Goal
Prepare everything a session may see, and nothing more: a disposable copy at the task's start commit with no later history, the variant's instructions (B file, or a C/D setup snapshot keyed by `(repo, start, profile)`), an exported plugin runtime, a fresh per-run config dir, and the sandbox launch spec. Critical because it guards against solution leaks and touches real repositories.

## Read first
- bench/PROTOCOL.md (isolation checklist, canaries, setup keying)
- bench/lib/matrix.mjs (cell and setup-key shape from 07-03)
- lib/git.mjs:1-12 (execFileSync style, no shell)

## Files
- bench/lib/workspace.mjs (create)
- bench/lib/sandbox.mjs (create)
- bench/README.md (modify)
- test/bench-workspace.test.mjs (create)
- test/fixtures/bench/ (modify)

## Constraints
- D-05 [proposed]: a C/D snapshot is built at exactly the cell's start commit and stored under its key with a content hash of (start commit, profile, Telos commit, map skill files); a key mismatch invalidates it and it is rebuilt.
- D-10 [proposed]: B copies get `bench/corpus/<repo>/<start>/CLAUDE.md`; a missing B file for a start → refused.
- D-08 [proposed]: the plugin export contains only runtime paths (skills, agents, hooks, shared, templates, lib, bin, `.claude-plugin`); the session's readable set is {copy, plugin export, per-run config dir}; acceptance material and the bench tree are outside it; WebFetch/WebSearch disallowed and Bash network limited to the model API in the generated settings.
- Never touch the original repositories: `git clone --no-local` into a work dir outside this repo; refuse a work dir inside it or equal to a source repo.
- No solution leak: one branch at start, no remotes, no other refs, no tags after start, reflog expired, unreachable objects pruned.
- Symlinks in the copy or export that resolve outside their root are refused.
- No shell: argv arrays only.

## Tests (write first)
- the prepared copy is at start; the reference hash fails `git cat-file -e`, is absent from `git log --all`; no remote
- a repo-native CLAUDE.md or `.claude/` at start → refused
- A copy has no CLAUDE.md; B copy has exactly its `(repo, start)` file; C/D copies contain `.telos/` from their own key with `config.profile` deep resp. standard
- two starts in one repo → two snapshots per profile; changing Telos commit or profile → old snapshot invalidated and rebuilt
- plugin export contains no `bench/`, `test/` or `.telos/` path
- a symlink in the copy pointing outside it → refused
- a B cell whose `(repo, start)` has no B file → refused
- per-run config dir is new and empty except settings and credentials; settings disable auto-memory and set the sandbox network allowlist
- work dir inside this repo → exit 2

## Interface
- `prepareCopy(cell, manifest, { workDir })` → `{ dir, start, refsChecked: true }`
- `ensureSnapshot(key, { workDir, telosDir, build })` → `{ dir, hash, rebuilt }` (`build` runs the setup sessions, injected for tests)
- `exportPlugin(telosDir, outDir)` → list of exported paths
- `sessionEnv(cell, { configTemplate, workDir })` → `{ env, settingsPath, readable: [paths] }`

## Edge cases
- reference commit reachable → refused (leak)
- repo-native CLAUDE.md → refused
- stale snapshot hash → rebuilt, old one removed
- escaping symlink → refused
- missing B file for a start → refused
- work dir inside this repo → exit 2

## Steps
1. test/fixtures/bench/: mini source repo with two starts and a later reference commit, a symlink case, corpus B files; write the tests.
2. bench/lib/workspace.mjs: `prepareCopy` (clone, checkout, strip history, leak check, native-instruction check, symlink check).
3. bench/lib/workspace.mjs: `ensureSnapshot` with key hash and invalidation; B file placement.
4. bench/lib/sandbox.mjs: `exportPlugin` and `sessionEnv` (fresh config dir, settings for memory/network/tools, readable set).
5. bench/README.md: isolation design; run `npm test`.

## Acceptance
- [ ] all listed tests pass
- [ ] `node --test test/bench-workspace.test.mjs` → exit 0
- [ ] `npm test` → exit 0

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
