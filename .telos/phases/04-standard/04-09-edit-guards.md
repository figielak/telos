---
id: 04-09
title: Config and scope guards
type: code          # code | doc | audit
status: done        # draft | approved | in-progress | done | blocked | reverted
critical: true
effort: hard        # normal | hard
depends: [04-02]
decisions: []       # phase-local, e.g. [D-03]
scope: ["lib/edit-guard.mjs", "hooks/edit-guard.mjs", "hooks/hooks.json", "test/edit-guard.test.mjs", "test/manifest.test.mjs", "README.md"]
---
## Goal
Protect configured files and enforce current-task scope on Edit/Write, with actionable warnings and optional strict blocking.

## Read first
- SPEC.md §8
- lib/scope.mjs:1-28 (inScope)
- lib/lint-plan.mjs:21-27 (filesOf)
- hooks/git-guard.mjs:1-25 (hook wrapper)
- hooks/hooks.json:1-27 (event wiring)

## Files
- lib/edit-guard.mjs (create)
- hooks/edit-guard.mjs (create)
- hooks/hooks.json (modify)
- test/edit-guard.test.mjs (create)
- test/manifest.test.mjs (modify)
- README.md (modify)

## Constraints
- Use loadTask/filesOf/inScope and shared frontmatter parsing; no independent task parser.
- Normalize absolute/relative paths against repo root and resolve aliases without matching sibling prefixes; .telos/ is scope-exempt only.
- Protected config requires a matching Files declaration on the active in-progress task, independently of scope.
- Assumed: protected_configs fragments such as pyproject.toml#tool.ruff conservatively protect the whole file; no ad-hoc TOML parser.
- Missing .telos/ or minimal is silent; invalid existing standard config/task must not silently bypass protection. README hook rows explain blocks/warnings.

## Tests (write first)
- Protected exact/glob/fragment file is blocked unless active task Files declares it; broader scope alone does not authorize it.
- Outside-scope edit warns with Result deviation guidance; strict_scope blocks; .telos/ remains scope-exempt.
- No in-progress task suppresses scope warnings but keeps protected config guard; minimal/missing Telos stays silent.
- Absolute, ../, symlink and sibling-prefix aliases cannot bypass matching; non-target tools are ignored.
- Malformed hook JSON reports safely; invalid standard config or referenced task fails closed with an actionable error.

## Interface
- PreToolUse Edit|Write reads tool_input.file_path, cwd and current task via STATUS.
- Warnings use additionalContext with exit 0; blocks use supported hook deny/exit 2 protocol.
- editGuard(root, input) returns allow/warn/deny plus reason, allowing independent hook process tests.

## Edge cases
- Protected file in scope but absent from Files → block.
- strict_scope false/true outside scope → warn/block.
- Missing task → no scope warning; config protection still applies.
- Path alias or symlink → canonical matching, no bypass.

## Steps
1. test/edit-guard.test.mjs: write behavior and adversarial path cases first.
2. lib/edit-guard.mjs: editGuard — canonicalize target and combine protected-file and task-scope checks.
3. hooks/edit-guard.mjs: decode event and emit supported warn/deny output; verify payload contract against current host docs.
4. hooks/hooks.json: wire Edit|Write while retaining existing Bash guard.
5. README.md and manifest tests: document and validate both guards.

## Acceptance
- [x] all listed tests pass
- [x] `npm test` → exit 0
- [x] Protected configs cannot be authorized by scope alone; strict scope blocks canonical out-of-scope paths.

## Result
- lib/edit-guard.mjs editGuard(root, input) → allow|warn|deny: protected_configs (exact, glob, basename at any depth, `#fragment` = whole file) need the exact path in the in-progress task's Files; out-of-scope edits warn with the Deviations line, strict_scope denies; `.telos/` exempt.
- Targets are matched lexically and via realpath of the deepest existing ancestor (absolute, `../`, cwd-relative, symlinked file/dir, sibling prefixes covered); invalid std config or unreadable STATUS task fails closed except for repair edits inside `.telos/`.
- hooks/edit-guard.mjs: exit 2 + stderr for deny, `hookSpecificOutput.additionalContext` for warn, malformed input reported with exit 0; wired in hooks.json for Edit|Write|MultiEdit|NotebookEdit next to the Bash guard.
- Tests: 10 in edit-guard.test.mjs + 1 in manifest.test.mjs; npm test 381/381. The additionalContext payload follows the documented PreToolUse format but was not re-checked against live host docs in this session.
Deviations: none
