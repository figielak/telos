# 03 · Map
## Goal
Make `/telos:map` build a compact navigation map and draft PROJECT, with incremental refresh.
Develop Telos itself under `.telos/` with the minimal profile; prove the map offline on Astro
and Python fixtures with deterministic size checks (real-repo headless proof moved to 06, D-09).

## Decisions
- D-01: 03-01 is the reviewed bootstrap: move `.planning/` to `.telos/`, initialize minimal without force, preserve history and hand-maintained phase CONTEXT files; thereafter approve/do and CLI state commands own the workflow.
- D-02: Estimated tokens = `Math.ceil(text.length / 4)` (JS UTF-16 code units, including comments and final newline). Scan stdout ≤ 8000 chars / 2000 estimated tokens; MAP ≤ `limits.map_tokens`; context payload ≤ 6000 chars. This is a reproducible proxy, not a model tokenizer.
- D-03: Scan filesystem metadata deterministically; tree display depth 3, counts over the full eligible inventory, history last 100 commits, lexical tie-breaks. Exclude git/Telos state, build/vendor/cache/virtualenv dirs, lockfiles and binary files; never follow symlinks or execute manifests. Suggest 3–8 source excerpts where available.
- D-04: MAP header uses full HEAD hash, UTC build date and eligible inventory file count. Full build and refresh require HEAD and a clean source tree; init-managed `.telos/`, CLAUDE.md and .gitignore changes are allowed. No git writes by the CLI; no fabricated hash for unborn/non-git repos.
- D-05: Refresh units are nonempty Structure, Entry points, Flows, Find sections and individual `###` Areas (not the Areas container or header). Match changed old/new paths to backticked file/directory refs; additions/deletions also affect Structure and the nearest matching Area. Rebuild at strictly >30% affected units; exactly 30% stays incremental. Missing/stub/unusable baseline → full; other diff errors → refusal.
- D-06: Skills inject `telos ctx map` and `telos ctx shared map`; `$ARGUMENTS` stays in Request. Default = full; literal `--refresh` requests refresh. Targeted source excerpts only. PROJECT drafts fill template-empty sections, preserve authored text, omit stack/checks, list assumptions and await confirmation without requiring AskUserQuestion; no automatic commit or ROADMAP change.
- D-07: Offline `node:test` CLI integration and recorded headless evidence are separate gates; scan, MAP and bundle limits are asserted in tests. Real-repo evidence records revision, outputs, limits, navigation spot-checks and refresh preservation; fixtures alone cannot close the phase.
- D-08: User-confirmed on 2026-10-26: evidence repos will be one existing user-owned Astro app and one Python package/service, each copied to a disposable checkout at an agreed commit; record their paths/revisions before executing 03-09. Superseded by D-09.

- D-09: User decision 2026-10-26: 03-09 (headless proof on real Astro and Python repos) is dropped from phase 03 and carried over to 06-measure, which already measures 2–3 real repos. Phase 03 closes on the offline proof of 03-08; this relaxes D-07's "fixtures alone cannot close the phase" for 03 only. The real-repo criteria of D-07 (revision, outputs, limits, navigation spot-checks, refresh preservation) move with it.
## Constraints
- Tasks are roughly ≤ 1 hour each; all non-trivial scan, token-budget and diff logic is hard, with no critical tasks warranted. Order: migration → CLI → skills → refresh → automated e2e → real-repo proof.
- Node ≥ 20.10, ESM, no dependencies, node:test; task/frontmatter parsing stays in the existing modules. README rows accompany new/changed CLI commands and skills.
- Keep CONTEXT ≤ 60 lines, normal tasks ≤ 80 and detailed tasks ≤ 140; state mutations use CLI after bootstrap. Historical phase 01/02 records are moved, not rewritten.
- No deep map-staleness hook, Explore subagent, phase 04+ features or ROADMAP proposals beyond a one-line suggestion. No new budget command or tokenizer dependency.
- `ctx map` reports MAP validation before optional scan text; skill success requires PASS after writing. Too-small budgets or an oversized mandatory refresh payload produce an actionable refusal, never a silently partial map.
- A refresh preserves unaffected sections/Areas byte-for-byte. No relevant changes preserve the body; only provenance may advance. Plain `/telos:map` is the explicit full-rebuild escape hatch.

## Open questions
- none (Q-01 on real repos/revisions moved to phase 06 with D-09)

## Carried over
- Init already suggests `/telos:map` for existing code → 02-14 Result ⇒ 03-05, 03-08.
- Headless runs could not use AskUserQuestion and chose defaults → 02-14 Result ⇒ 03-05, 06 (D-09); use explicit assumptions and an unconfirmed PROJECT draft.

## Links
- SPEC.md §4.1, §4.3.1, §4.3.2, §4.3.3, §5.0, §6, §12, §13, §14
- AGENTS.md §Working on a task
- .telos/phases/02-core-loop/02-14-e2e-core-loop.md §Result (after 03-01)
