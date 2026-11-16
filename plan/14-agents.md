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

How Codex currently defines custom commands, whether it has hooks, and how it discovers
`AGENTS.md` in nested directories. Not verified when this plan was written.

## Tasks

- [ ] **14-01 Research Codex mechanisms**
  - From current primary docs: custom commands or skills, hooks, `AGENTS.md` discovery and
    size limits, how a CLI gets onto PATH in its sandbox, headless mode and usage output.
  - Record findings with dated sources in Notes; revise D1–D4 and the tasks below if needed.
  - Accept: each open question has an answer or an explicit "unavailable".

- [ ] **14-02 Self-contained bundles**
  - `telos ctx plan|close|catchup|map|status` print `shared/<name>.md` followed by the
    context, within the cap (raise the cap only with a measured reason). Skills shrink to
    the single injection.
  - User text still never enters a shell injection; arguments stay validated argv.
  - Accept: bundle tests assert instructions + context; `telos budget --ctx` for each ≤ cap.

- [ ] **14-03 Rules block in AGENTS.md**
  - `templates/agents-block.md` replaces `templates/claude-block.md`: memory files, "run
    `telos status` first", "read the area before editing", the command list as
    `telos ctx <name>`, Delete-zone rule, commit rules.
  - `telos init`: sync the block into `AGENTS.md` (create when missing), ensure `CLAUDE.md`
    has the `@AGENTS.md` import, migrate an old CLAUDE.md block by removing it. Rerun-safe;
    a broken block exits 1 without writing.
  - Accept: init tests for fresh repo, existing AGENTS.md, old CLAUDE.md block, broken markers.

- [ ] **14-04 CLI outside the plugin**
  - Document and test installation without the plugin (`npm install -g` from the repo or
    `npm link`); `telos --version` works from any directory; `bin/telos` resolves `lib/`
    through symlinks.
  - README: separate install sections for Claude Code and Codex.
  - Accept: a test runs the CLI through a symlinked bin path.

- [ ] **14-05 No hook dependency**
  - Audit: anything only a hook provides (status at start, stale count, Delete-zone
    warning) must also be reachable by a command (`telos status` shows the stale count;
    `ctx plan` lists Delete-zone entries).
  - Accept: `test/e2e-memory.test.mjs` passes with hooks never invoked.

- [ ] **14-06 Live smoke run in both agents**
  - On a copy of the `areas` fixture: init, plan a two-task phase, do the work, close;
    then two commits by hand and a catch-up. Once in Claude Code, once in Codex.
  - Record per agent in Notes: date, version, what passed, what needed a manual nudge.
  - Accept: both runs end with `telos stale --check` exit 0 and a correct STATUS.

## Notes
