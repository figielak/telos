# Telos benchmark protocol

Status: **draft, not yet preregistered.** The final preregistration is the commit made after the pilot (§14); its hash and date are recorded in §14. Until then only dated entries in "Amendments" (end of file) may change this text.

## 0. Disclosure and scope

- **The Telos author designs, runs and reports this benchmark.** The author wrote the plugin, this protocol, the harness and the B instructions. The controls against that conflict of interest are structural (frozen selection, hidden acceptance, published evidence, an independent review), not a claim of neutrality. A reader should weigh the result accordingly.
- **Question.** Does Telos save tokens and improve results compared with bare Claude Code and a hand-written CLAUDE.md, on real repositories?
- **What is compared** (D-09): the *shipped default workflows* of each variant, not matched capabilities. The label "shipped default workflows" is used wherever a number from this benchmark is quoted.
- **No generalisation** beyond the measured repositories, start commits, Claude Code version and models (§12).
- Money is **API-equivalent USD** from the host's reported cost. Subscription usage is not cash.

## 1. Variants (D-02)

| Id | Name | Loaded instructions | Plugin |
|---|---|---|---|
| A | bare | none (no CLAUDE.md, no memory) | none |
| B | hand-written | one `CLAUDE.md` per `(repo, start)`, ≤ 400 words (§4.3) | none |
| C | Telos deep | Telos-generated CLAUDE.md block, `.telos/`, profile `deep` | Telos |
| D | Telos standard | same, profile `standard` | Telos |

Only C and D load Telos. A and B load no plugin, MCP server, memory or instruction file except B's CLAUDE.md. Five repetitions per `(task, variant)` cell. Repetitions measure run variability, not repository diversity.

## 2. Hypotheses (descriptive)

Units: **every single task and every multi-session scenario counts as one unit**, regardless of its number of sessions or repetitions. For each unit the five repetitions are reduced to a median, then compared pairwise (§9).

- **H1.** On multi-session scenarios, C and D cost less USD per accepted task than B.
- **H2.** On single small tasks, C and D are *not* cheaper than B (the prediction is a null or reversed result: setup and workflow overhead is not repaid by one small task).
- **H3.** C and D reduce the exploration proxy (§8.4) compared with A and B.
- **H4.** Acceptance rate of C and D is ≥ B's.
- **H5.** D costs less than C per accepted task, **and** for each task D's accepted runs ≥ C's accepted runs − 1 (denominator: the 5 runs of that task in that variant).

**Verdict rule**, applied per hypothesis and per comparison, over units:

- **supported**: the paired median difference favours the claim *and* ≥ 2/3 of units individually agree in direction;
- **contradicted**: ≥ 2/3 of units disagree in direction;
- **inconclusive**: anything else, including ties and fewer than 3 units.

Verdicts are descriptions of this sample. They are not significance tests, and no confidence is claimed beyond the stated units. With few units the report says "inconclusive" rather than rounding up.

## 3. Repositories and selection (D-04)

### 3.1 Repositories
BlueVest (Python) and knml.edu.pl (Astro) at the D-04 pins of phase 06 (BlueVest `4063adc`, knml.edu.pl `2a47a6d`), plus one third repository.

### 3.2 Third-repository criteria
Public; permissive licence (MIT, Apache-2.0, BSD or similar); test suite runs **offline** in under 2 minutes on the benchmark host; real history (≥ 200 commits, ≥ 3 contributors); a third stack (neither Python nor Astro/JavaScript web); larger than both other repositories by tracked-file count.

### 3.3 Frozen before tasks exist
Selection is frozen before any task text or acceptance exists:

- `bench/corpus/candidates.json`: every candidate considered, with source and date of discovery.
- `bench/corpus/exclusions.json`: every excluded candidate or commit with a one-line reason from a fixed list (licence, network tests, suite too slow, stack not new, too small, native CLAUDE.md or `.claude/` present at the commit, other: text).
- `bench/select.mjs` applies the selection rule deterministically (ties broken by lexicographic repository id or commit hash); its output is committed. No hand-picking after the output exists.
- **Start commits** (per repo): chosen by the same script from the candidate list under written rules (tests green at the commit; ≥ 1 task derivable from the next commits; no native CLAUDE.md or `.claude/`).

### 3.4 Independent review
One reviewer who is not the Telos author (another person, or a second model with a fresh context) reviews candidates, exclusions and the B files and records findings and the author's responses in `bench/corpus/REVIEW.md`. Unresolved objections are listed in the report.

## 4. Tasks, B instructions, acceptance

### 4.1 Task kinds
- **Single task**: one prompt, small scope.
- **Multi-session scenario**: one feature request delivered over several sessions (§6.2).

Task text is written once, per `(repo, start)`, after selection and B are frozen, and is identical across variants (A/B receive it as a plain prompt; C/D through the workflow in §6).

### 4.2 Hidden acceptance (D-06)
Each task has two checks, both run only after the agent exits:

1. **Behavioural**: tests that exercise public behaviour, not implementation details (no private names, no file layout, no exact call sequence). Alternative correct implementations must pass; the author documents at least one alternative per task and checks that it passes.
2. **Regression**: the repository's existing tests or build still pass.

Each acceptance check must fail at the start commit and pass for a reference solution. Acceptance is reviewed for implementation coupling (§3.4). A task is **accepted** only if both checks pass. The material is not readable during sessions (§5) and is mounted into a fresh directory only after every session of the cell has exited, then deleted.

### 4.3 B instructions (D-10)
Written per `(repo, start commit)` **from that historical state only**, before the tasks of that start are written. ≤ 400 words, counted by `bench/select.mjs --check-b`. The author records preparation minutes per file; the total is reported as B's setup effort. A start with a native CLAUDE.md or `.claude/` is excluded, so A and B never inherit instructions unintentionally.

## 5. Isolation by construction (D-08)

Every run is a fresh headless session in a disposable copy outside this repository; original repositories are never touched.

### 5.1 Checklist (all must hold, every variant)
1. **Dedicated OS user.** Sessions run as a benchmark-only user that can read only: the copy, the exported plugin runtime, and a fresh per-run `CLAUDE_CONFIG_DIR`. No read access to this repository's `bench/`, `test/`, `.telos/`, the acceptance material or the original repositories. A missing launcher is refused, never a silent fallback to the author's user.
2. **Copy without future.** `git clone --no-local` at the cell's start commit; one branch; no remotes, other refs or later tags; reflog expired; unreachable objects pruned. Symlinks that resolve outside the root are refused.
3. **Exported plugin runtime.** Only `skills`, `agents`, `hooks`, `shared`, `templates`, `lib`, `bin`, `.claude-plugin`; never the working checkout. C/D load the export of one pinned Telos commit.
4. **Pristine configuration.** Fresh `CLAUDE_CONFIG_DIR` per run; auto-memory disabled; ancestors of the copy, home configuration, managed settings and environment audited and recorded.
5. **No network content.** WebFetch and WebSearch disallowed; Bash network restricted to the model API through Claude Code's sandbox, in every variant.
6. **Acceptance mounted late** (§4.2).
7. **Recorded versions**: Claude Code, model IDs per turn, Telos commit and plugin version, profile, exact flags.

### 5.2 Canaries
Before the pilot and again in every campaign preflight, in **every variant**: planted instruction files in an ancestor directory and in the user's home configuration; a planted memory entry; attempts to read the acceptance directory and the bench tree; an attempt to fetch the upstream repository. Each canary must be absent from the loaded context or fail. Isolation is proven by canaries and by transcript inspection, **not** by init events listing plugins and tools. Any canary hit voids the affected runs and stops the campaign until fixed.

## 6. Workflows and transitions (D-05, D-09)

### 6.1 Setup keying and charging
C and D setups are keyed by `(repo, start commit, profile)`: `telos init --profile deep|standard` followed by `/telos:map` at exactly that start, so no map sees later code. A snapshot stores a content hash of (start commit, profile, Telos commit, map skill files); a mismatch invalidates and rebuilds it. **Setup cost is charged in full to every simulated trajectory** (each repetition), never divided across repetitions. B's setup is its preparation effort (§4.3, reported in minutes beside USD). A has no setup.

### 6.2 Single task
- A, B: the task text as one plain prompt, one fresh session.
- C, D: `/telos:quick <task text>`, one fresh session.

### 6.3 Multi-session scenario
**C and D**, deterministic and data-driven from `telos` CLI output; the runner makes no free-form judgement:

1. `/telos:plan <task text>` (fresh session).
2. `telos lint-plan`. Non-zero → scenario **failed** (reason recorded).
3. One scripted session answering with the fixed text "accept the recommended options" for every open question and every `[proposed]` decision (and `Awaiting user` entry).
4. `telos task set <ids> status=approved` for every generated task.
5. For each generated task in `depends` order: run `/telos:do` or `/telos:do-hard`, whichever `telos status` names as Next; one fresh session each. An `effort: hard` task therefore stops `/do` and is rerun with `/do-hard`, as shipped.
6. Any refusal, `blocked` task, unexpected `Next`, missing generated task or per-session timeout → scenario **failed** with its reason. A failed scenario is not accepted; its cost counts (§8.1).

After step 5 the phase is **not** closed; the acceptance check (§4.2) runs on the final work tree.

**A and B** receive the same task text as a plain prompt in the first session, then the scenario's fixed `steps[]` texts, written with the task in the manifest before any run (one fresh session per step, each told "continue the work in this repository: <step text>"). The step list is independent of what C/D generate, so A/B never depend on a C/D run.

### 6.4 Model and permission treatment (D-09)
- Every session starts with the same pinned model ID. Telos skill model overrides (opus for `plan`, `do-hard`, `map-hard`; sonnet elsewhere) and skill `allowed-tools` stay as shipped and **are part of the C/D treatment**. This is not a matched-model comparison.
- All variants share one permission mode and one base allow list. Skills may add grants in C/D as shipped; that is part of the treatment.
- Per-turn models, denied tool calls and effective grants are read from transcripts. Costs are reported **per model**.
- **Injected bundles:** every C/D step records the bundles it received (`telos budget --ctx`). Phase 06 finding F8 shows that profile `standard` still receives deep-critical `do` text, so "no deep-only skill takes effect" is never presented as lower loading cost.

## 7. Run rules

### 7.1 Order and cache (D-11)
- **Blocked randomization.** For every `(task, repetition)` block the four variants run back to back in a seeded random order; block order is also seeded; no `Math.random`. The seed is recorded.
- **Cache conditions** are fixed in advance: no deliberate cache warming or clearing; wall-clock gaps between cells are logged; `cache_read` is reported separately and never added to any total.
- Run order and the seed are published so a reader can reproduce the block structure.

### 7.2 Infrastructure failures
A host error **before the first turn** (no model output) allows ≤ 2 retries; each retry's usage and cost counts. Any other failure (timeout, crash after the first turn, denied tool, wrong answer) is a normal outcome: not retried, not accepted, fully costed. A missing usage field stays `null` and the run is marked unverified; it is never treated as 0.

### 7.3 Budget and cap (D-12)
- Total cap **$300 API-equivalent**. Every session runs with `--max-budget-usd` taken from a per-cell reservation set from the pilot's most expensive cell plus margin.
- A cell starts only if `spent + reservation ≤ remaining cap`; the cell's sessions share its reservation. Spend counts every attempt, retry, timeout, abandoned in-progress cell and setup.
- At the cap the campaign stops **without dropping repetitions** inside a started block, and the report lists the cells not run. The forecast is redone after the pilot and recorded; if the forecast exceeds the cap, the cell set shrinks only by amendment ("Amendments") before preregistration.

### 7.4 Resume
Records are written atomically with an in-progress marker. A cell with a marker but no record is rerun once; the abandoned attempt's spend is still counted. A resumed run must not duplicate a completed cell.

## 8. Metrics

### 8.1 Primary: USD per accepted task
`sum(cost_usd over all sessions, attempts, retries, timeouts and setup of the trajectory) / accepted count`, always shown **with the acceptance rate** (accepted ÷ attempted) and failure counts. Failed attempts, timeouts, failed scenarios and C/D setup are included in the numerator. A cell with zero accepted runs reports its cost and "n/a" per accepted task, not zero.

### 8.2 Secondary
- **fresh tokens** = `input_tokens + cache_creation_input_tokens`, always named *fresh*, never "total";
- `output_tokens`; `cache_read_input_tokens` (separate, never added); turns; sessions; wall time;
- cost and turns per model; denied tool calls; tool counts;
- edits outside the task's expected paths (`out_of_scope_paths`).

Host usage is the evidence. `telos budget` is a size proxy and is never presented as usage.

### 8.3 Setup and effort
C/D setup cost per trajectory (USD, fresh, wall); B preparation minutes per file and in total.

### 8.4 Exploration proxy (narrow, labelled so)
Calls and returned bytes (`tool_result` content length) of Read/Grep/Glob and read-like Bash commands (`cat`, `head`, `tail`, `sed -n`, `grep`, `rg`, `find`, `ls`, `git show|log|diff`) **before the first product-code mutation**, including subagent transcripts. Edits to `.telos/`, CLAUDE.md and other instruction files are not product-code mutations (so Telos state edits cannot hide exploration). Bash commands the classifier cannot place are counted separately. A missing or unparsable transcript yields `null` with `unverified: true`, never 0. The classifier is audited on real pilot transcripts (§14); misclassifications become amendments. The proxy is not a measure of understanding.

## 9. Analysis

- Report **medians and IQR** per `(task, variant)` over the 5 repetitions, then per unit (§2).
- **Paired differences by unit**: B−C, A−C, B−D, A−D, C−D (positive favours the second variant), on USD per accepted task, fresh tokens, acceptance rate and exploration. Aggregate across units by the median of unit differences, with the share of units agreeing.
- **Break-even over a declared deployment horizon**, independent of the repetition count: the horizon is a number of tasks in one repository (declared as 1, 5, 10 and 20 tasks; the report states which are extrapolation from measured per-task costs). For a trajectory of `n` tasks, Telos cost = setup (once) + `n` × median per-task cost; baseline cost = B preparation (once, converted to USD only if the author states a rate, otherwise reported in minutes) + `n` × median per-task cost. Report the **first crossover** (smallest `n` where Telos is cheaper) and the **sustained break-even** (smallest `n` after which it stays cheaper through the horizon). If none, say so.
- Verdicts exactly as §2. No p-values or confidence intervals presented as confirmatory.
- Cache effects: `cache_read` and inter-cell gaps are tabulated beside costs; the report notes any cell whose cost differs from its siblings in a way the gap log explains.

## 10. Evidence and redaction

Published per run: **sanitized event transcripts**, **patches** (copy vs start), **grading outputs** (exit code, output tail), the metrics row, and the run record (versions, flags, seed, cache gaps). Raw-file hashes alone are not evidence; they are kept only as pointers to the private originals.

**Redaction process** (`bench/lib/sanitize.mjs`): remove home paths, user names, e-mail addresses, API-key-like strings and absolute work directories from transcripts, patches and grading output; log hit counts per rule per file; a reviewer spot-checks a sample before publication. Redaction replaces text with typed placeholders and never edits tool-result structure or token counts, so metrics recompute from the published rows.

**Private, and why:** the unredacted raw transcripts (may contain host paths and account data), the hidden acceptance material until the report is published (to avoid contaminating later runs; it is published with the report), and API credentials. If a repository licence forbids republishing its text, patches and transcripts of that repository are published with the same redaction and a note, or the repository is excluded at §3.

## 11. Harness status
The harness lives in `bench/` (D-01) as dependency-free Node `.mjs`; its tests run in `npm test`. Everything needed to rerun is published: manifest, seed, harness commit, B files, task texts, Telos commit.

## 12. Known limitations

Disclosed in advance, carried from phase 06 (D-03):

- **F1** always-on listing cost: Telos adds ~363 measured tokens of skill/agent listings in every C/D session.
- **F2** §12 targets mean different things in different readings; this benchmark reports whole-session host usage, not Telos-attributable tokens.
- **F3** no per-step `do` attribution; do overhead is only visible by comparing C/D against A/B on the same task.
- **F4/F5** map refresh refusals and the unmeasured incremental refresh: setup always uses a full map at the start commit.
- **F7** plan skills cannot read some templates headless; C/D plans may differ in quality for this reason.
- **F8** standard still receives deep-critical `do` text; D is not "deep minus deep text". Recorded per step.
- **Sample size.** Three repositories, a small number of tasks and scenarios, five repetitions that measure variability, not diversity. Multi-session verdicts rest on a handful of units.
- **Single host version and model set.** Claude Code 2.1.316 at the time of phase 06 (final version recorded in §14), one pinned model ID; results may not transfer.
- **Shipped-workflow comparison.** C/D differ from A/B in models and permissions by design (§6.4); the benchmark cannot separate the effect of Telos' memory from its model routing.
- **Author-run.** §0.
- **Acceptance coverage.** Behavioural tests cannot prove an implementation correct; alternative implementations may be mis-graded.
- **F6 and F9** are fixed in this phase (07-01 and 07-08); their live confirmation is in `bench/PILOT.md`.

## 13. Mapping to the external plan review
The external plan review (`BENCHMARK-PLAN-REVIEW.md`, applied during phase 07 revise; not kept in the repository) listed these items. Each is answered here or named as a limitation.

| Item | Answer |
|---|---|
| BLOCKER snapshot chronology | §6.1 setup keyed `(repo, start, profile)`; B from the same historical state (§4.3) |
| BLOCKER hidden acceptance / network | §4.2 late mount; §5.1 dedicated user, export, no network; §5.2 retrieval canaries |
| BLOCKER model and permission equality | §6.4 labelled "shipped default workflows"; per-turn models and denials recorded |
| MAJOR isolation evidence | §5.1 items 4–5, §5.2 canaries beyond init events; "only C and D load Telos" (§1) |
| MAJOR pilot misses hardest workflow | §6.3 transitions, failure outcomes; §14 pilot covers a full scenario in C and D; injected bundles recorded (§6.4) |
| MAJOR amortization and caching | §6.1 setup per trajectory; §7.1 blocked randomization and cache conditions; §9 horizon, first and sustained break-even; B effort §4.3 |
| MAJOR corpus selection author-controlled | §3.3–3.4 frozen lists, script, independent review; §4.3 B word limit; §4.2 behavioural + regression + alternatives |
| MAJOR hypotheses exceed evidence | §2 units, H5 denominator, verdict thresholds; §8.1 acceptance rate beside USD; §12 sample size |
| MAJOR exploration biased | §8.4 first product-code mutation, shell and subagent activity, returned bytes, audit; named narrow proxy |
| MAJOR execution scope oversized | tasks 07-04, 07-11, 07-12 split; cap §7.3 with per-cell reservation; resume §7.4 (tests are in those tasks) |
| MAJOR hashes not auditable | §10 sanitized transcripts, patches and grading outputs published |
| MINOR B vs one-commit-per-task; pilot `--reps` override | task split 07-07/07-13; pilot uses `--reps 1` (§14) |

## 14. Pilot and final preregistration (D-07)

The pilot runs, with `--reps 1`: one complete multi-session scenario in **both** C and D, and one single task in all four variants, plus the isolation canaries (§5.2). It also: reinstalls the Telos plugin cache from the pinned commit (F9), confirms F6 live (a headless deep review finishes its diff continuation without a denial), verifies per-turn models, denied calls and injected bundles, audits the exploration classifier, and sets the per-cell reservation and forecast (§7.3). Pilot runs are excluded from results and published as the pilot.

After the pilot, PROTOCOL.md and the corpus are committed together as the **final preregistration**:

- Commit hash: _to be recorded after the pilot_
- Date: _to be recorded after the pilot_
- Claude Code version / model ID / Telos commit: _to be recorded after the pilot_

Nothing in the measured campaign may start before this commit. After it, this protocol changes only by a post-registration deviation note in the report, never by editing §2–§9.

## Amendments

Dated entries, allowed **only before the final preregistration commit** (§14). Each entry: date, section, change, reason. After that commit, deviations are listed in the report under "Deviations from the protocol", not here.

_No amendments yet._
