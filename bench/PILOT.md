# Benchmark pilot

The pilot checks the harness before the measured campaign (`PROTOCOL.md` §14). Its results are excluded from the benchmark and are not evidence for or against Telos: each cell ran once, on one repository, using tasks kept out of the measured set (§3.6).

**Outcome:** the isolation canaries were clean, all 8 pilot cells were accepted, F6 is confirmed live, and the forecast for the full matrix is about $72–90 against the $300 cap. Getting there exposed four harness defects, one of which biased results against Telos. All four are fixed.

## Versions

| Item | Value |
|---|---|
| Date | 2026-11-03 |
| Claude Code | 2.1.316 |
| Starting model | `claude-sonnet-5-5` (all variants) |
| Telos commit of the final pilot | `7c1aba35dd35527b2525910a22bc73706171c576` |
| Telos plugin version | 0.1.0 |
| Node | v24.18.0 |
| Go | go1.27.3 |
| Repository | `jesseduffield/lazygit` at `1e1fba4ce6dcc54e9a24bccb300b5b5965f4ffbc` |
| Sessions run as | OS user `telosbench`, with the launcher, sudoers and work dir setup from `README.md` |

`12893e0`, made after the pilot, fixes only how bundles are recorded (see "Defects found"). It does not change what sessions receive.

## Commands

```bash
node bench/run.mjs --manifest bench/pilot --out <evidence>/pilot-final2 --seed 708 --reps 1 \
  --cap-usd 100 --cell-usd 20 --config /srv/telos-bench/pilot-final2.config.json
node bench/report.mjs --rows <evidence>/rows --manifest bench/pilot --out <evidence>/report --protocol <evidence>/protocol.json
```

The queue covered both pilot tasks in all four variants, which is more than §14 requires. The generous `--cell-usd 20` means no pilot session could stop on budget. The observed costs therefore set the reservation.

## Plugin cache (F9)

`claude plugin update telos@telos` reported "nothing to update" at both user and local scope. On this host the plugin's source is a folder, so it reads from the checkout. The cached `skills/do/SKILL.md`, `lib/cli.mjs`, `bin/telos` and `hooks/hooks.json` matched `HEAD`. `claude plugin details telos` was recorded before and after the update, and only the timestamp differed.

The stale-cache risk behind F9 does not reach the measured sessions: C and D load the plugin export of the pinned commit, not the cache (§5.1 item 3).

## Isolation canaries (§5.2)

Run twice, on `d893aa4` and again on `7c1aba3` before the final pilot. The results below are from `7c1aba3`.

| Canary | A | B | C | D |
|---|---|---|---|---|
| Instruction file in the work dir | refused | refused | refused | refused |
| Instruction file in `copies/` | refused | refused | refused | refused |
| Instruction file above the work dir | refused | refused | refused | refused |
| Instruction file in the benchmark user's home config | absent | absent | absent | absent |
| Memory entry (benchmark user, host user) | absent | absent | absent | absent |
| Trace of a previous cell in `$TMPDIR` | removed | removed | removed | removed |
| Read the acceptance script (Bash and Read tool) | denied | denied | denied | denied |
| Read `bench/PROTOCOL.md`, list `.telos/` | denied | denied | denied | denied |
| List snapshots, list `<workDir>-mirrors` | denied | denied | denied | denied |
| Enter another cell's copy | denied | denied | denied | denied |
| List the host user's home | denied | denied | denied | denied |
| List the plugin export | denied | denied | allowed | allowed |
| Fetch upstream (`git ls-remote`, `curl`) | blocked | blocked | blocked | blocked |
| WebFetch | no such tool | no such tool | no such tool | no such tool |

"Refused" means the runner stopped the cell before any session started. "Absent" means the unique code word was in place during the sessions and appeared in no transcript. C and D reach the plugin export by design.

Limits of this evidence:

- **Cell names are visible.** Sessions can list the names of other cells, such as `canary.B`, but cannot enter them. The sandbox needs this (amendment of 2026-11-03). A name reveals only the task and variant labels.
- **C and D canaries used earlier snapshots.** The overlays came from an earlier development run because they are only there to be present. The final pilot then built its own from scratch.
- **The answers are self-reported tables.** The refusals, code-word checks and the mirror and sibling results were checked against records and transcripts; the other rows rest on the sessions' reports.

## Results

Each cell ran once, so these are not estimates of cost per variant.

| Task | Variant | Accepted | USD | Setup USD | Sessions | Turns | Minutes |
|---|---|---|---|---|---|---|---|
| Scenario | A | yes | 0.35 | – | 3 | 23 | 2.3 |
| Scenario | B | yes | 0.36 | – | 3 | 22 | 2.1 |
| Scenario | C | yes | 1.70 | 0.24 | 6 | 86 | 6.6 |
| Scenario | D | yes | 1.46 | 0.17 | 5 | 60 | 5.4 |
| Single | A | yes | 0.30 | – | 1 | 22 | 2.5 |
| Single | B | yes | 0.45 | – | 1 | 35 | 3.4 |
| Single | C | yes | 0.41 | – | 1 | 29 | 3.5 |
| Single | D | yes | 0.45 | – | 1 | 38 | 2.4 |

**Transitions.**

- Scenario C: plan, confirm, approve, then three `do` sessions, the second on the `do-hard` model. The confirm step confirmed a real proposed decision (D-02).
- Scenario D: plan, confirm, approve, then two `do` sessions, the second on the `do-hard` model. The confirm step had nothing left to confirm.

**Models.** A and B used only `claude-sonnet-5-5`. In C and D, plan, confirm and `do-hard` sessions ran on `claude-opus-5-5` through Telos's skill overrides, and the others on `claude-sonnet-5-5`. This is the shipped behaviour D-09 compares. It is one reason the C and D scenarios cost more.

**Time limits.** The longest session took 3.5 minutes and the longest scenario 6.6 minutes. The limits of 30 minutes and 4 hours stay unchanged.

**Denied calls.** Every variant had denials. They were almost all Bash commands with heredocs or several operations, which need an approval that a headless session cannot give. Agents then retried in a simpler form. One `sed -i` in C was also denied. How often this happens depends on the style the model happens to choose, so `denied` is noisy and should not be read as a difference between variants.

| Kind of denied command | A | B | C | D |
|---|---|---|---|---|
| Heredoc or multi-line | 3 | 3 | 8 | 5 |
| Several operations | 0 | 4 | 2 | 3 |
| Other | 0 | 0 | 1 | 0 |

**Injected bundles.** These are the rendered sizes from `telos budget --ctx`, in bytes:

| Step | C (deep) | D (standard) |
|---|---|---|
| Plan | 1717 | 2056 |
| Confirm | 4641 | 4371 |
| Approve | 1471 | 1374 |
| First `do` | 6975 | 6931 |
| Single task | 1276 | 1613 |

Later `do` sessions were not captured in this run because of the recording defect fixed in `12893e0`. C and D differ little, which is consistent with F8.

**Metrics completeness.** All 8 rows are verified, with no missing usage or transcript. C and D need the setup figures passed through `--protocol` (see "Follow-ups").

## F6 live check

Passed. A headless `/telos:review 01` in the finished C copy ran its diff continuation in the reviewer subagent. All `git diff` calls succeeded with no denial, on `claude-sonnet-5-5`, at $0.09 including the first refused attempt.

Two conditions apply:

- **Tag created by hand.** The first attempt was refused because `telos/01-start` was missing (see "Telos behaviour worth knowing"). The tag was created by hand in that copy, for this check only.
- **Review content.** The review reported deleted tests and an untracked `acceptance_keybinding_validation_test.go`. These are left by grading, which restores the original test suite in the copy. They are not the agent's work, and the check only concerns whether the continuation ran.

## Exploration classifier audit

Audited on the final pilot's transcripts: 162 Bash calls classified as exploration, 83 as other, 1 unclassified. No rule change was needed.

- **Mixed commands.** 44 of the 162 start with a non-reading command but also contain a reading one, such as `telos task set … ; cat file`. That follows the §8.4 rule that any reading pipeline head makes the call exploration. Some of these reads are small checks, such as `git log -1` after a commit, and most fall after the first product mutation, outside the counting window.
- **Telos state.** Reads of `.telos/` count as exploration, as §8.4 defines. This adds to C and D's totals.
- **Known gap.** Edits made through an interpreter, such as `python3 - <<EOF`, are not seen as product mutations, so the counting window stays open longer in those sessions. This can occur in every variant. It is recorded in §12 and was not changed, because a reliable fix would have to parse arbitrary scripts.

## Defects found

| Defect | Effect | Fix |
|---|---|---|
| The overlay's `CLAUDE.md` was untracked in C and D copies | Every `telos accept` failed its scope check on a file the agent never touched. Agents usually worked around it, but one stopped to ask and scenario D failed. **This biased results against C and D.** | `7c1aba3`: listed in the copy's `.git/info/exclude` |
| Each copy cloned over the network | A `Connection reset` ended a run mid-matrix | `7c1aba3`: one closed bare mirror per repository |
| A failed `prepare` left a marker | Resuming would charge a full reservation for a cell where no session ran | `7c1aba3`: clean stop with no record, marker or charge |
| An omitted `.telos/` path cut the recorded bundle | Later `do` bundles had no rendered rows | `12893e0`: recording only |

Earlier development runs on the same day found the defects listed as 2026-11-03 amendments in `PROTOCOL.md`. They are not part of the final pilot's evidence.

## Telos behaviour worth knowing

lazygit's `.gitignore` contains `.*`, which also ignores `.telos/`. In such a repository, `/telos:approve` cannot commit the plan or create the `telos/NN-start` tag, and `/telos:review` then refuses to run. This is how Telos behaves today, not a harness defect, and it applies to the measured lazygit tasks too. It was left in place and is listed in §12, because the benchmark measures the shipped workflow.

## Spend

| Run | Verified USD | Unverified USD |
|---|---|---|
| Final pilot | 5.90 | – |
| Interrupted pilot (network reset) | 1.87 | – |
| Development runs | 6.79 | 42.00 |
| Canaries and probes of this session | 0.79 | – |
| Earlier development canaries (approx.) | 0.27 | – |
| **Total** | **15.62** | **42.00** |

The $42 is two abandoned attempts charged at their full reservation, as §7.4 requires, because their real cost is unknown. It is an upper bound, and the true amount is probably much lower. Subscription usage is not cash, so all figures are API-equivalent.

## Budget and forecast

**Cell reservation: $3.88 for every cell** (`--cell-usd 3.88`). This is the most expensive pilot cell, $1.94 for scenario C with setup, multiplied by 2. It was chosen by the project owner over the +25 % first written in §7.3, because the pilot covered only the Go repository, and a limit set too low would count C and D as failures because of the harness.

**Campaign cap: `--cap-usd 242`.** This is $300 minus the pilot's spend, counting the unverified $42 in full, so the campaign cannot pass the $300 cap of §7.3.

**Forecast for the full matrix** (2 repositories, 4 single tasks and 2 scenarios, 4 variants, 5 repetitions, 120 cells):

| Item | Calculation | USD |
|---|---|---|
| Single-task blocks | 20 blocks × $1.61 | 32.2 |
| Scenario blocks | 10 blocks × $3.87 | 38.7 |
| Snapshots | 4 × $0.24 | 1.0 |
| **Forecast** | | **71.9** |
| With a 25 % margin | | 89.9 |

The forecast fits under the cap, so the quota stays unchanged. Its main weakness is that half of the matrix runs on the JavaScript repository, which the pilot did not cover. The $242 cap would still hold at about three times the forecast. If spending ran higher, the runner would stop between blocks and list what did not run.

## Follow-ups

- **07-09:** run the canaries again in the campaign preflight (§5.2), and keep one Telos commit for the whole campaign.
- **07-10:** pass the setup figures to `report.mjs` through `--protocol`. Without them, C and D show `n/a` for fresh tokens and exploration, and H3 excludes every unit. Publish this pilot's evidence, redacted under §10. It is currently kept outside the repository, in `~/.cache/telos-bench/pilot-final2` and `~/.cache/telos-bench/pilot-final2-evidence`.
- **Telos:** decide how `/telos:approve` and `/telos:review` should behave when `.telos/` is ignored.

## Second pilot (2026-11-04)

Run after the void first campaign run (`bench/results/RUNLOG.md`, `PROTOCOL.md` amendment of 2026-11-04) to check the environment fixes. Unlike the first pilot it used **measured scenarios**, because the first pilot's material could not expose these defects. Its cells are excluded from the results and are never reused.

```bash
node bench/run.mjs --manifest bench/corpus --seed 709 --reps 1 --only lazygit-scenario --only anything-llm-scenario \
  --variant C --variant D --cap-usd 24 --cell-usd 3.88 --out <evidence> --config <pilot3 config>
```

| Cell | Result | USD with setup | Minutes |
|---|---|---|---|
| `anything-llm-scenario.C.1` | accepted | 1.52 | 5.2 |
| `lazygit-scenario.C.1` | accepted | 2.63 | 11.3 |
| `anything-llm-scenario.D.1` | blocked at `cd collector && yarn lint`: `collector/` had no dependencies. Fixed in the recipe. | 1.36 | 7.1 |
| `lazygit-scenario.D.1` | blocked at the interactive integration CLI, which needs `/dev/tty`. Cannot be fixed in a headless session (§12). | 3.46 | 13.4 |

The two blocked cells were not graded, because at that point blocked runs were not. Each cell ran once, so this says nothing about C against D.

**Spend so far:** first pilot $57.62, first preflight $0.37, void run $15.89, environment smoke tests $0.36, second pilot $8.97, second preflight $0.37 (estimated from the first): $83.58.

**Reservation and forecast.** `--cell-usd 6.92` ($3.46 × 2) and `--cap-usd 216`. Forecast from the void run and this pilot: lazygit scenario blocks about $6.60, anything-llm scenario blocks about $3.20, single-task blocks about $0.70, snapshots about $0.70, which gives 5 × 6.60 + 5 × 3.20 + 20 × 0.70 + 0.70 = **$64**, or $80 with a 25 % margin. Anything-llm single tasks are not yet measured, so this is the weakest part.

**Known gap.** `telos --version` fails in the plugin export because `package.json` is not exported. Nothing in the workflow calls it, and it was left as it is.

