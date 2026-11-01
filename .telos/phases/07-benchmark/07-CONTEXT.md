# 07 · Benchmark
## Goal
Answer publicly whether Telos saves tokens and improves results compared with bare Claude Code and a hand-written CLAUDE.md, on real repositories, with a protocol fixed before the runs. Publish a report whose numbers, raw data, harness and limitations anyone can check and rerun.

## Decisions
- D-01: The harness lives in `bench/` of this repository as dependency-free Node `.mjs`; its tests are `test/bench-*.test.mjs`, so `npm test` covers them. It is not part of the plugin runtime.
- D-02: Variants A (bare Claude Code: no plugin, no CLAUDE.md), B (hand-written CLAUDE.md, ≤ 1 page per repo), C (Telos, profile deep), D (Telos, profile standard; added by the user in revise because deep is expected to cost many tokens); 5 repetitions per task × variant.
- D-03: Fix F6 (review continuation vs `Bash(git diff *)`) and F9 (stale plugin cache) in this phase; F1–F5, F7 and F8 stay and are reported as known limitations.
- D-04: Repositories: BlueVest and knml.edu.pl at the 06 D-04 pins, plus one public mid-size repository (third stack, offline test suite under 2 minutes). Selection is frozen before tasks are written: candidate lists, exclusions with reasons and a deterministic selection rule (script output) for repos and commits, plus one independent review (a person other than the author or a second model) recorded with the corpus. The user's own open-source project is round 2, outside this phase.
- D-05: C and D setup snapshots are keyed by `(repo, start commit, profile)` (`telos init --profile deep|standard` + `/telos:map` at exactly that start), so no map sees later code. Setup cost is charged once to every simulated trajectory (each repetition), never divided across repetitions. Single tasks: `/telos:quick <task text>`. Multi-session scenario: a deterministic transition script — plan → `telos lint-plan` (fail → scenario failed) → one scripted "accept the recommended options" session for questions and `[proposed]` decisions → `telos task set <ids> status=approved` → per generated task in `depends` order `/telos:do` or `/telos:do-hard` as `telos status` suggests, each in a fresh session; any refusal or blocker → scenario failed with its reason. A and B get the same task text as a plain prompt and the protocol's step texts, one fresh session per step.
- D-06: Hidden acceptance is behavioural (public behaviour, not implementation details) plus a regression check (existing tests or build still pass), reviewed for implementation coupling; the material is not reachable during sessions (D-08) and is mounted only after the agent exits. Primary metric: USD per accepted task, always shown with the acceptance rate and including every failed attempt, retry, timeout and setup cost. Secondary: fresh tokens (input + cache_creation, named as such, not "total"), output, cache_read (separate), turns, wall time, an exploration proxy (D-06 detail in 07-05), edits outside the task's expected paths.
- D-07: The pilot runs one complete multi-session scenario in both C and D plus one single task in all four variants, including isolation canaries; after it the final preregistration (PROTOCOL + corpus) is committed and its commit hash and date are recorded; dated amendments are allowed only before that commit.
- D-08: Isolation by construction: sessions run as a dedicated OS user that can read only the copy, the exported plugin runtime (skills, agents, hooks, shared, templates, lib, bin, `.claude-plugin`; no `bench/`, `test/` or `.telos/`) and a fresh per-run `CLAUDE_CONFIG_DIR`; auto-memory disabled; WebFetch/WebSearch disallowed and Bash network restricted to the model API via Claude Code's sandbox in every variant. Verified by canaries (planted instruction files and memory, read/fetch attempts on acceptance material and the upstream repo), not by init events alone.
- D-09: The benchmark compares the shipped default workflows: every session starts with the same pinned model ID; Telos skill model overrides (opus for plan/do-hard/map-hard, sonnet elsewhere) and skill `allowed-tools` stay as shipped and are part of the C/D treatment; all variants share one permission mode and base allow list. Per-turn models and denied tool calls are recorded from transcripts and costs are reported per model.
- D-10: B instructions are written per `(repo, start commit)` from that historical state only, ≤ 400 words each (counted by script), before the tasks of that start are written; the author's preparation time is recorded and reported as B's setup effort.
- D-11: Run order uses blocked randomization: for every `(task, repetition)` block the four variants run back to back in a seeded random order. Cache conditions are pre-registered (no deliberate warming; gaps between cells logged; cache_read reported); break-even is reported over a declared deployment horizon independent of the repetition count, as first crossover and as sustained break-even.
- D-12: Spend cap $300 API-equivalent (subscription usage is not cash): every session runs with `--max-budget-usd` from the pilot-based per-cell reservation, a cell starts only if its reservation fits under the remaining cap, and the run stops without dropping repetitions; reforecast after the pilot. (Was Q-01; value suggested in the external plan review.)

## Constraints
- Record per run: Claude Code version, model IDs per turn, Telos commit and plugin version, profile, exact flags, repository and start commit, run-order seed, cache conditions, all usage fields and failures.
- Every run is a fresh headless session in a disposable copy outside this repository; original repositories stay untouched.
- Only C and D load Telos; A and B load no plugin, MCP server, memory or instruction file except B's CLAUDE.md.
- Published evidence: sanitized event transcripts, patches and grading outputs per run, with a documented redaction process; raw-file hashes alone are not evidence.
- Report medians and IQR, paired by task; 5 repetitions measure run variability, not repository diversity; verdicts are descriptive with thresholds fixed in PROTOCOL. The report discloses that the Telos author ran it.
- Host usage is evidence; `telos budget` stays a size proxy and is never presented as usage.

## Carried over
- F6: review continuation `git '--literal-pathspecs' 'diff' …` is denied headless → 06-RESULTS §Follow-ups ⇒ 07-01
- F9: installed plugin cache lags the repo; reinstall before live measurement → 06-RESULTS §Follow-ups ⇒ 07-08
- F3: per-step do attribution through a no-Telos run of the same task → 06-RESULTS §Follow-ups ⇒ 07-06
- F8: standard still receives deep-critical do instructions → 06-RESULTS §Follow-ups ⇒ 07-08 (record injected bundles)

## Links
- .telos/phases/06-measure/06-RESULTS.md
- .telos/phases/06-measure/06-WORKFLOW-EVIDENCE.md
- SPEC.md §12. Token budget
- BENCHMARK-PLAN-REVIEW.md (external review applied in revise)
