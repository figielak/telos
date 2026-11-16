<!-- telos-area: commit 81b817107d4b937b98e44b11816c113d8891bfb8 · 2026-11-16 · paths: hooks/, lib/git-guard.mjs, lib/edit-guard.mjs, lib/delete-guard.mjs, lib/session.mjs -->
# hooks-guards

## Purpose
The three plugin hooks: SessionStart status, the Bash git guard and the Delete-zone warning.

## Entry points
- `hooks/hooks.json` — wires the hooks to `hooks/*.mjs`
- `hooks/session-start.mjs` → `lib/session.mjs:31` `sessionText` → `lib/status.mjs:115` `view`
- `hooks/git-guard.mjs` → `lib/git-guard.mjs:139` `check`; `:28` `splitCommands`
- `hooks/edit-guard.mjs` → `lib/edit-guard.mjs:50` `editTarget` → `lib/delete-guard.mjs:37` `deleteGuard`

## Invariants
- Hooks are silent when `.telos/` is missing and make no model calls.
- No correctness depends on a hook (14-05): every line SessionStart adds also comes from
  `telos status` (`areaStatusLines`), the Delete-zone paths from `ctx plan`.
- SessionStart ≤ 1200 chars, identical after startup and compact; it adds only `Areas: N` and,
  when N > 0, `Stale areas: N (run telos stale)` (12-05), within a 300 ms budget for 30 areas.
- The git guard blocks only the irreversible (push, `--no-verify`, `add -A`, amend of a pushed
  HEAD, `reset --hard`) with exit 2 and a reason.
- The Delete-zone warning never blocks; once per path per session, symlinks resolved.

## Decisions
- Block only the irreversible; the agent runs checks itself (10).
- The git guard splits `&&`, `;`, `|`, env prefixes, `git -C`/`-c` and `sh -c '…'`.
- Hooks stay Claude Code only (14:D4); Codex has trusted-only hooks, so other agents get the
  git rules as text in the AGENTS.md block — weaker, documented in README Limits.

## Rejected
- Edit-scope and protected-config guards, Stop-time checks, PreCompact saves, context-usage
  hints (10) — cost without catching real mistakes.

## Pitfalls
- The stale count runs git; a git failure or a missing work tree drops the line silently.
- The warning cache lives in `.telos/.cache/` (gitignored); a missing cache only repeats a warning.
