# Corpus review (PROTOCOL §3.4)

**Reviewer:** Codex CLI 0.164.0, model `gpt-6-astra` (OpenAI), fresh context, read-only sandbox, no network, no access to this repository's history or the author's notes. **Kind: model check**, not an independent human review (§3.4, §12).
**Material per round:** PROTOCOL §3–§4 and amendments, `select.mjs`, the corpus files, a `prepareCopy` view of every selected start, and the derived task commits with diffs (round 1 truncated, later rounds full).
**Sessions:** round 1 `01a197ef-a546-7f90-9406-f1041642687a`, round 2 `01a19828-78a9-7372-9ef9-565e4212cbed`, round 3 `01a1983a-7566-72d2-afa5-4f78350f13db` (all 2026-11-01).

## Status: Python slot empty, amendment 3

Task 07-14 ran the frozen rules once on 2026-11-02. `node bench/select.mjs --manifest bench/corpus` stopped with `no repository qualifies for slot python (PROTOCOL §3.2)`. By D-04 this was not patched in 07-14. The user then chose PROTOCOL amendment 3 (task 07-15) over a larger pool: an empty slot stays empty and is reported (§12), and the benchmark runs on the filled slots, Go and web. The same measurements now select lazygit (Go) and anything-llm (web), with Python listed under `unfilled`. B files and the model check of this pool follow in 07-14.

### 07-14 measurements

17 candidates pass the static and history rules (`--gather`). Each was measured with `measure-suite.sh` at its earliest start usable from history; `suites.jsonl` keeps every run (31 rows). Last run at that start:

| candidate | slot | start | offline | online | s | runs |
|---|---|---|---|---|---|---|
| jesseduffield-lazygit | go | 2024-12-31 `1e1fba4ce6dc` | 0 | – | 21 | 1 |
| etcd-io-etcd | go | 2025-07-01 `d5537ec25076` | 0 | – | 35 | 1 |
| prometheus-prometheus | go | 2025-03-31 `26857cf5000f` | 0 | – | 187 | 1 |
| cli-cli | go | 2024-12-27 `6c5145166003` | 1 | 0 | 46 | 1 |
| caddyserver-caddy | go | 2024-12-31 `34cff4af7db1` | 1 | 1 | 37 | 1 |
| fatedier-frp | go | 2025-12-25 `ef96481f5812` | 1 | 1 | 18 | 1 |
| gohugoio-hugo | go | 2024-12-31 `2db43f841c7d` | 124 | 1 | 600 | 1 |
| nektos-act | go | 2025-06-27 `dd58f5e20fa3` | 1 | 124 | 262 | 1 |
| ollama-ollama | go | 2025-03-31 `66b253923891` | 1 | 1 | 19 | 1 |
| rclone-rclone | go | 2024-12-30 `a389a2979b0a` | 1 | 1 | 454 | 2 |
| usememos-memos | go | 2025-12-31 `f66c750075b1` | 1 | 0 | 179 | 1 |
| langflow-ai-langflow | python | 2024-12-31 `c55edcd97f41` | 1 | 1 | 265 | 1 |
| paddlepaddle-paddleocr | python | 2025-12-30 `6f425758d103` | 1 | 137 | 94 | 2 |
| vllm-project-vllm | python | 2025-03-31 `e6e3c55ef28f` | setup failed | | | 2 |
| yt-dlp-yt-dlp | python | 2025-06-30 `30fa54280b36` | 250 | 1 | 132 | 1 |
| mintplex-labs-anything-llm | web | 2025-06-30 `89320588f3b1` | 0 | – | 2 | 2 |
| louislam-uptime-kuma | web | 2025-12-31 `23a8a40eb9e1` | 1 | 1 | 228 | 1 |

Would-be winners: go = lazygit (21 s), web = anything-llm (2 s). Python: langflow fails 20 of 832 tests also online; yt-dlp crashes offline (exit 250) and fails 36 tests online (`websockets` deprecation warnings under `-Werror`); paddleocr's tests download models (109 errors offline) and its online rerun was OOM-killed; vllm's `requirements/test.txt` does not resolve at its start (`xgrammar==0.1.16` unsatisfiable), and its own CI tests on GPU only.

### Deviations during the 07-14 run (disclosed)

- **Wrong start for 10 candidates in the first pass.** The author's plan took each candidate's earliest start instead of its earliest start usable from history. Those rows (other commits) stay in `suites.jsonl` and are ignored by the rule; the 10 were then measured at the right start.
- **Recipes changed after a run whose test command did not execute the suite.** Criterion, applied to every candidate: rerun only when the tests never ran because of the recipe or the host, never when they ran and failed. yt-dlp (`run_tests.py` called `pytest` from PATH: `PATH` now includes `.venv/bin`; its failed run was at a wrong start), anything-llm (`yarn test` in `server/`, which has no test script; the start's own `yarn test` is jest at the root), paddleocr (missing `scikit-image`; now installed as its CI does) and vllm (`requirements-test.txt` moved to `requirements/test.txt`). This deviates from D-04 ("not tuned after a failing measurement"); the first rows stay in `suites.jsonl`.
- **Host failures rerun with the same recipe.** prometheus and rclone first failed on `disk quota exceeded` in `/tmp` (a 4.5 GB `go-build` dir left by a killed `go test`); the reruns used `TMPDIR=~/bench-work/tmp`. Two runs whose `git clone` failed on DNS were not measurements and were removed from `suites.jsonl`.
- **Memory.** The host has 14 GB RAM; paddleocr's online run OOM-killed the editor session twice. Later runs ran in a systemd unit with `MemoryMax=5G`, `MemorySwapMax=1G`, `Nice=10`. The first paddleocr row (wrong start, online OOM-killed) was written by hand from its logs (`note` field).
- **Toolchain gaps not fixed:** no `g++` on the host, so ollama's cgo packages do not build; installing it after seeing results would change the host.
- `measure-suite.sh`'s `timeout` does not kill grandchildren: memos reports 1240 s for a 600 s limit (offline run killed late, result unchanged).


The rules were rewritten and frozen by task 07-07 (PROTOCOL amendment 2): one recorded GitHub Search pool (`search/`, 2026-11-01), the scenario is the first other eligible change with 150–1500 product lines, the task window is 100 first-parent commits, the reference is the start tree plus the task commit's own diff (applied with `git merge-tree`), regression runs on the restored start tests. Task 07-14 runs them once from scratch, without rule changes. This file has no review of the new pool yet: the review of §3.4 happens after that run, and its objections go to the report as limitations (§12), not into the rules.

The rounds below reviewed an earlier convenience sample under the earlier rules. They are kept as disclosure only; nothing of that sample (its `selection.json`, B files, B effort, measurements) is committed or reused.

## Disclosures (earlier sample)

- Discovery is a convenience sample. Round 1 lists repositories the author knew per stack. Round 2 (web) was added after the round-1 fixes emptied the web slot.
- B authorship: the user directed that B is written by Claude without human edits (PROTOCOL amendment). lazygit B was written in the main session before any task subject had been shown. textual and emberjs B were written by fresh subagents given only the view and the B rules, because the main session had by then printed task-commit subjects, and the user saw them too.
- Harness-driven exclusions: cli (ssh test vs user-namespace ownership) and mermaid (test depends on the clone directory name). The harness layout and sandbox are not adapted per candidate.
- The measurement runs of that sample (`suites.jsonl`) and their logs were not kept in the repository; `suites.json` keeps the recipes and the toolchain (`_host`).

## Superseded rounds

Rounds 1–3 of the model check on the earlier convenience sample, verbatim, with the author's responses. The rules they discuss were amended afterwards (PROTOCOL Amendments).

### Round 1 findings (verbatim)

Verdict: blocking findings

1. **blocking — Trivial maintenance commits qualify as single tasks.** `tasks/preact-single1.txt:18–24` only changes the DevTools version string from `10.26.4` to `10.26.5`; `tasks/werkzeug-single2.txt:40–59` corrects spelling in a README and docstring. `select.mjs:86–95,121–126` treats changes outside its path blacklist as product work without checking substance. These are unsuitable feature/fix tasks; the spelling task cannot support a meaningful behavioural acceptance test. **Fix:** establish uniform exclusions for release-only, spelling-only and similarly trivial changes, then rerun selection across every candidate.

2. **blocking — Preact’s scenario is test infrastructure, not a product feature.** `tasks/preact-scenario.txt:4,10–42` describes a Vitest migration: tests, dependencies, lint configuration, removal of Karma, and new Vitest configuration/setup. The classifier counts those root-level configuration files as product code (`select.mjs:28–35`). Removing Karma also threatens the required original-suite regression check (`PROTOCOL-3-4.md:53–57`). **Fix:** classify test infrastructure consistently, exclude this scenario, and recompute repository/start eligibility—not just substitute a convenient task.

3. **blocking — Task-commit exclusions do not affect derivation.** `derive()` never consults exclusions (`select.mjs:121–126`); exclusions are checked only for repositories and starts (`148–150,177`). In an in-memory replay, excluding `preact@f6bbed502197a5ac216235fc4c322281c9fbce7a` still selected it. This prevents §3.5’s required “exclude failed reference and take the next” behaviour (`PROTOCOL-3-4.md:34`). **Fix:** apply commit exclusions inside task derivation, including quota checks and pilot derivation.

4. **blocking — All three B files violate the requested prohibition on naming future-task targets.** Concrete overlaps:
   - Preact B, line 15: `src/jsx.d.ts`, the sole changed file in `tasks/preact-single2.txt:8`.
   - Werkzeug B, lines 15 and 18: `FileStorage`, `test.py`, and `EnvironBuilder`, directly targeted by `tasks/werkzeug-scenario.txt:4,10–13`.
   - Lazygit B, lines 17 and 24: `pkg/i18n/english.go`, `TranslationSet`, and `EnglishTranslationSet()`, changed in `tasks/lazygit-single1.txt:116–140`.

   These are legitimate historical names, so overlap does **not** establish access to future history. It nevertheless fails the stated no-naming criterion. **Fix:** remove the overlaps before freezing B, or explicitly amend the criterion to permit general architectural guidance and review against that narrower standard.

5. **should-fix — Werkzeug’s proposed pilot duplicates its measured tasks.** `corpus/selection.json:22–28` assigns a different pilot start, but deriving from it produces the same two singles and scenario. The duplicate hashes appear in `corpus/candidates.json:10573,10580,10699` and `10813,10820,10939`. Using that pilot would violate §3.6’s task separation. **Fix:** require disjoint task identities when choosing pilot material; otherwise select another repository’s disjoint pilot.

6. **should-fix — Determinism does not establish unbiased sampling.** Every candidate’s source is merely `"GitHub, author search by stack"` (`corpus/candidates.json`, e.g. line 21). No search queries, sampling frame, stopping rule or rationale for the thresholds is supplied. The merge requirement also selects for repository merge practices. Selection replays byte-for-byte; exclusions are internally consistent with recorded inputs, and the selected repositories’ static file/commit/contributor counts match their views. That validates execution, not how the pool and criteria were chosen. **Fix:** publish the discovery procedure and dated freeze evidence, and disclose the convenience sample and merge-practice restriction. There is no demonstrated intentional variant favouritism here.

7. **should-fix — B contains inaccurate guidance.** Preact B, line 3, says every listed addon has `mangle.json`, but `views/preact/test-utils/` does not. Lazygit B, line 3, permits vendor edits only through the gocui procedure, whereas `views/lazygit/CONTRIBUTING.md:167–195` documents direct development edits and both gocui and lazycore updates. **Fix:** qualify the addon claim and accurately describe both vendor workflows. All three B files pass the word limit: Lazygit 293, Werkzeug 272, Preact 284.

8. **should-fix — B is model-authored, not hand-written by a person.** `corpus/b-effort.json:2–3` explicitly identifies Claude as author and says the user neither wrote nor edited the files. Calling this a human-written baseline, or treating three minutes as human preparation cost, would misdescribe the comparison. **Fix:** consistently label it model-authored static instructions and report the effort with its recorded limitations.

9. **should-fix — The supplied evidence cannot support a complete §3.4 sign-off.** Scenario diffs are explicitly truncated (`tasks/preact-scenario.txt:44`, `tasks/werkzeug-scenario.txt:21`); task prompts, scenario steps, acceptance tests and reference-regression results are absent. Measurements provide exit codes and timings without logs or exact toolchain versions; their recipe hash covers commands, not the measurement script (`corpus/measure-suite.sh:25`). The selector also imports an unprovided helper (`select.mjs:7`); replay required an in-memory error-class substitute. **Fix:** provide a self-contained replay bundle, complete diffs and validation evidence, and archive measurement logs/toolchain details. Record this review as a corpus model check, not completed acceptance review.
### Round 1 author responses


1. Trivial single tasks — fixed in the rule: a task commit must change product files AND tests; typo/spelling/codespell subjects and integration-branch merges are not tasks (select.mjs TEST, TRIVIAL, INTEGRATION). Facts were re-gathered for every candidate with starts; selection rerun.
2. Preact scenario = test infrastructure — fixed: build/test tooling (root dotfiles, *.config.*, karma/vitest/jest/babel configs, tsconfig/jsconfig, biome/oxlint/mangle json, Makefile, README*, examples/) is not product (NOT_PRODUCT). Preact then lost its scenario at every start; the web slot emptied.
3. Commit exclusions ignored in derivation — fixed: derive() skips `<repo>@<hash>` exclusions; test added.
4. B names overlap future tasks — not changed, by user decision: B is written blind to the tasks (before derivation); removing names because they are task targets would itself use future knowledge and weaken B. Recorded as an unresolved objection for the report.
5. Werkzeug pilot duplicates measured tasks — fixed: the pilot start must derive disjoint tasks; werkzeug now has no pilot (every start yields the same scenario); the pilot is in lazygit or emberjs (§3.6 needs one repo).
6. Convenience sample — disclosed: candidates.json `source` now states round 1 = repositories the author knew per stack, round 2 = JavaScript web repositories with PR merge commits added after the web slot emptied. No sampling frame exists; listed as a limitation.
7. Inaccurate B claims — fixed in lazygit (vendor workflows for gocui and lazycore). Preact B removed (preact no longer selected).
8. B is model-written — accepted and made explicit by user decision: PROTOCOL §0/§1/§4.3 amended to "static CLAUDE.md written with Claude", reported as model-written static instructions. The emberjs B was rewritten by a fresh Claude subagent, because the main session had seen emberjs task subjects before its own draft.
9. Evidence — partly addressed: full task diffs are provided now (tasks/), suites.json `_host` records toolchain versions, the recipe hash covers setup+test (not the script). Run logs stay local (not committed). Task texts and acceptance do not exist yet; they get their own §3.4 review in a later task.

Also since round 1: the measurement harness runs offline tests as the calling user (nested user namespace); cli is excluded because its ssh test cannot run in that sandbox; mermaid is excluded because one test depends on the clone directory being named `mermaid`; emberjs recipe builds `dist/` before `pnpm test` and uses the system Chrome (puppeteer download skipped).

### Round 2 findings (verbatim)

Verdict: blocking findings

**Round 1 status**

| Finding no. | Status | Evidence |
|---|---|---|
| 1 | Resolved for the cited tasks | `select.mjs:138–143` now requires test changes and rejects spelling subjects; replay selects neither original maintenance task. This remains a heuristic, not proof of behavioural substance. |
| 2 | Partially resolved; classification still open | Preact is excluded and tooling patterns were added (`select.mjs:33–41`). Ember’s replacement scenario still counts test infrastructure as product; see new finding 2. |
| 3 | Resolved | `select.mjs:138` applies commit exclusions during derivation. In-memory exclusions of each selected first single removed it and selected a replacement. |
| 4 | Accepted under this round’s narrower criterion | Historical architectural names are allowed; overlap alone is not leakage. Lazygit’s translation guidance follows `views/lazygit/CONTRIBUTING.md:121`; Ember’s deprecation guidance follows its historical `packages/@ember/-internals/deprecations/index.ts:40–85`. No task-derived steering established. |
| 5 | Resolved | `select.mjs:214–216` rejects overlapping hashes. Re-derived Lazygit and Ember pilot tasks are disjoint from their measured tasks; Werkzeug has no pilot (`corpus/selection.json:23`). |
| 6 | Accepted limitation; unbiased sampling not established | `corpus/candidates.json:2,411` explicitly discloses convenience sampling and expansion after the web slot emptied. No independently verifiable freeze chronology or sampling stopping rule is supplied. |
| 7 | Resolved for the cited inaccuracies | Preact B is removed. Lazygit B’s revised vendor guidance agrees with `views/lazygit/CONTRIBUTING.md:167–195`. |
| 8 | Resolved as an authorship-label issue | `PROTOCOL-3-4.md:70` and `corpus/b-effort.json:2` explicitly describe model-written instructions and model preparation time. |
| 9 | Still open, partly addressed | Replay is self-contained; full diffs and toolchain metadata are supplied. Prompts, steps, acceptance and reference-validation results remain absent. Logs are unavailable (`corpus/suites.json:15`), and the recipe hash excludes the harness (`corpus/measure-suite.sh:25`). |

Selection reproduces the committed output exactly. B counts are **Lazygit 308, Werkzeug 272, Ember 347**. I found no material new B inaccuracy or substantiated future-task hint. These checks do not establish the claimed authorship chronology.

**New findings**

1. **Blocking — Selected references conflict with the mandatory original-suite regression check.**  
   Werkzeug single1 changes the default redirect status to 303 (`tasks/werkzeug-single1.txt:142–143`), while the start suite explicitly requires 302 (`views/werkzeug/tests/test_utils.py:30–32`; `tests/test_test.py:596,602`). Ember single2 deletes `DEPRECATE_IMPLICIT_ROUTE_MODEL` and `findModel` (`tasks/emberjs-single2.txt:23–29,134–149`), while its restored original test module dereferences that entry during class definition and calls that method (`views/emberjs/packages/@ember/routing/tests/system/route_test.js:33–45`). These are concrete incompatibilities with §4.2, not merely missing validation logs.  
   **Fix:** apply §3.5’s failed-reference exclusions and rerun selection. Validate every reference with the restored start suite; whole-tree references may inherit failures from earlier commits.

2. **Blocking — Ember’s scenario falls below the product-line threshold when test infrastructure is classified correctly.**  
   `corpus/candidates.json:6193–6199` records **228 product lines**. Recounting its full diff identifies **79 wrongly included lines**: browser/test runners 20, `type-tests/` 54, internal test helpers 3, and `tsconfig/compiler-options.json` 2. Evidence: `tasks/emberjs-scenario.txt:112,1268,2905,2918`; the omissions are in `select.mjs:28–41`. Removing only these leaves **149**, below §3.5’s minimum of 150—even retaining the potentially debatable Broccoli entrypoint as product.  
   **Fix:** classify these test/tooling paths consistently, regenerate facts for every candidate, and recompute repositories, starts and pilots.

3. **Should-fix — Ember’s replacement scenario still lacks a demonstrated behavioural task.**  
   Its stated objective is “Upgrade glimmer-vm” (`tasks/emberjs-scenario.txt:4–6`). Product changes predominantly adapt internal APIs; test changes replace removed utilities and weaken a diagnostic expectation (`:680–740`). This does not establish a new public feature or fix with an implementation-independent test that fails at the start. Requiring particular dependency versions or internal API replacements would not satisfy §4.2.  
   **Fix:** establish the observable before/after requirement and a passing alternative implementation before admitting this task, or uniformly exclude compatibility-only migrations. Do not manufacture a task around incidental internal changes.

4. **Note — The resulting population is constrained by harness quirks as well as repository quality.**  
   CLI is excluded for namespace-induced SSH ownership failures, and Mermaid for the checkout directory name (`corpus/exclusions.json:5–12`). Combined with the adaptive candidate expansion, a sceptical reader can reasonably question generalisation despite deterministic replay.  
   **Fix:** explicitly report these environmental restrictions and freeze a consistent policy for repairing harness incompatibilities before further candidate screening.
### Round 2 author responses


1. References conflicting with the restored original suite — fixed structurally: a task commit may only add test lines (`testDeletions === 0`); a commit that rewrites or deletes existing tests changes checked behaviour and is skipped. Actual reference validation (behavioural tests fail at start, pass at reference; restored suite passes on both) happens when acceptance is written (later task); a failing reference is then excluded by hand and the rule rerun, as §3.5 says.
2. Ember scenario under the threshold — fixed: type-tests/ count as tests; test runners (run-tests*, testem*), *test-helpers/ and tsconfig/ are tooling. Facts re-gathered for every candidate.
3. Compatibility-only migrations — fixed: subjects with bump/upgrade are not tasks.
4. Harness-driven exclusions — accepted as a reported limitation; the policy is now fixed: the harness layout and sandbox are the same for every candidate and are not adapted per repository.
Consequences: werkzeug lost every start (all its tasks rewrite existing tests), textual took the Python slot (measured 42 s, pilot start 43 s, recipe b345a276acda); emberjs moved to its 2025-03-28 start (measured green, 51 s); helm re-measured at its new earliest start (network tests again). B files for textual and emberjs were written by fresh Claude subagents with only the view and the B rules; werkzeug B and the old emberjs B were removed.

### Round 3 findings (verbatim)

Verdict: blocking findings

Replay matches `corpus/selection.json`; `--check-b` passes. This is a **model check**, based on the supplied files. Reference regression suites were not executed.

**Round 2 status**

| Finding | Status | Verification |
|---|---|---|
| 1. References conflict with restored tests | Partially resolved | The cited Werkzeug and Ember tasks are gone. However, additive tests in the selected commit do not establish compatibility of its whole reference tree; see finding 2 below. |
| 2. Test infrastructure counted as product | Partially resolved | The cited `type-tests`, runners, helpers and `tsconfig/` patterns were added. Ember’s replacement still misclassifies blueprint tests; see finding 1. |
| 3. Compatibility-only Ember scenario | Resolved for the selected task | Bump/upgrade subjects are excluded. The replacement introduces observable strict-component generation behaviour. |
| 4. Harness-driven exclusions | Accepted limitation | `round2-responses.md:6` fixes the policy; `corpus/exclusions.json` retains the SSH-namespace and checkout-layout exclusions. |

The previously disclosed convenience sampling, unavailable measurement logs and unverifiable authorship chronology remain limitations. Task-text and acceptance review remain deferred as requested.

**Per-task assessment**

“Doubtful” below concerns the whole reference tree’s regression compatibility, not whether the requested change has observable behaviour.

| Repo | Task | Verdict | One-line reason |
|---|---|---|---|
| lazygit | single1 `1b0d3829` | ok | On-premises Azure pull-request URLs provide a directly testable output; existing cases plausibly remain valid. |
| lazygit | single2 `5e9ba82d` | ok | Fast-forwarding another worktree can be checked for correct updates and an untouched current worktree. |
| lazygit | scenario `2d193cb2` | ok | Editor destinations can be checked after intervening changes; no direct conflict with restored tests identified. |
| textual | single1 `748fc077` | doubtful | Footer/key-panel refresh is observable, but the reference inherits earlier visual changes; see finding 2. |
| textual | single2 `b7c7ad58` | doubtful | Punctuation keymaps can be tested through dispatched actions; the same inherited regression risk applies. |
| textual | scenario `e6c70b26` | doubtful | Alignment under minimum/maximum dimensions is observable; inherited snapshot changes remain unresolved. |
| emberjs | single1 `132b66a7` | doubtful | Strict route-template generation is behavioural; inherited deprecation cleanup threatens restored browser tests. |
| emberjs | single2 `8aa033db` | doubtful | Immediate rendering of runtime-compiled templates is behavioural; the same inherited cleanup applies. |
| emberjs | scenario `563798ed` | unsuitable | Strict component generation is behavioural, but this commit deletes test lines and violates §3.5. |

**B files**

Counts: **Lazygit 308, Textual 346, Ember 338**. Commands, layout and conventions are materially supported by the respective views’ manifests, Makefiles, runners and contributor documentation. I found **no material B inaccuracy or substantiated task-derived steering**. Content inspection cannot independently verify the recorded blind-authoring chronology.

**New findings**

1. **Blocking — Ember’s selected scenario bypasses the additive-test rule because blueprint tests are classified as product.**

   [`select.mjs:28`](/home/figielak/bench-work/review3/select.mjs:28) misses both `node-tests/` and the `*-test.js` naming convention. These are explicitly run as tests by `views/emberjs/package.json`.

   Recounting the scenario identifies **179 misclassified lines**: 38 in `component-test-test.js`, 120 in `component-test.js`, and **8 additions plus 13 deletions** in [`template-test.js`’s diff](/home/figielak/bench-work/review3/tasks/emberjs-scenario.txt:514). Product lines become **174**, still above the threshold, but `testDeletions` becomes **13**, making the commit ineligible. The stored facts incorrectly report 353 product lines and zero test deletions.

   Correcting just these known facts in memory changes the selected scenario to `2fe9ba31…`; that replacement’s diff is not supplied here.

   **Fix:** classify these tests correctly, regenerate all candidate facts, rerun selection, and review the resulting tasks before freezing. Keep shipped blueprint templates distinguished from tests of those blueprints.

2. **Should-fix — The claimed structural regression fix examines the wrong comparison for whole-tree references.**

   §3.5 defines the reference as the complete post-commit tree. Eligibility examines only the selected commit against its first parent.

   All three Ember references inherit `e698f0cf`, described as template-resolving deprecation cleanup with **251 deleted test lines** ([candidate evidence](/home/figielak/bench-work/review3/corpus/candidates.json:7103)). The restored start suite dereferences `DEPRECATE_COMPONENT_TEMPLATE_RESOLVING.isRemoved` during class definition ([example](/home/figielak/bench-work/review3/views/emberjs/packages/@ember/-internals/glimmer/tests/integration/components/component-template-test.js:25)). Removal of that entry would reproduce round 2’s collection failure.

   Likewise, all Textual references inherit `no-text-visual` and `true-dim`, recording 43 and 19 changed test files respectively, with substantial deletions ([candidate evidence](/home/figielak/bench-work/review3/corpus/candidates.json:35763)). Their cumulative diffs are absent, so restored snapshot compatibility remains doubtful—not a demonstrated failure.

   **Fix:** inspect cumulative start-to-reference changes and run the restored start suites on the complete references. This regression check can precede the separately scheduled behavioural-acceptance review. Exclude failing references and replay selection.
### Round 3 author responses

1. Blueprint tests counted as product: fixed (`node-tests/`, `*-test.js`/`*_test.js` are tests). The emberjs scenario then deletes test lines and is ineligible.
2. Whole-tree references inherit unrelated test changes: confirmed on the data. Within the 40-commit window, every candidate deletes or rewrites some start test within a few commits. User decision: the reference becomes the start plus the task commit only. Eligibility now requires that this change applies cleanly to the start (`git merge-tree`, `appliesToStart`). PROTOCOL §3.5/§4.2 still need the matching amendment.
Result of both fixes: no repository qualifies for the Go slot under the current scenario rule (merge, ≥ 3 branch commits). Relaxing the scenario to any eligible change of 150–1500 product lines would fill Go (caddy, hugo, lazygit, rclone) and web (eleventy, hexo, pdfjs), but still no Python candidate qualifies. Open: protocol decision (scenario definition, window size, Python candidate pool) before selection can be frozen.
