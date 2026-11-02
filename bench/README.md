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
- `--check-b` exits 1 when `selection.json` differs from the rule output, or when a selected `(repo, start)` has no `<dir>/<repo>/<start>/CLAUDE.md` or has one over 400 words. Exit 2 is a usage error.
