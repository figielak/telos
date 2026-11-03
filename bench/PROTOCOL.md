# Telos benchmark protocol

Status: **preregistered** (hash and date in §14). This text changes only by a post-registration deviation note in the report, never by editing §2–§9.

## 0. Disclosure and scope

- **The Telos author designs, runs and reports this benchmark.** The author wrote the plugin, this protocol, the harness and the B instructions. The controls against that conflict of interest are structural (frozen selection, hidden acceptance, published evidence, an independent review), not a claim of neutrality. A reader should weigh the result accordingly.
- **Question.** Does Telos save tokens and improve results compared with bare Claude Code and a static CLAUDE.md written with Claude (the way the author would normally write one), on real repositories?
- **What is compared** (D-09): the *shipped default workflows* of each variant, not matched capabilities. The label "shipped default workflows" is used wherever a number from this benchmark is quoted.
- **No generalisation** beyond the measured repositories, start commits, Claude Code version and models (§12).
- Money is **API-equivalent USD** from the host's reported cost. Subscription usage is not cash.

## 1. Variants (D-02)

| Id | Name | Loaded instructions | Plugin |
|---|---|---|---|
| A | bare | none (no CLAUDE.md, no memory) | none |
| B | static CLAUDE.md, written with Claude | one `CLAUDE.md` per `(repo, start)`, ≤ 400 words (§4.3) | none |
| C | Telos deep | Telos-generated CLAUDE.md block, `.telos/`, profile `deep` | Telos |
| D | Telos standard | same, profile `standard` | Telos |

Only C and D load Telos. A and B load no plugin, MCP server, memory or instruction file except B's CLAUDE.md. Five repetitions per `(task, variant)` cell. Repetitions measure run variability, not repository diversity.

## 2. Hypotheses and verdicts (descriptive)

### 2.1 Terms
- **Unit**: one single task or one multi-session scenario. Each unit counts once, regardless of its number of sessions, repetitions or the number of tasks Telos generates for it.
- **Run**: one repetition of a unit in one variant (one trajectory: every session of that repetition, plus its attributed setup, §6.1).
- **Accepted run**: a run whose final work tree passes the hidden acceptance (§4.2). A scenario run is one accepted run or none.
- **Per unit and variant** (`u`, `v`), over its 5 runs:
  - `acc(u,v)` = number of accepted runs (0–5);
  - `U(u,v)` = **USD per accepted run** = sum of the cost of all 5 runs / `acc(u,v)` (§8.1); `n/a` when `acc = 0`;
  - median and IQR of per-run cost, fresh tokens and exploration (§8.2, §8.4), each over the 5 runs separately.

### 2.2 Hypotheses
- **H1.** On multi-session scenarios, C and D have a lower `U` than B.
- **H2.** On single tasks, C and D are *not* cheaper than B: `U(C) ≥ U(B)`, likewise D (the prediction is a null or reversed result: setup and workflow overhead is not repaid by one small task).
- **H3.** C and D have a lower total exploration (§8.4: setup + execution, median per unit) than A and B, on all units.
- **H4.** C and D have `acc ≥ acc(B)`, on all units.
- **H5.** (a) D has a lower `U` than C, on all units; **and** (b) for **every** unit, `acc(D) ≥ acc(C) − 1`.

### 2.3 Comparing one unit
For one comparison (e.g. B vs C on H1) each included unit is classed as **agrees**, **tie** or **disagrees** with the claim:

- **Ties.** For USD, fresh tokens and exploration a tie is a difference of at most 1 % of the larger value; for `acc` a tie is equality.
- **Direction.** "Lower is better" for USD, tokens and exploration; "higher is better" for `acc`. The claim fixes which variant must be better.
- **Ties under a non-strict claim** (H2 "not cheaper", H4 "≥") **agree**. Under a strict claim (H1, H3, H5a) a tie is its own class: neither agrees nor disagrees, and it stays in the denominator.
- **Zero accepted runs.** `U = n/a` is treated as +∞ (worse than any number). Both variants `n/a` → the unit is **excluded** from that USD comparison and listed. Exactly one `n/a` → the other variant is better.
- **Missing data.** A run with a `null` cost (§7.2) makes `U` and the cost median of that unit-variant unverified; a `null` exploration (§8.4) does the same for exploration. An unverified value excludes the unit from that comparison only. `acc` is never missing: a run that could not be graded is not accepted.
- **Incomplete units.** Only units with all 5 blocks completed (§7.1, §7.3) enter verdicts. Units cut by the cap are reported descriptively and listed.

### 2.4 Verdict per comparison
Over the included units of one comparison:

- **supported**: ≥ 2/3 of included units agree, **and** the median of the unit differences points in the claim's direction (for a non-strict claim: is not against it);
- **contradicted**: ≥ 2/3 of included units disagree;
- **inconclusive**: anything else, including fewer than 3 included units.

Per hypothesis:

| | Units | Comparisons | Claim |
|---|---|---|---|
| H1 | scenarios | B vs C, B vs D | `U` lower in C/D (strict) |
| H2 | single tasks | B vs C, B vs D | `U` of C/D ≥ B (non-strict) |
| H3 | all | A vs C, A vs D, B vs C, B vs D | total exploration lower in C/D (strict) |
| H4 | all | B vs C, B vs D | `acc` of C/D ≥ B (non-strict) |
| H5 | all | C vs D | (a) `U` lower in D (strict); (b) per-unit floor |

**H5** is **supported** only if (a) is supported **and** (b) holds for every unit with 5 complete blocks; **contradicted** if (a) is contradicted **or** (b) fails on any unit (the report names the unit); otherwise **inconclusive**. Each H1–H4 verdict is reported per comparison; no comparison is merged into another.

Verdicts are descriptions of this sample. They are not significance tests, and no confidence is claimed beyond the stated units. With few units the report says "inconclusive" rather than rounding up.

## 3. Repositories and selection (D-04, amended)

### 3.1 Repositories
Up to three **public** repositories, one per stack slot: **Python**, **JavaScript web** and **Go**, all chosen by the same rule (§3.2, §3.3) from one recorded candidate pool (§3.3, amendment 2). A slot in which no repository qualifies stays empty and is reported (`unfilled` in `selection.json`, §12); at least two filled slots are required (amendment 3). Anyone can clone them and rerun the benchmark. The author's own repositories (BlueVest, knml.edu.pl, the phase 06 D-04 pins) move to round 2 together with the author's open-source project: at their pins, BlueVest has one product commit after the pin and no merge with ≥ 3 branch commits in its history, and knml.edu.pl ships a native `CLAUDE.md` with its Astro skeleton, so §3.3 and §3.5 cannot be met (amendment 1).

### 3.2 Repository criteria
Facts at the last first-parent commit before 2025-01-01, from git: permissive licence (MIT, Apache-2.0, BSD, ISC or similar, per GitHub's SPDX id or the licence file); real history (≥ 200 commits, ≥ 3 contributors); mid-size (300–3000 tracked files). Facts measured with `bench/corpus/measure-suite.sh` at the repository's earliest start that is usable from history (§3.3): the repository's own unit-test command passes **offline** (no network namespace, loopback only; a suite that fails offline but passes online is "network tests") in under 2 minutes, cold caches, on the benchmark host.

### 3.3 Frozen before tasks exist
Selection is frozen before any task text or acceptance exists:

- **Candidate pool.** One GitHub Search query (`search/repositories`) per slot, identical except `language:` (Python, JavaScript, Go): permissive licence (`license:` MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Unlicense, 0BSD), `pushed:>=2025-01-01`, `sort=stars`, `order=desc`, first 30 results. The query text, its date and the raw responses are committed under `bench/corpus/search/` (`query.json`, `<slot>.json`); the pool is what they list and nothing else.
- `bench/corpus/candidates.json`: generated from those responses by `node bench/select.mjs --manifest bench/corpus --pool bench/corpus/search` (order: slot, stars descending, id), never edited by hand; `--check` fails when it differs. `node bench/select.mjs --gather <clone> --repo <id> --manifest bench/corpus` adds each candidate's git facts and `starts[]`.
- `bench/corpus/suites.json` + `suites.jsonl`: the suite recipe per repository and every measurement (`measure-suite.sh` output, one line per run). A recipe follows the repository's own CI or contributor docs at the measured start and is written before measuring. It may be corrected only when its test command did not execute the suite (a recipe or host error, e.g. a missing script, an unresolvable install, a full `/tmp`), never after the suite ran and failed; both runs stay in `suites.jsonl` and the correction is listed in `REVIEW.md`. Measurements run under a memory cap (systemd unit, `MemoryMax`) with `TMPDIR` outside `/tmp`.
- `bench/corpus/exclusions.json`: candidates or commits excluded by hand, with a one-line reason from a fixed list (licence, network tests, suite too slow, too small, too large, native CLAUDE.md or `.claude/` present at the commit, other: text). Exclusions the rule derives are listed in its output with the same reasons.
- `bench/select.mjs` applies the selection rule deterministically (ties broken by lexicographic repository id or commit date and hash); its output `bench/corpus/selection.json` is committed. No hand-picking after the output exists.
- **Rule.** A repository qualifies when it meets the static criteria, has at least one start usable from history, and its measured suite is offline and under 2 minutes. Per slot, the qualifying repository with the **shortest suite** is selected.
- **Start commits.** Candidates per repository: the last first-parent commit before 2025-01-01, 2025-04-01, 2025-07-01, 2025-10-01 and 2026-01-01. A start is usable from history when it has no native `CLAUDE.md`, `CLAUDE.local.md` or `.claude/` and the task quota of §3.5 is derivable from its next 100 first-parent commits (the task window); it is used when, in addition, the suite passes offline at it. The earliest used start is measured; the next one is the pilot start (§3.6).
- **Frozen.** These rules are frozen by the commit that records the pool (07-07). The one run from scratch (07-14) applies them without changing them. Objections raised later by the review of §3.4 go to the report as limitations (§12), not into the rules.

### 3.4 Independent review
Candidates, exclusions, the B files, the task texts and `steps[]` (§6.3) and the acceptance material are reviewed for selection bias, implementation coupling and hint leakage. The reviewer is not the Telos author. Its kind is recorded and reported as one of:

- **human review**: another person; preferred;
- **model check**: a second model with a fresh context and no access to this repository's history or the author's notes. It is reported as "model check", never as an independent human review, and §12 lists it as a limitation.

Findings and the author's responses are recorded in `bench/corpus/REVIEW.md`. Unresolved objections are listed in the report.

### 3.5 Task quota and derivation
Per repository: **2 single tasks and 1 multi-session scenario** at the measured start commits (per selected repository; 3 repositories → 6 single tasks, 3 scenarios, 9 units, 2 → 4 single tasks, 2 scenarios, 6 units). The quota changes only by amendment before preregistration (§7.3 forecast).

`bench/select.mjs` derives tasks from the next 100 first-parent commits after each start commit (the **task window**), in chronological order. A commit (or merge, measured against its first parent) is **eligible** when it:

- changes **product** files, which excludes tests, docs (`*.md`, `*.rst`, `docs/`, `README*`, `examples/`), CI, dependency manifests and lockfiles, and build/test tooling (root dotfiles, `*.config.*`, `tsconfig`/`jsconfig`, test runners and helpers, `Makefile`, …; `type-tests/` count as tests; the exact list is `NOT_PRODUCT` in `bench/select.mjs`);
- **also changes tests, adding lines only** (no deleted test lines), so behaviour is testable and the restored original suite (§4.2) can still hold at the reference; tooling-only changes drop out;
- is not a typo or spelling fix, bump or upgrade (subject mentions typo, spelling, codespell, bump or upgrade) and not a merge of an integration branch (`release`, `develop`, `dev`, `stable`, `main`, `master`);
- is not excluded by hand in `exclusions.json` (`<repo>@<hash>`), e.g. because its reference fails the regression check.

Then:

- **Single task**: the first two eligible commits with ≤ 5 changed product files and ≤ 150 changed product lines.
- **Scenario**: the first other eligible change (commit or merge, never one of the two singles) with 150–1500 changed product lines. There is no minimum number of branch commits.
- The **reference solution** is the **start tree plus the task commit's own diff** (that commit against its first parent), not the commit's own tree. The diff must apply cleanly to the start tree (`git merge-tree`); otherwise the commit is skipped with the reason "does not apply" and the next eligible one is taken. A candidate whose reference fails the regression check (§4.2) is excluded by hand with its reason, and rerunning the rule takes the next one.
- The **pilot start** (§3.6) must derive tasks disjoint from the measured start's; a start whose tasks overlap is skipped with that reason.

The author then writes the task text from the reference diff and its commit messages, without reading later history.

### 3.6 Pilot material
The pilot (§14) uses tasks derived by the same rules from a **separate pilot start commit** in one repository: the next eligible start after the measured ones. Pilot tasks never enter the measured set. Pilot results may set only harness parameters (reservations, timeouts, classifier rules, isolation fixes), each by amendment. They never change measured task texts, `steps[]`, acceptance or B files.

## 4. Tasks, B instructions, acceptance

### 4.1 Task kinds
- **Single task**: one prompt, small scope.
- **Multi-session scenario**: one feature request worked over several sessions (§6.3).

Task text is written once, per `(repo, start)`, after selection and B are frozen, and is identical across variants (A/B receive it as a plain prompt; C/D through the workflow in §6). For a scenario the **task text** is the manifest's `steps[]` joined in order by blank lines; it is the complete requirement (§6.3).

### 4.2 Hidden acceptance (D-06)
Each task has two checks, both run only after every session of the run has exited:

1. **Behavioural**: new tests that exercise public behaviour, not implementation details (no private names, no file layout, no exact call sequence). Alternative correct implementations must pass; the author documents at least one alternative per task and checks that it passes.
2. **Regression**: the repository's **original** test suite or build at the start commit, with its tests restored unchanged (below).

Validation before preregistration, per task: behavioural tests **fail** at the start commit and **pass** on the reference solution; regression **passes** on both.

**Original suite.** Before grading, every test file of the start commit's suite (listed in the acceptance material) is restored to its start-commit content; deleted ones are re-created. Tests added by the agent are not run. The agent therefore cannot improve the result by deleting, skipping or weakening tests. Changes to existing tests are recorded per run (`tests_modified`, §8.2).

Acceptance is reviewed for implementation coupling (§3.4). A run is **accepted** only if both checks pass. The material is not readable during sessions (§5). It is mounted into a fresh directory only after every session of the run has exited, and is then deleted.

### 4.3 B instructions (D-10)
Written per `(repo, start commit)` **from that historical state only**, before the tasks of that start are written. Author: Claude (a fresh session with no task knowledge would be ideal; here the 07-07 session, which had not derived the tasks yet when the drafts were written), working from a `prepareCopy` view of the start, at the benchmark author's direction and without human edits, which is how the author would normally produce a CLAUDE.md. It is reported as *model-written static instructions*, never as human-written. ≤ 400 words, counted by `bench/select.mjs --check-b`. The author records preparation minutes per file; the total is reported as B's setup effort. A start with a native CLAUDE.md or `.claude/` is excluded, so A and B never inherit instructions unintentionally.

## 5. Isolation by construction (D-08)

Every run is a fresh headless session in a disposable copy outside this repository; original repositories are never touched.

### 5.1 Checklist (all must hold, every variant)
1. **Dedicated OS user.** Sessions run as a benchmark-only user that can read only: the copy, the exported plugin runtime (C/D only), a fresh per-run `CLAUDE_CONFIG_DIR`, and the system and that user's static home. No read access to this repository's `bench/`, `test/`, `.telos/`, the acceptance material, other cells' dirs or the original repositories. All cells share that user, so what it leaves in the shared temp roots (`/tmp`, `/var/tmp`, `/dev/shm`, the sandbox's `$TMPDIR` included) is removed before every cell, and one runner holds a work dir at a time. A missing launcher is refused, never a silent fallback to the author's user.
2. **Copy without future.** `git clone --no-local` at the cell's start commit; one branch; no remotes, other refs or later tags; reflog expired; unreachable objects pruned. Symlinks that resolve outside the root are refused.
3. **Exported plugin runtime.** Only `skills`, `agents`, `hooks`, `shared`, `templates`, `lib`, `bin`, `.claude-plugin`; never the working checkout. C/D load the export of one pinned Telos commit.
4. **Pristine configuration.** Fresh `CLAUDE_CONFIG_DIR` per run; auto-memory disabled; a `CLAUDE.md`, `CLAUDE.local.md` or `.claude` in any ancestor of the copy refuses the cell; home configuration, managed settings and environment audited and recorded.
5. **No network content.** WebFetch and WebSearch disallowed; Bash network restricted to the model API through Claude Code's sandbox, in every variant.
6. **Acceptance mounted late** (§4.2).
7. **Recorded versions**: Claude Code, model IDs per turn, Telos commit and plugin version, profile, exact flags.

### 5.2 Canaries
Before the pilot and again in every campaign preflight, in **every variant**: planted instruction files in an ancestor directory and in the user's home configuration; a planted memory entry; a planted trace of a previous cell in the sandbox's `$TMPDIR`; attempts to read the acceptance directory and the bench tree, to enter other cells (their names can be listed, amendment of 2026-11-03), to list the repository mirrors and snapshots and, in A and B, the plugin export; an attempt to fetch the upstream repository. Each canary must be absent from the loaded context or fail. Isolation is proven by canaries and by transcript inspection, **not** by init events listing plugins and tools. Any canary hit voids the affected runs and stops the campaign until fixed.

## 6. Workflows and transitions (D-05, D-09)

### 6.1 Setup keying and charging
C and D setups are keyed by `(repo, start commit, profile)`: `telos init --profile deep|standard` followed by `/telos:map` at exactly that start, so no map sees later code. A snapshot stores a content hash of (start commit, profile, Telos commit, map skill files); a mismatch invalidates and rebuilds it.

- **Attributed cost.** Setup cost and setup exploration are charged in full to every run that uses the snapshot (each repetition), never divided across repetitions. All per-run metrics (§2, §8) use attributed setup.
- **Campaign spend.** Each snapshot is paid once. The cap (§7.3) counts only what was actually paid. The report shows both numbers.

B's setup is its preparation effort (§4.3, reported in minutes beside USD). A has no setup.

### 6.2 Single task
- A, B: the task text as one plain prompt, one fresh session.
- C, D: `/telos:quick <task text>`, one fresh session.

### 6.3 Multi-session scenario
**C and D** are deterministic and data-driven from `telos` CLI output; the runner makes no free-form judgement. Every step is one fresh session, and its cost counts toward the run:

1. `/telos:plan <task text>`.
2. `telos lint-plan` (CLI, no session). Non-zero → run **failed**.
3. One scripted session, `/telos:revise accept the recommended options`, the shipped way to confirm: the fixed text answers every open question, every `[proposed]` decision and every `Awaiting user` entry.
4. `/telos:approve`. It activates the phase, approves the draft tasks, sets `task` and `Next`, commits and tags inside the copy. Afterwards every generated task must be `approved`; any task left `draft` or blocked → run **failed**.
5. **Execution loop.** Read `Next` from `telos status` and act on it:
   - `/telos:do` or `/telos:do-hard <id>` → run exactly that command. `telos status` already routes `effort: hard` tasks to `/telos:do-hard`, so `/telos:do` is never used on them. A `/telos:do` that blocks a task sets `Next` to `/telos:do-hard <id>`: that is the shipped escalation, and the loop follows it.
   - `close phase <NN> (/telos:done)` with every generated task `done` → the loop **ends**. The phase is not closed.
   - anything else (`fix <id> by hand: …`, `finish <id>: …`, `/telos:approve`, a different phase) → run **failed**, the `Next` value recorded.
6. **Failure conditions** besides the above: a session ends with `REFUSED:`, or leaves `Next` and all task states unchanged; a session or run timeout (§7.2); more than 2 × (number of generated tasks) sessions in the loop. A failed run is not accepted; its cost counts (§8.1).

The acceptance check (§4.2) runs on the final work tree.

**A and B.** The first session receives the full task text as a plain prompt. Each later session receives `continue the work in this repository: <step text>` for `steps[1]`, `steps[2]`, …, in order.

**Equal requirements.** The full requirement reaches every variant at the start: A/B in their first prompt, C/D in `/telos:plan`. Each step text is a verbatim part of the task text, so later sessions add no requirement, hint, file name, test or acceptance information. The independent review (§3.4) checks this. The step list is fixed in the manifest before any run and does not depend on what C/D generate, so A/B never depend on a C/D run.

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

### 7.2 Failures, retries and time limits
- **Pre-first-turn host error** (no model output in the attempt): ≤ 2 retries per session. Each retry's usage and cost counts.
- **Every other failure** (timeout, crash after the first turn, denied tool, wrong answer, budget stop) is a normal outcome: not retried, not accepted, fully costed.
- **Time limits**: 30 minutes of wall time per session; 4 hours per scenario run. The pilot may change these values only by amendment.
- **Usage limit** (the host ends a session with HTTP 429, e.g. a subscription window): not a run outcome. The cost counts, the attempt is kept apart from the records, the campaign stops, and the cell runs again from a fresh copy on resume. The report lists every such attempt.
- A missing usage field stays `null` and the run is marked unverified; it is never treated as 0.

### 7.3 Budget and cap (D-12)
- Total cap **$300 API-equivalent**. `S` = actual campaign spend so far: every attempt, retry, timeout, abandoned attempt and each snapshot paid (§6.1), the pilot included. The runner counts only its own spend, so the campaign runs with `--cap-usd 242`: $300 minus the pilot's spend (`bench/PILOT.md`).
- **Cell reservation** `R(cell)`: one value for every cell, **$3.88**, which is the pilot's most expensive cell ($1.94, setup included) × 2 (`bench/PILOT.md`, amendment below). A block's reservation `R(block)` = the sum of its four cells, plus the full setup cost estimate for any snapshot the block needs and that is not yet built.
- **A block starts only if `S + R(block) ≤ $300`.** Once started, a block completes all four variants, even if overshoot by the host's budget stop pushes `S` past the cap.
- Every session runs with `--max-budget-usd` = `R(cell)` − spend of that cell so far. The cell's sessions share its reservation. A session stopped by this budget is a normal failure (§7.2).
- When the next block cannot start, the campaign stops; the report lists the blocks not run. The forecast is redone after the pilot and recorded. If the forecast for the full matrix exceeds the cap, the quota (§3.5) shrinks only by amendment before preregistration.

### 7.4 Resume
Records are written atomically with an in-progress marker. §7.2 takes precedence: resume never grants a retry that §7.2 forbids.

- A cell with a marker but no record: the abandoned attempt's transcript decides. **No model output** → treated as a pre-first-turn host error (counts toward the 2 retries of §7.2) and rerun. **Model output present** → final failed record with the cost from the transcript, or `null` and unverified if it is unreadable.
- For a scenario run interrupted by the harness between sessions, with no session in progress: it continues from the next session if its work copy is intact, otherwise it fails.
- Spend of every abandoned attempt counts toward `S`. A resumed campaign never duplicates a completed cell.

## 8. Metrics

### 8.1 Primary: USD per accepted run
`U(u,v)` = sum over the 5 runs of (cost of every session, attempt, retry and timeout of the run + attributed setup, §6.1) / `acc(u,v)`. Failed runs, timeouts, failed scenarios and C/D setup are in the numerator. `acc = 0` → `n/a`, never zero, and the summed cost is still reported. `U` is always shown beside the acceptance rate (`acc` / 5) and the failure counts by reason. The median and IQR of the per-run cost are reported beside `U`; `U` itself is not a median.

### 8.2 Secondary
- **fresh tokens** = `input_tokens + cache_creation_input_tokens`, always named *fresh*, never "total";
- `output_tokens`; `cache_read_input_tokens` (separate, never added); turns; sessions; wall time;
- cost and turns per model; denied tool calls; tool counts;
- edits outside the task's expected paths (`out_of_scope_paths`); changes to existing tests (`tests_modified`, §4.2).

All medians and IQRs are per unit-variant over the 5 runs. Host usage is the evidence. `telos budget` is a size proxy and is never presented as usage.

### 8.3 Setup and effort
C/D setup cost per run (attributed, §6.1) and per snapshot (paid), in USD, fresh tokens and wall time. B preparation minutes per file and in total.

### 8.4 Exploration proxy (narrow, labelled so)
**Counted calls**: Read/Grep/Glob and Bash commands whose pipeline head is read-like (`cat`, `head`, `tail`, `sed -n`, `grep`, `rg`, `find`, `ls`, `git show|log|diff`), including subagent transcripts. A filter after a `|` reads only the head's output, and heredoc bodies and quoted text are not commands. Both the number of calls and the returned bytes (`tool_result` content length) are counted.

- **Execution exploration**: counted calls **before the first product-code mutation of each session**, applied separately in every session of the run and summed over the run's sessions. A session without any product-code mutation (plan, answers, approve, an A/B session that only reads) counts all of its calls.
- **Setup exploration**: every counted call of the `/telos:map` session(s), attributed to each run as in §6.1. It is 0 for A. For B it is 0 by construction; the author's own reading is not measured, and §12 says so.
- **Total** = setup + execution. H3 uses the total. All three are reported, so moving code reading into setup cannot hide it.

Edits to `.telos/`, CLAUDE.md and other instruction files are not product-code mutations, so Telos state edits cannot end the counting window. Bash commands the classifier cannot place are counted separately. A missing or unparsable transcript yields `null` with `unverified: true`, never 0. The classifier is audited on real pilot transcripts (§14); misclassifications become amendments. The proxy is not a measure of understanding.

## 9. Analysis

- Report per unit-variant: `acc`, `U`, and medians and IQR of per-run cost, fresh tokens and exploration (§2.1).
- **Paired differences by unit** for every comparison of §2.4 plus A−C, A−D on USD, fresh tokens, `acc` and exploration. Every difference is reported **signed so that positive favours the second-named variant**: for USD, tokens and exploration as (first − second), for `acc` as (second − first). Aggregate across units by the median of unit differences, with the counts agree / tie / disagree / excluded.
- **Break-even over a declared deployment horizon**, independent of the repetition count: the horizon is a number of tasks in one repository (declared as 1, 5, 10 and 20 tasks; the report states which are extrapolation from measured per-task costs). For a trajectory of `n` tasks, Telos cost = setup (once, paid) + `n` × median per-task cost; baseline cost = B preparation (once, converted to USD only if the author states a rate, otherwise reported in minutes) + `n` × median per-task cost. Report the **first crossover** (smallest `n` where Telos is cheaper) and the **sustained break-even** (smallest `n` after which it stays cheaper through the horizon). If none, say so.
- Verdicts exactly as §2.3–§2.4. No p-values or confidence intervals presented as confirmatory.
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
- **Sample size.** Two or three repositories (one per filled slot), 2 single tasks and 1 scenario each (§3.5), five repetitions that measure variability, not diversity. Each multi-session comparison rests on 3 units, so a single unit decides between "supported" and "inconclusive".
- **Empty slot.** A stack slot with no qualifying repository stays empty (§3.1, amendment 3); the report names it and draws no conclusion for that stack. In the 07-14 run the Python slot was empty: no candidate's suite was green offline in under 2 minutes at its start on the benchmark host (`bench/corpus/REVIEW.md`).
- **Pool bias.** The pool is the 30 most-starred permissively licensed repositories per language that were pushed in 2025 or later (§3.3): popular, active and large. Archived or documentation-only repositories are not filtered out; they fail the size, test or task criteria. Rules were frozen before the run (§3.3), so a poor fit is reported, not repaired.
- **Single host version and model set.** Claude Code 2.1.316 at the time of phase 06 (final version recorded in §14), one pinned model ID; results may not transfer.
- **Shipped-workflow comparison.** C/D differ from A/B in models and permissions by design (§6.4); the benchmark cannot separate the effect of Telos' memory from its model routing.
- **Scripted answers.** C/D scenarios answer every open question with "accept the recommended options" (§6.3); a real user may answer differently.
- **Ignored `.telos/`.** `telos init` does not undo a repository rule that ignores it (lazygit's `.gitignore` has `.*`), so `git add .telos/…` in shipped workflows meets an ignored path and Telos state may stay uncommitted there. This is shipped behaviour, measured as is.
- **Exploration classifier.** It reads command text: `awk` on a file and scripts that read files count as non-reading, and `sed` without `-n` too.
- **B exploration unmeasured.** The author's reading while writing B files is reported only as minutes (§4.3, §8.4).
- **Author-run.** §0. When the review of §3.4 is a model check, not a human review, the report says so here.
- **Acceptance coverage.** Behavioural tests cannot prove an implementation correct; alternative implementations may be mis-graded.
- **F6 and F9** are fixed in this phase (07-01 and 07-08); their live confirmation is in `bench/PILOT.md`.
- **Interpreter edits and exploration.** Edits made through an interpreter (`python3 - <<EOF`) are not seen as product mutations, so the §8.4 counting window stays open longer in those sessions, in any variant.
- **Repositories that ignore `.telos/`.** lazygit's `.gitignore` contains `.*`. There `/telos:approve` cannot commit the plan or create its tag, and `/telos:review` refuses to run. The benchmark measures this as shipped.

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
| MAJOR corpus selection author-controlled | §3.3–3.5 frozen lists, script, task derivation, independent review; §4.3 B word limit; §4.2 behavioural + regression + alternatives |
| MAJOR hypotheses exceed evidence | §2 units, per-hypothesis rules, H5 per-unit floor; §8.1 acceptance rate beside USD; §12 sample size |
| MAJOR exploration biased | §8.4 per-session first product-code mutation, setup + execution totals, shell and subagent activity, returned bytes, audit; named narrow proxy |
| MAJOR execution scope oversized | tasks 07-04, 07-11, 07-12 split; cap §7.3 with per-block reservation; resume §7.4 (tests are in those tasks) |
| MAJOR hashes not auditable | §10 sanitized transcripts, patches and grading outputs published |
| MINOR B vs one-commit-per-task; pilot `--reps` override | task split 07-07/07-13; pilot uses `--reps 1` (§14) |

## 14. Pilot and final preregistration (D-07)

The pilot runs on the pilot material of §3.6, with `--reps 1`. It covers one complete multi-session scenario in **both** C and D, one single task in all four variants, and the isolation canaries (§5.2). It also:

- reinstalls the Telos plugin cache from the pinned commit (F9);
- confirms F6 live (a headless deep review finishes its diff continuation without a denial);
- verifies per-turn models, denied calls and injected bundles;
- audits the exploration classifier;
- sets the cell reservations, time limits and forecast (§7.2, §7.3).

Pilot runs are excluded from results, published as the pilot, and their spend counts toward the cap.

After the pilot, PROTOCOL.md and the corpus are committed together as the **final preregistration**:

Final preregistration: _hash recorded by the commit that follows it_

- Commit hash: _recorded by the commit that follows it_
- Date: 2026-11-03
- Claude Code version / model ID: 2.1.316 / `claude-sonnet-5-5`
- Telos commit: the commit that records this hash; it changes only this section, `bench/PILOT.md` and `.telos/`, so the plugin runtime is the preregistered one

Nothing in the measured campaign may start before this commit. After it, this protocol changes only by a post-registration deviation note in the report, never by editing §2–§9.

## Amendments

Dated entries, allowed **only before the final preregistration commit** (§14). Each entry: date, section, change, reason. After that commit, deviations are listed in the report under "Deviations from the protocol", not here.

- **2026-11-01 · §2, §8.1, §9 · metric and verdicts.** `U` is defined as the cost of all 5 runs divided by the accepted runs, not a median. Medians and IQR now apply to per-run cost, tokens and exploration. Added explicit rules for zero accepted runs, missing data and incomplete units, plus a per-hypothesis table with direction, ties (agree under ≥ and "not cheaper"), the per-unit H5 floor and signed differences. A scenario is one accepted run at most. *Reason:* the draft mixed a median with a ratio, applied one sign to every metric and made ties inconclusive even where the claim is non-strict (second review).
- **2026-11-01 · §6.3 · C/D transitions.** `/telos:approve` replaces `telos task set … status=approved` and its cost counts. The loop follows `Next` as `telos status` shows it, which already routes hard tasks to `/telos:do-hard`. It also follows the shipped `/do` → `/do-hard` escalation after a block. It ends on `close phase`. Added an explicit list of failing `Next` values and a session limit. *Reason:* `task set` changes only task status and leaves `Next` stale, and the old "/do stops and is rerun" contradicted the shipped routing (verified in `lib/status.mjs` and `shared/do.md`).
- **2026-11-01 · §4.1, §6.3 · equal requirements.** The scenario task text is `steps[]` joined, and it is delivered in full to every variant at the start. Each step is a verbatim part of it. *Reason:* A/B steps could otherwise carry requirements or hints that C/D never get.
- **2026-11-01 · §4.2 · acceptance validation.** Behavioural tests fail at the start and pass on the reference. Regression passes on both and runs on the restored original suite. *Reason:* "every check fails at start" contradicted green regression at the start commit, and agents could game regression by editing tests.
- **2026-11-01 · §6.1, §7.2–§7.4 · budget and resume.** Reservation is per block, with the condition `S + R(block) ≤ $300` on actual spend. Paid setup and attributed setup are separate. §7.2 takes precedence over resume. Session and scenario time limits were added. *Reason:* the draft double-counted spend, could not guarantee a started block's completion and had contradicting retry and resume rules.
- **2026-11-01 · §8.4 · exploration.** Setup (map) exploration and execution exploration are reported separately and summed; the mutation boundary applies per session. *Reason:* otherwise C/D could move code reading into the uncounted setup.
- **2026-11-01 · §3.4–§3.6, §12, §14 · corpus.** Added a task quota (2 single + 1 scenario per repository), a deterministic task derivation rule, separate pilot material, and a distinction between human review and model check. *Reason:* these were left to judgement after selection.
- **2026-11-01 · §3.1–§3.3 · three public repositories (amendment 1, user decision in 07-07).** BlueVest and knml.edu.pl are replaced by three public repositories, one per slot (Python, JavaScript web, Go), all chosen by the same rule. The rule checks static facts, then whether a start is usable from history, then the measured suite. The shortest suite wins each slot. Start candidates are the last first-parent commits before five fixed dates, and the task window is 40 commits. The size criterion is now 300–3000 tracked files instead of "larger than both". *Reason:* at the D-04 pins neither repository can meet §3.3/§3.5 (see §3.1), and public repositories make the benchmark rerunnable by anyone.
- **2026-11-01 · §0, §1, §4.3 · B authorship (user decision in 07-07).** B is a static CLAUDE.md written by Claude from the start view at the author's direction, without human edits, instead of a hand-written one (D-02). Setup effort is reported as model minutes. *Reason:* this matches how the author, and many users, actually write a CLAUDE.md. The model check (REVIEW.md, finding 8) required that it not be labelled hand-written.
- **2026-11-01 · §3.5 · task eligibility (model check, 07-07).** Task commits must change product code and tests. Typo fixes, integration-branch merges and build/test tooling no longer count as product. Hand exclusions apply to task commits. The pilot must not share tasks with the measured start. *Reason:* the model check found a version bump, a spelling fix and a test-runner migration among the derived tasks, along with a pilot that duplicated the measured tasks.
- **2026-11-01 · §3.1–§3.5, §4.2 · corpus rules made satisfiable and frozen (amendment 2, user decision in the 07-07 revise).** Five points. (1) The pool is one recorded, dated GitHub Search query per slot (identical except `language:`; permissive licence, pushed 2025 or later, sorted by stars, first 30), with raw responses committed under `bench/corpus/search/`; it replaces the convenience sample, and `candidates.json` is generated from it with `--pool`. (2) The scenario is the first other eligible change (commit or merge) with 150–1500 product lines; the ≥ 3-commit branch rule is dropped. (3) The task window is the next 100 first-parent commits instead of 40. (4) The reference is the start tree plus the task commit's own diff, which must apply cleanly (`git merge-tree`), else the task is skipped with "does not apply"; regression is the start's restored tests, unchanged. (5) The rules are frozen by this commit: 07-14 runs them once from scratch without rule changes, and later review objections go to the report as limitations (§3.4, §12). *Reason:* with the reference defined as start plus the task diff and the 3-commit branch rule, no Python candidate of the convenience sample yielded the §3.5 quota and the Go and web slots only filled after relaxing the scenario rule (REVIEW.md, Superseded rounds); rules that cannot be met are fixed once, before the run, instead of being tuned to a chosen sample.
- **2026-11-01 · §3.5 · regression-compatible tasks (model check round 2, 07-07).** Task commits may only add test lines. Bumps and upgrades are not tasks. Test runners, test helpers and `tsconfig/` are tooling, and `type-tests/` are tests. *Reason:* two derived references rewrote or deleted existing tests (werkzeug 302→303 redirects, an ember deprecation removal), so the restored original suite would have failed them. The ember scenario was a dependency upgrade with 149 product lines once tooling was classified correctly. Result: werkzeug lost every start and textual took the Python slot; ember moved to its 2025-03-28 start.
- **2026-11-02 · §3.1, §3.3, §3.5, §12 · an empty slot stays empty (amendment 3, user decision after the 07-14 run).** A slot with no qualifying repository no longer stops selection: `selection.json` lists it under `unfilled`, the benchmark runs on the filled slots (at least two), and §12 reports the gap. Suite recipes follow the repository's CI or docs at the measured start, are written before measuring and may be corrected only when the test command did not execute the suite; measurements run under a memory cap with `TMPDIR` outside `/tmp`. *Reason:* the one run from scratch (07-14) left the Python slot empty under the frozen rules; growing the pool would cost hours of measurement with the same pool shape (GPU frameworks, network-bound tests), so the user chose to proceed with Go and web and report Python as a limitation. The recipe rule records the criterion already applied in 07-14 (REVIEW.md §Deviations).
- **2026-11-02 · §3.6 · pilot material from the measured start (amendment 4, user decision before the pilot).** No repository has a second start that yields the §3.5 quota (`selection.json`: `pilotStart` is `null` for both), so the pilot takes its tasks from the measured start of the Go repository (lazygit `1e1fba4c`), continuing the same derivation past the quota: the next eligible single and the next eligible scenario, skipping a task whose reference fails regression on the restored original suite. Single `ab7b5f6d` (undo of a commit as a soft reset), scenario `16f53487` (keybinding validation); `a1a8cd11` was skipped because its reference only passes with a line it adds to an existing test (`SetCustomBranches` in `branches_test.go`; the restored suite panics). The material lives in `bench/pilot/` (own manifest, B file identical to the measured one for this `(repo, start)`, hidden acceptance built and calibrated with the same tools) and never enters `bench/corpus/manifest.json`. The pilot shares the measured start and its C/D setup key, so it runs in its own work dir and its snapshots are never reused by the campaign. *Reason:* §3.6 cannot be met as written; reusing measured tasks would violate it more, and this keeps the derivation rule.
- **2026-11-03 · §5.1 item 1, §5.2, bench/README · how the read set is enforced (replaces the "traverse only" of 2026-11-02).** Every ancestor of an opened path is group read + traverse, since the sandbox (bwrap) reads each parent of a mount, so sessions can list other cells' names but not enter them. Copies keep setgid and everything opened moves into the work dir's group. The plugin export opens read-only to C/D cells only; snapshots, dependency overlays and other cells stay closed. After a trajectory and after grading, the benchmark user hands what it wrote back to the group, because Claude Code writes transcripts `0700`/`0600` whatever the umask. *Reason:* the first canary session showed every Bash call failing on `bwrap: Can't mkdir parents`, and the agent could not read the repository's directories at all.
- **2026-11-03 · §5.1 items 1, 4, §5.2 · canary hit and shared state.** A `CLAUDE.md`, `CLAUDE.local.md` or `.claude` above the copy now refuses the cell. Files the benchmark user left in the shared temp roots are removed before each cell, a canary covers it, and one runner holds a work dir. *Reason:* planted ancestor files reached the model in the first canary. An audit after the first pilot attempts found `/tmp/claude-967` shared by all cells with other cells' scripts and build output. No transcript shows a session reading another cell's traces. A second runner started by the operator broke a running cell.
- **2026-11-03 · §5.1, §4.2, bench/README · tools in the copy.** `sudo` resets `HOME` to the benchmark user's real home, which the sandbox keeps read-only. Git trust (`safe.directory`) and Go, XDG and npm caches are set per copy, the caches inside its `.git`, for sessions and grading alike. The `suites.json` setup recipe runs once per `(repo, start, recipe)` as the benchmark user with network, and only git-ignored output reaches every copy of that start, in every variant. *Reason:* grading failed on `dubious ownership`, sessions could not run Go, and the runner had no dependency step, so the web repository could not have been graded.
- **2026-11-03 · §6.1, bench/README · snapshot overlay.** The overlay is the untracked `.telos/` and `CLAUDE.md`, ignored files included; init's edit of a tracked `.gitignore` is not carried. *Reason:* lazygit's `.*` rule left a snapshot with `CLAUDE.md` only.
- **2026-11-03 · §6.3 step 3 · how C/D confirm.** The fixed text is sent as `/telos:revise accept the recommended options`. *Reason:* as a plain prompt the session rightly refused to edit `.telos/`, and the scenario stopped with `awaiting: 01:D-01`. The README documents `/telos:revise` as the command that confirms a proposed decision from notes.
- **2026-11-03 · §5.1 item 2, §6.1, §7.4 · overlay `CLAUDE.md`, local mirrors, infrastructure stops.** (1) The overlay's `CLAUDE.md` is listed in the copy's `.git/info/exclude`. *Reason:* a user commits it with the map, but in a copy the start commit stays HEAD, so it showed as untracked and every `telos accept` failed its scope check on a file the agent never touched. In the pilot agents worked around it by naming it under Deviations, until one rightly stopped to ask, which failed scenario D. Only C and D were exposed, so this biased results against them. An agent's edit of `CLAUDE.md` no longer shows in `git status`, but it still shows in the recorded patch. (2) Copies clone with `--no-local` from one bare mirror per repository in `<workDir>-mirrors`, mode `0700`, not from the network. (3) A failed `prepare` that is not a refusal stops the run with no record, marker or charge, and the cell runs as attempt 1 on resume. *Reason for (2) and (3):* a `Connection reset` during a clone ended a pilot run in cell C, and resuming would have charged the whole reservation as abandoned for a cell in which no session ran.
- **2026-11-03 · §7.3 · one cell reservation of $3.88, campaign cap argument (project owner's decision after the pilot).** `R(cell)` is one value for all cells, the most expensive pilot cell × 2, replacing the per-variant value at +25 %. *Reason:* the pilot covered only the Go repository, the forecast ($72–90) leaves wide room under the cap, and a limit set too low would count C and D, the most expensive variants, as failures because of the harness. One value also gives every variant the same limit. `--cap-usd 242` subtracts the pilot's $58 from $300, counting its $42 of unverified abandoned attempts in full.
- **2026-11-03 · §5.2, §8.4, §12 · pilot audit.** The canaries now also cover the mirrors and entering another cell. The classifier audit needed no rule change; §12 records its known gap and the behaviour of repositories that ignore `.telos/`. *Reason:* findings of the final pilot (`bench/PILOT.md`).
- **2026-11-03 · §7.2 · usage limits.** Added the rule above. *Reason:* a pilot cell ended at turn 19 on `You've hit your 5-hour limit` (HTTP 429), which would have counted as the agent failing, against whichever variant happened to run at that moment.
- **2026-11-03 · §8.2, §8.4 · classifier audit.** Only pipeline heads count, heredoc bodies and quoted text are ignored, and `out_of_scope_paths` excludes instruction files and `.telos/`. *Reason:* on the pilot transcripts 82 of the 204 Bash calls classified as exploration did not start with a reading command (`go test … | tail`, `telos accept … | tail`, heredoc lines), and every B, C and D run reported its own `CLAUDE.md` as out of scope.
- **2026-11-02 · §5.1 item 1 · how the OS user's read set is enforced.** The work dir belongs to the host user with the benchmark user's group (setgid, traverse only). Copies are created closed; the runner opens only the running cell's copy and config dir to that group and closes both after grading, and every ancestor is traverse-only, so a session can neither list nor enter another cell. The launcher sets umask `007`; grading runs from `<workDir>/grading`. *Reason:* the first host setup showed that a shared group-writable work dir would let a session read other cells' copies, including finished solutions.
