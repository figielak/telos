# 14-agents: Codex

**Goal.** The same memory and the same commands work in Claude Code and in Codex. The CLI
is the product; the Claude Code plugin is a thin wrapper around it.

**Done when.** The same plan → work → close run passes on a test repository in Claude Code
and in Codex, recorded as a live smoke run; correctness depends on no hook; `npm test` passes.

## Decisions (defaults)

- D1 `AGENTS.md` holds the rules block; `CLAUDE.md` imports it with `@AGENTS.md`.
- D2 Every command is runnable as "run `telos ctx <name>` and follow its output": the
  bundle carries both the instructions and the context.
- D3 Without hooks, the session start is a rule: "run `telos status` first".
- D4 The git guard stays a Claude Code hook; for other agents the same rules are stated in
  the block. This is weaker and is documented as such.

## Open (resolved by 14-01)

Resolved 2026-11-16, see Notes: D1–D4 hold; Codex has trusted-only hooks and skills
without shell injection, reads AGENTS.md without `@` imports, and keeps `.git/` read-only
in its sandbox.

## Tasks

- [x] **14-01 Research Codex mechanisms**
  - From current primary docs: custom commands or skills, hooks, `AGENTS.md` discovery and
    size limits, how a CLI gets onto PATH in its sandbox, headless mode and usage output.
  - Record findings with dated sources in Notes; revise D1–D4 and the tasks below if needed.
  - Accept: each open question has an answer or an explicit "unavailable".

- [x] **14-02 Self-contained bundles**
  - `telos ctx plan|close|catchup|map|status` print `shared/<name>.md` followed by the
    context, within the cap (raise the cap only with a measured reason). Skills shrink to
    the single injection.
  - User text still never enters a shell injection; arguments stay validated argv.
  - Accept: bundle tests assert instructions + context; `telos budget --ctx` for each ≤ cap.

- [x] **14-03 Rules block in AGENTS.md**
  - `templates/agents-block.md` replaces `templates/claude-block.md`: memory files, "run
    `telos status` first", "read the area before editing", the command list as
    `telos ctx <name>`, Delete-zone rule, commit rules.
  - `telos init`: sync the block into `AGENTS.md` (create when missing), ensure `CLAUDE.md`
    has the `@AGENTS.md` import, migrate an old CLAUDE.md block by removing it. Rerun-safe;
    a broken block exits 1 without writing.
  - Accept: init tests for fresh repo, existing AGENTS.md, old CLAUDE.md block, broken markers.

- [x] **14-04 CLI outside the plugin**
  - Document and test installation without the plugin (`npm install -g` from the repo or
    `npm link`); `telos --version` works from any directory; `bin/telos` resolves `lib/`
    through symlinks.
  - README: separate install sections for Claude Code and Codex.
  - Accept: a test runs the CLI through a symlinked bin path.

- [x] **14-05 No hook dependency**
  - Audit: anything only a hook provides (status at start, stale count, Delete-zone
    warning) must also be reachable by a command (`telos status` shows the stale count;
    `ctx plan` lists Delete-zone entries).
  - Accept: `test/e2e-memory.test.mjs` passes with hooks never invoked.

- [x] **14-06 Live smoke run in both agents**
  - On a copy of the `areas` fixture: init, plan a two-task phase, do the work, close;
    then two commits by hand and a catch-up. Once in Claude Code, once in Codex.
  - Record per agent in Notes: date, version, what passed, what needed a manual nudge.
  - Accept: both runs end with `telos stale --check` exit 0 and a correct STATUS.

## Notes

### 14-01 Codex mechanisms (checked 2026-11-16, codex-cli 0.164.0)

Sources (fetched 2026-11-16; developers.openai.com/codex/* now redirects to learn.chatgpt.com):
learn.chatgpt.com/docs/agent-configuration/agents-md · /docs/build-skills ·
/docs/custom-prompts · /docs/hooks · /docs/plugins · /docs/non-interactive-mode ·
/docs/sandboxing · developers.openai.com/plugins/build/plugins; local probes with
`codex sandbox`, `codex features list`.

- **Custom commands.** Custom prompts (`~/.codex/prompts/`, `/prompts:<name>`) are deprecated
  in favour of skills. Skills are `SKILL.md` dirs in `.agents/skills` (cwd up to repo root) or
  `~/.agents/skills`, invoked with `$name` or `/skills`. No documented way for a skill to
  inject shell output (Claude Code's `` !`…` ``): unavailable. → D2 holds: "run
  `telos ctx <name>` and follow its output" is the portable form; no Codex skills shipped.
- **Hooks.** Stable and on by default (`[features] hooks`): `SessionStart`, `PreToolUse`
  (shell matched as `Bash`, blocks with exit 2), etc., in `~/.codex/` or `<repo>/.codex/`
  `hooks.json`. Project and plugin hooks run only after the user trusts them. → D3 and D4
  hold: correctness cannot rest on hooks the user may not have trusted. Wiring the git guard
  into `.codex/hooks.json` is possible later; not part of this phase.
- **AGENTS.md discovery.** `~/.codex/AGENTS.md` (or `AGENTS.override.md`), then one file per
  directory from the project root (git root) down to cwd, concatenated root first; limit
  `project_doc_max_bytes` = 32 KiB combined. Codex does not resolve `@file` imports, so
  AGENTS.md must be self-contained. → D1 holds: the block lives in AGENTS.md; Claude Code
  reads it through the `@AGENTS.md` import in CLAUDE.md.
- **CLI on PATH.** The sandboxed shell inherits the user's PATH (probe: `node` and `telos`
  resolved). In `workspace-write`, the workspace is writable but `.git/` and `$HOME` are
  read-only: `telos` (writes only `.telos/`) works; `git commit` needs an approval or
  escalation in Codex. → 14-04 installs with `npm install -g`/`npm link` outside Codex.
- **Plugins.** Codex reads `.claude-plugin/marketplace.json` as a legacy repo marketplace and
  root `skills/`, but our skills depend on `` !`…` `` injection, so the Telos plugin is
  Claude Code only; Codex uses the CLI plus AGENTS.md.
- **Headless and usage.** `codex exec --sandbox workspace-write --json` (default read-only;
  `--full-auto` removed); JSONL events, `turn.completed.usage` has `input_tokens`,
  `cached_input_tokens`, `output_tokens`, `reasoning_output_tokens`; `-o` writes the last
  message. Useful for phase 15.

### 14-02 Bundle order and cap

Context first, then `## Instructions`: every `shared/*.md` says "the context above", and the
`REFUSED:` and first-line contracts (`Map validation:` on line 1) stay intact. `REFUSED:` and
`Nothing to catch up` print alone. The context keeps its 6000-char cap; the instructions get a
separate 5600-char cap (`INSTRUCTIONS_CAP`), measured: `shared/map.md` renders at 5239 chars, the
others at 2379–3560. On this repo `ctx plan` is 8354 chars in total.

### 14-05 Hook audit

| Hook gives | Without hooks |
|---|---|
| SessionStart status, `Areas: N`, `Stale areas: N` | rule "run `telos status` first"; `telos status` and `ctx status` print both lines |
| Delete-zone edit warning | `ctx plan` lists removed approaches and, on one line, removed paths |
| Git guard (push, `--no-verify`, `add -A`, `reset --hard`, amend) | stated in the AGENTS.md block; not enforced (D4) |

`ctx plan` without `--area` now fits the roadmap to the budget (rows nearest the target, then a
count line) instead of letting `cap()` cut it: the removed-paths line pushed this repo's plan
bundle past 6000 chars.

### 14-06 Live smoke runs (2026-11-16)

Driver: a copy of `test/fixtures/areas`, `telos init` with `git.auto_commit=false` (Codex's
sandbox keeps `.git/` read-only), areas anchored at the fixture commit; steps plan (two tasks:
`/version` route, `pageTitle` helper, node:test each) → work → close; then two commits by hand
(`lib/util.mjs` edit, new `src/jobs/`) → catch-up. Every commit between steps was made by hand.

| | Claude Code 2.1.325 (plugin via `--plugin-dir`) | Codex CLI 0.164.0 (gpt-6-astra, `exec --sandbox workspace-write`) |
|---|---|---|
| Prompts | `/telos:plan …`, plain "do the tasks", `/telos:close`, `/telos:catchup` | plain language only ("Using Telos, plan…/close…/catch up…") |
| Plan | phase file, 2 tasks, ROADMAP active, STATUS next | ran `telos status`, then `telos ctx plan` unprompted; also `cat` of all memory files |
| Work | both tasks, boxes ticked, tests pass | same; also set `next=/telos:close` and a Recent line |
| Close | checks, notes, new area `test`, anchors, roadmap/history/status | checks, notes, test paths added to `api`/`web`, anchors, roadmap/history/status |
| Catch-up | `util` note, new area `jobs`, anchors | ran `telos ctx catchup`; `util` note, new area `jobs`, anchors |
| Result | `telos stale --check` exit 0; STATUS phase none, Recent `01 closed` | same |
| Cost | $0.84 over 4 sessions, 22 turns | 887K input tokens (799K cached), 6.5K output |
| Manual nudge | none | none |

Found and fixed: both closes listed `AGENTS.md`, `CLAUDE.md` and `.gitignore` as unmapped
(written by `telos init` after the anchor). `unmappedFiles` now skips them at the repo root, as
`ctx map` already did. Seen, left as is: STATUS `Next: /telos:plan` names the Claude Code
command; the AGENTS.md block maps `/telos:<step>` to `telos ctx <step>` and Codex followed it.
