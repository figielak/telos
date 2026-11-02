# Telos benchmark harness

Dependency-free Node ESM (`.mjs`), not part of the plugin runtime. The rules it implements are in [PROTOCOL.md](PROTOCOL.md); its tests are `test/bench-*.test.mjs` and run with `npm test`.

## Manifest (`<dir>/manifest.json`)

```json
{
  "repetitions": 5,
  "repos": [{ "id": "r1", "url": "https://…" }],
  "tasks": [
    { "id": "t-one", "repo": "r1", "start": "<40-hex>", "reference": "<40-hex>", "type": "single",
      "prompt": "task text", "expectedPaths": ["src/"],
      "acceptance": "acceptance/t-one.mjs", "b": "b/r1-s1/CLAUDE.md" }
  ]
}
```

- `type: "single"` has `prompt`; `type: "multi"` has `steps[]` (`steps[0]` is the task text, the rest are the A/B continuation texts of PROTOCOL §6.3). Both together, or the wrong one for the type, is an error.
- `start` and `reference` are 40-character lowercase hex commits; `acceptance` and `b` are paths inside `<dir>` that must exist.
- `variants`, if present, must be exactly `A, B, C, D`. `repetitions` defaults to 5.
- Ids (`repos[].id`, `tasks[].id`) match `[a-z0-9-]` and start with a letter or digit. Every error is a usage error (exit 2) naming `manifest.json` and the field, e.g. `manifest.json: tasks[1].start: …`.

`loadManifest(dir)` → `{ dir, repos, tasks, repetitions }`.

## Run matrix

`expandMatrix(manifest, { seed, reps, only, variant, done })` → `{ cells, setups, queue }`.

- **Cell id** `<task>.<variant>.<rep>` (rep from 1). Ids never change with `reps`, `only` or `variant`.
- **Setup key** `<repo>.<start>.<profile>`: C uses `deep`, D uses `standard`; A and B have none. Tasks of one repo with different starts get separate keys; equal starts share one. The setup's cost is charged to every trajectory in the report, not by the matrix.
- **Order** (blocked randomization): the cells of a `(task, rep)` block run back to back with the four variants in a seed-derived order; block order is seed-derived too. Orders are sorted by `sha256(seed, key)`, so the same seed reproduces them and filtering or `reps: 1` (the pilot) keeps the relative order of the remaining cells.
- **Queue**: `cells` and `setups` interleaved so each setup comes right before its first dependent cell.
- **Resume**: pass the ids of finished cells as `done`; they are skipped, and a setup with no remaining dependent cell is not emitted again.
- `only` is a list of task ids, `variant` a variant or list; unknown values, `reps < 1` or a missing seed are usage errors.

## Workspace and sandbox (PROTOCOL §5, §6.1)

All of it lives under one `workDir` that neither lies inside nor contains this checkout or any local source repository (otherwise a usage error, exit 2): `copies/<cell id>`, `snapshots/<setup key>` (+ `.json` metadata), `config/<cell id>`, `plugin/`. Refusals throw `REFUSED: <reason>`.

- `prepareCopy(cell, manifest, { workDir, snapshot })` → `{ dir, start, refsChecked: true }`. `git clone --no-local` of the repo's `url`, then: refuse a start that ships `CLAUDE.md`, `CLAUDE.local.md` or `.claude/` anywhere; check out branch `bench` at the start; drop remotes, every other ref and all tags; expire the reflog and `gc --prune=now`. The leak check refuses the copy if any other ref remains, HEAD is not the start, the task's `reference` commit is still present, or any commit is not an ancestor of the start. Variant instructions: A none; B `<manifest dir>/<repo>/<start>/CLAUDE.md` (the task's `b` must name exactly that file; missing → refused); C/D the overlay of `snapshot`, whose metadata key and `.telos/config.json` profile must match the cell and which may only add files (a `.git` entry or a tracked path in it is refused). Finally any symlink resolving outside the copy is refused.
- `ensureSnapshot(key, { workDir, telosDir, build })` → `{ dir, hash, rebuilt }`. The hash covers start, profile, the Telos commit and the content of every tracked map file (`skills/map*`, `shared/map.md`, `lib/**/map*`). A current snapshot is reused; otherwise the old one is removed and `build({ key, repo, start, profile, dir, telosDir })` fills a temporary dir with what `telos init --profile <p>` + `/telos:map` leave behind at that start, which is then renamed into place. A failing build leaves nothing; a promise-returning build makes `ensureSnapshot` return a promise. The build's return value (e.g. its usage) is kept as `record`.
- `exportPlugin(telosDir, outDir)` → exported paths. Only **tracked** files under `.claude-plugin`, `agents`, `bin`, `hooks`, `lib`, `shared`, `skills`, `templates`; never `bench/`, `test/` or `.telos/`. File modes are kept; a symlink that leaves the runtime is refused.
- `sessionEnv(cell, { configTemplate, workDir })` → `{ env, settingsPath, readable }`. A fresh `config/<cell id>` holding only `settings.json` and, if `configTemplate.credentials` is given, `.credentials.json`. Settings keep the template's shared permission mode and allow list and add: `autoMemoryEnabled: false`, `WebFetch`/`WebSearch` denied, `sandbox.enabled` with `allowUnsandboxedCommands: false` and `network.allowedDomains` = the model API (`api.anthropic.com` unless `allowedDomains` is set). The env is built from scratch (no host variables except `PATH`, `LANG` and `passEnv` names): `HOME` = `CLAUDE_CONFIG_DIR` = the config dir, auto-memory, autoupdater and nonessential traffic disabled, a fixed bench git identity. `readable` = copy, plugin export (C/D only), config dir; the launcher running as the dedicated OS user enforces it (PROTOCOL §5.1 item 1), and the pilot's canaries verify it, including whether this host version honours the sandbox keys above.
- B and C/D instructions are untracked files in the copy; the start commit itself stays byte-identical.

## Sessions and transitions (PROTOCOL §6.2–§6.4, §7.2, §7.3)

`baseArgv(variant, { launcher, claude, model, permissionMode, pluginDir })` · `runSession({ prompt, env, cwd, argvBase, budgetUsd, timeoutMs, killGraceMs?, spawn? })` (`bench/lib/session.mjs`) · `runTrajectory(cell, ctx)` (`bench/lib/transitions.mjs`)

- **argv** = `<launcher…> <claude…> --model <id> --permission-mode <mode> --output-format json [--plugin-dir <export>] --session-id <uuid> --max-budget-usd <usd> -p -- <prompt>`. Same model and permission mode for every variant; `--plugin-dir` only for C/D; the prompt is always the last, single argv element after `--` (no shell). An empty `launcher` (the `sudo -u <bench user> --`-style prefix of D-08) is `REFUSED`, never a fallback to the author's user. The env comes from `sessionEnv` (07-04) and is passed as the process env; records keep only its names (`envNames`).
- **Process group and timeout.** Each attempt runs detached in its own process group. At the time limit the group gets SIGTERM (a launcher such as sudo relays it), then SIGKILL after `killGraceMs` (default 5 s); on exit the group is killed once more, so no child outlives the session. A timeout is never retried.
- **Retries (§7.2).** An attempt that exits non-zero with no turn (`num_turns` absent or 0) is a host error before the first turn: up to 2 retries, each with a fresh session id and the session budget minus what earlier attempts cost. Every attempt is kept in `attempts[]` with its own `usage` and `costUsd`; missing values stay `null`, never 0. `hostError: true` when the last attempt is still one.
- **Budget (§7.3).** `runTrajectory` gives every session `--max-budget-usd` = cell reservation − cost of all earlier attempts of the cell. Spend ≥ reservation, or any attempt of unknown cost, stops the run before the next session (`failed: budget …`).
- **Result** `{ status, reason?, sessions[], spentUsd }`; `status` ∈ `completed`, `failed`, `timeout` (session or run limit), `infra-failed` (host error after the retries). Each session record has `step`, `prompt`, `sessionId`, `argv`, `envNames`, `exit`, `json`, `usage`, `costUsd`, `ms`, `attempts`.

| Variant · kind | Sessions |
|---|---|
| A/B single | the task text |
| C/D single | `/telos:quick <task text>` |
| A/B multi | `steps` joined by blank lines, then `continue the work in this repository: <step>` for `steps[1…]`, one fresh session each |
| C/D multi | `/telos:plan <task text>` → `telos lint-plan` → `accept the recommended options` → `/telos:approve` → loop on `telos status` Next |

C/D checks, all from `telos` output in the copy (no model judgement):

| After | Check | Failure reason |
|---|---|---|
| plan | `telos lint-plan` exit 0 | `lint: <first line>` |
| confirm | `telos status` has no `Awaiting user` | `awaiting: <ids>` |
| approve | every task of `telos ctx approve` is `approved` (and there is one) | `not approved: <ids>` / `no tasks` |
| loop, before each session | Next is `close phase NN (/telos:done)` with all tasks `done` → **completed** | `next: … with tasks not done: <ids>` |
| | Next is `/telos:do` or `/telos:do-hard <id>` → run exactly that | `next: <value>` (e.g. `fix <id> by hand: …`) |
| | Blockers is `none`, unless Next is `/telos:do-hard <id>` (the shipped escalation) | `blocker: <text>` |
| | at most 2 × tasks loop sessions | `session limit: …` |
| loop, after each session | Next or a task status changed | `no progress: <command>` |
| any C/D session | no `REFUSED:` in the result, exit 0, not `is_error` | `refused: …` / `<step>: exit <code> (<subtype>)` |

## Running the matrix (PROTOCOL §4.2, §7; D-06, D-11, D-12)

`node bench/run.mjs --manifest <dir> --out <dir> --seed <n> --cap-usd <n> --cell-usd <n> [--reps <n>] [--only <task>]… [--variant <V>]… [--config <json>] [--dry-run]` · `runMatrix(cells, manifest, { outDir, capUsd, reservation, deps })` (`bench/lib/orchestrate.mjs`)

- **Exit codes.** 0 every cell ran; 1 a block was skipped for the cap, a cell was refused, or the run stopped (`no-acceptance`); 2 usage error (missing or non-numeric flags, `--cell-usd` > `--cap-usd`, unknown flags, a real run without `--config`, `--out` inside this repository other than `bench/results/raw/`, which is gitignored).
- **`--dry-run`** prints the queue in run order, `setup <key>` before its first cell and `cell <id> <argv>` with the first session's prompt, without spawning anything or writing records. Without `--config` the launcher, model and permission mode show as placeholders.
- **`--config`** (JSON): `launcher` (argv prefix that runs as the benchmark OS user, required, D-08), `claude` (default `["claude"]`), `model`, `permissionMode`, `workDir` (copies, snapshots, config dirs, plugin export; outside this checkout), `configTemplate` (for `sessionEnv`), `setupUsd` (budget of one `/telos:map` setup session, default 2), `sessionTimeoutMs` (30 min), `runTimeoutMs` (4 h), `killGraceMs`, `node` (the benchmark user's node for grading, default `node`).
- **Per cell:** an in-progress marker → `prepare` (copy at the start; C/D overlay their snapshot, built once per setup key by `telos init --profile <p>` + `/telos:map` in a scratch copy, its untracked files becoming the overlay) → refuse if the acceptance script lies inside the copy or any readable path → `runTrajectory` with the cell budget = reservation − setup paid in this cell → patch of the copy vs start, untracked files included (git runs as the host user, so it uses a scratch config-less `GIT_DIR` that borrows the copy's objects through `alternates`: the copy's own config, fsmonitor, filters and hooks never run) → only then the acceptance script is copied into a fresh `<out>/grading/<cell>-*`, run as `<launcher> node <script>` (the benchmark user, since grading executes agent-written code) with cwd = the copy, and the dir deleted → record written atomically (temp + rename), marker removed. Failed, timed-out and infra-failed runs are not graded (`acceptance: null`, `accepted: false`).
- **Record** `<out>/records/<cell>.json`: `cell`, `task`, `variant`, `rep`, `attempt`, `startedAt`, `endedAt`, `gapMs` (wall clock since the previous cell of this process ended, `null` for the first; D-11), `status`, `reason?`, `accepted`, `acceptance` (`exit`, `signal`, `tail`, `ms`), `patch`, `changedPaths`, `sessions` (07-11 session records), `spentUsd` (`null` + `spendUnverified` when a cost was missing), `priorAttemptsUsd`, `setupUsd`, `versions` (host, Telos commit, Node, model).
- **Spend and cap.** Every charge is appended to `<out>/spend.jsonl` as it happens: setup, trajectory (its sum of attempts; an unknown cost is charged as the whole cell budget, unverified) and abandoned attempts. A `(task, rep)` block starts only when spend so far + the reservation of its remaining cells ≤ `--cap-usd`; the reservation of a C/D cell includes `setupUsd` while its snapshot is not built. Once started, a block runs to its end. The first block that does not fit stops the run: it and every later cell are listed as `skipped`, nothing is dropped silently.
- **Resume.** Rerun the same command with the same `--out` and `--seed`: cells with a record are never rerun. A cell with a marker but no record is rerun once (attempt 2); if its first attempt left no trajectory charge, its reservation is charged as `abandoned` (unverified) once, at the start of the resumed run and before any cap check, so spend is never undercounted. A cell abandoned twice gets a `failed: abandoned` record without a third attempt.
- A missing acceptance script writes `failed: no-acceptance` for that cell before any session and stops the run.

## Metrics and redaction (PROTOCOL §8, §10; D-06, D-09)

`rowFromRecord(record, { transcriptsDir, expectedPaths })` · `readTranscript(path)` · `classifyBash(command)` (`bench/lib/metrics.mjs`) · `sanitize(text, { home, user, workDir })` · `sanitizeJsonl(text, ctx)` (`bench/lib/sanitize.mjs`)

`record` is a run record of `runMatrix`; `transcriptsDir` holds `<sessionId>.jsonl` and `<sessionId>/subagents/*.jsonl` of its attempts; `expectedPaths` comes from the manifest task (a trailing `/` matches a directory prefix).

| Field | Meaning |
|---|---|
| `cost_usd` | host cost of every attempt of every session, retries and timeouts included; `setup_usd` is separate (attributed per §6.1) |
| `input`, `cache_creation`, `output`, `cache_read` | host usage summed over all attempts; `cache_read` is never added to anything |
| `fresh` | `input + cache_creation`; always called *fresh*, never "total" |
| `turns`, `wall_ms`, `sessions`, `attempts` | host turns, host wall time, session count, attempt count |
| `per_model` | `{ model: { cost_usd, turns } }`: cost from the transcript's last `cost-state` (D-09), turns from assistant messages (one per message id, so a message split over several lines counts once; subagents included) |
| `tools`, `denied` | tool_use counts per name; tool results that are errors and either carry `permissionDecision.decision: "deny"` or read like a denial |
| `explore_calls`, `explore_bytes`, `explore_unclassified` | the exploration proxy of §8.4 (narrow, labelled so): Read/Grep/Glob and read-like Bash calls, and the bytes of their `tool_result`, counted per session before its first product-code mutation, subagent transcripts merged by timestamp; Bash the classifier cannot place is counted apart |
| `out_of_scope_paths` | changed paths not under `expectedPaths` (`null` without them) |
| `status`, `accepted`, `unverified` | record status, acceptance, and `true` when any host value or transcript was missing |

- **Mutations.** Edit/Write/MultiEdit/NotebookEdit and Bash writes (`>`, `>>`, `tee`, `sed -i`) end the window, except for `.telos/`, `.claude/`, `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `GEMINI.md`. `classifyBash`: `explore` if any simple command of a `&&`/`;`/`|` chain is read-like (`cat head tail sed -n grep rg find ls tree wc`, `git show|log|diff|blame|grep|ls-files|ls-tree|cat-file`), `other` if all are known non-reading commands (`npm`, `pytest`, `go`, `git commit`, `telos`, …), else `unclassified`. A leading `cd` is ignored.
- **Missing data is `null`.** No usage or cost → that field and the sums are `null`; a missing or unparsable transcript → `per_model`, `tools`, `denied` and all `explore_*` are `null`, `unverified: true`. An attempt that failed before any turn needs no transcript. Fixtures are hand-made; the classifier is audited on pilot transcripts in 07-08.
- **Redaction (`sanitize`).** Placeholders replace, in this order: `workDir` → `<WORKDIR>`, `home` → `<HOME>`, any other `/home/<name>` or `/Users/<name>` → `<USER>`, e-mail addresses → `<EMAIL>`, key-like strings (`sk-ant-…`, `sk-…`, `ghp_…`, `github_pat_…`, `AKIA…`, `xox…`, `Bearer …`) → `<SECRET>`, then the bare user name (at least 3 characters, whole word) → `<USER>`. The result is `{ text, hits }` with hits per rule (`workdir`, `home`, `home_other`, `email`, `secret`, `user`). Digits and JSON structure are untouched; `sanitizeJsonl` works per line and throws if a line that parsed would no longer parse. The reviewer's spot check of a sample before publication is a manual step (§10).

## Report (PROTOCOL §2, §8, §9, D-11)

`node bench/report.mjs --rows <dir> --manifest <dir> --out <dir> [--protocol <json>]` → `<out>/runs.csv`, `<out>/tables.md` · `aggregate(rows, matrix, protocol)`, `verdicts`, `breakEven`, `cumulative`, `toCsv`, `toMarkdown`, `median`, `quartiles` (`bench/lib/report.mjs`). Exit 0 ok, 1 failure, 2 usage error (missing flag or `--rows` directory, unknown argument).

- **Input.** `--rows` holds the metric rows of 07-05 as `*.json` (one row or an array per file) or `*.jsonl`; `--manifest` the manifest directory (units = its tasks, `single` or `multi`). `--protocol` is an optional JSON: `horizons` (default `[1, 5, 10, 20]`), `setup` (`{ "<repo>.<start>.<deep|standard>": { usd, fresh, explore_calls } }`, the attributed setup of each snapshot), `bPrepMinutes` (`{ "<repo>.<start>": minutes }`), `bRateUsdPerMinute`, `skipped` (`{ cell: reason }` for cells the cap left out). Without a `setup` entry the setup USD is the sum of the rows' `setup_usd`, and setup tokens and exploration are unknown: fresh tokens and exploration of C/D are then reported as n/a, never as 0.
- **Statistics.** Per unit and variant: accepted n/N, USD per accepted run (`n/a` and the label "no accepted run" when none), median and IQR (Tukey hinges: the medians of the lower and upper half, the median excluded for odd n; n = 1 gives IQR 0) of per-run cost, fresh tokens, `cache_read` (own column) and total exploration (execution + setup). C/D runs are each charged the full setup of their snapshot (`<repo>.<start>.<profile>`), A and B none; B preparation is shown in minutes beside B (USD only with `bRateUsdPerMinute`).
- **Verdicts.** H1–H5 exactly as PROTOCOL §2.2–§2.4: each complete unit (all variants for all repetitions) counts once; ties are within 1 % for USD, tokens and exploration and equality for acceptance; a tie agrees under a non-strict claim (H2, H4) and stays in the denominator under a strict one; both variants without an accepted run excludes the unit, exactly one makes the other better; unverified values, incomplete units and missing variants are excluded and listed with the reason. Supported = at least two thirds agree and the median difference is not against the claim; contradicted = at least two thirds disagree; fewer than 3 included units is inconclusive. H5 also needs `acc(D) ≥ acc(C) − 1` on every complete unit and names the failing units.
- **Differences vs baseline (F3).** For B→C, B→D, A→C, A→D and C→D on USD, fresh tokens, acceptance and exploration, per unit present in both variants (excluded ones listed), positive favouring the second-named variant, with the median. Not a per-step attribution.
- **Break-even.** Per `<repo>.<start>` group and variant C/D, for each horizon: Telos cost = setup + n × median per-task cost against B = preparation (USD only with a rate, else 0 and the minutes are listed) + n × median per-task cost. First crossover = smallest n where Telos is strictly cheaper; sustained = smallest n after which it stays cheaper to the horizon end; otherwise "not reached". Horizons larger than the number of measured units in the group are marked extrapolated.
- **Determinism.** Rows, units and every list are sorted, numbers use fixed decimals (USD 4 in tables, 6 in the CSV), so the same input gives byte-identical files. The CSV has one row per run (`setup_usd` is the attributed setup, `run_cost_usd` the cost including it); `tables.md` also lists missing cells (with the `skipped` reason or "no record") and non-completed records with their status.

## Corpus selection (PROTOCOL §3, §4.3)

`node bench/select.mjs --manifest bench/corpus [--write | --check-b]` · `--manifest <dir> --pool <search-dir> [--check]` · `--gather <clone> --repo <id> [--manifest <dir>]` · `bench/corpus/measure-suite.sh <work-dir> <repo> <commit>`

- **Pool (`--pool`).** The candidate pool is one GitHub Search query per slot, recorded once on 2026-11-01 (PROTOCOL §3.3): `bench/corpus/search/query.json` holds its date, text (`q` with `{language}`), sort and slots, and `search/<slot>.json` the raw responses (`python`, `web` = JavaScript, `go`). The command line, run by hand (the tests use no network):

  ```
  for pair in python:Python web:JavaScript go:Go; do
    gh api -X GET search/repositories -f per_page=30 -f sort=stars -f order=desc \
      -f q="language:${pair#*:} license:mit license:apache-2.0 license:bsd-2-clause license:bsd-3-clause license:isc license:unlicense license:0bsd pushed:>=2025-01-01" \
      > bench/corpus/search/${pair%%:*}.json
  done
  ```

  (This run used `curl -G https://api.github.com/search/repositories` with the same parameters; `gh` was not installed.) `--pool` writes `<manifest>/candidates.json` from those files, never by hand: the first 30 items per slot, ordered by slot, stars descending, id (`<owner>-<name>`, slugged). Gathered facts and `starts[]` already in the file are kept per id. `--pool … --check` writes nothing and exits 1 when `candidates.json` differs from what the responses produce, 0 when it matches.
- **Gather.** `--gather <clone> --repo <id>` alone prints the `starts[]` entries. With `--manifest <dir>` it stores the repo's git facts (`commits`, `contributors`, `files` at `factsAt`, the last first-parent commit before 2025-01-01) in `candidates.json`, and replaces that repo's `starts[]` with the fresh ones, but only when the static criteria of §3.2 hold; other candidates keep their facts only. A clone may be blobless (`git clone --bare --filter=blob:none`; `--filter=tree:0` for very large ones when only the facts are needed).
- Inputs in `<dir>`: `candidates.json` (`slots[]`; `repos[]`: id, url, slot, stack, licence, stars, pushed, branch, the gathered facts, `offlineTests`, `suiteSeconds`; `starts[]`: repo, hash, date, `testsGreen`, `native`, and `following[]` = the next 100 first-parent commits (`WINDOW`) with `product`, `files`, `lines`, `branchCommits`, `appliesToStart`), `exclusions.json` (`{ kind: "repo"|"commit", id, reason, detail }`; commit ids are `<repo>@<hash>`; `reason` from the fixed list of §3.3 or `other: <text>`), and optionally `suites.jsonl`.
- `following[]` records `subject`, product `files`/`lines` (excluding tests, docs, CI, dependency and tooling files: `NOT_PRODUCT`), changed test files (`tests`: `TEST`), deleted test lines (`testDeletions`), `branchCommits` (informational) and `appliesToStart` (the commit's diff against its first parent merges into the start tree via `git merge-tree`). A merge is measured against its first parent. `referenceTree(dir, start, commit)` is that merged tree, the task's reference (§3.5).
- Task eligibility (PROTOCOL §3.5): product files change and tests are added to without deleted lines (`testDeletions: 0`); no typo fix, bump or upgrade (`TRIVIAL`), no integration-branch merge (`INTEGRATION`), no hand exclusion `<repo>@<hash>`; the diff applies to the start (else the commit is skipped and listed as `other: does not apply`). Singles: the first two eligible commits with ≤ 5 files and ≤ 150 lines. Scenario: the first other eligible change with 150–1500 product lines. The pilot start must derive tasks disjoint from the measured start's.
- `measure-suite.sh` clones the repo into the work dir (outside this checkout), runs the `suites.json` setup with network (15 min limit), times the test command without network (`unshare -rn` plus a nested user namespace, so the tests run as the calling user, with loopback up), and on failure reruns it with network. It also records `recipe` (a hash of setup and test). It prints one JSON line; append it to `suites.jsonl`. Values left `null` in `candidates.json` are then filled from the last record per commit: `testsGreen` = offline exit 0, and the repo's `offlineTests`/`suiteSeconds` come from its earliest start that is usable from history. A suite that is red with and without network does not compete on time. An unmeasured qualifying repo is a usage error.
- The rule is a pure function of these files. Repos are filtered by static criteria, then by having a start usable from history, then by suite. Per slot the shortest suite wins (ties: id). Its starts are checked in order until two have green tests, the measured start and the pilot start. An unmeasured start before that point is a usage error, and later starts are not listed. An empty slot is a usage error.
- Without flags it prints the selection: per slot the repo, start, pilot start, derived task commits, and every exclusion with its reason, listed or derived. `--write` also stores it as `<dir>/selection.json`, which task 07-14 commits after its run.
- `--check-b` exits 1 when `selection.json` differs from the rule output, or when a selected `(repo, start)` has no `<dir>/<repo>/<start>/CLAUDE.md` or has one over 400 words, or when `<dir>/b-effort.json` (`{ "minutes": { "<repo>/<start>": number } }`, the subagent wall-clock minutes of each B file) has no positive minutes for a selected start. Exit 2 is a usage error.
