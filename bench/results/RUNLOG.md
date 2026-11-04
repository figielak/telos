# Campaign run log

> **First run void.** The run recorded below ("void run 1") was stopped after 14 of 120 cells and voided by the project owner on 2026-11-04 because of defects 1–3. The full matrix is rerun after the fixes and a new preregistration. Its evidence is kept apart from the rerun's.

Full pre-registered matrix (`PROTOCOL.md`, `PILOT.md`). All USD figures are API-equivalent; subscription usage is not cash.

## Versions and parameters

| Item | Value |
|---|---|
| Claude Code (host and benchmark user) | 2.1.316 (Claude Code) |
| Starting model | `claude-sonnet-5-5` |
| Telos commit (HEAD for the whole campaign) | `a591bd54863b92ccabf071e75a332b3d49f832ae` |
| Final preregistration commit | `688860c` |
| Node | v24.18.0 |
| Go | go1.27.3 |
| Seed | 709 |
| Cap | `--cap-usd 242` |
| Cell reservation | `--cell-usd 3.88` |
| Matrix | 6 tasks × 4 variants × 5 repetitions = 120 cells, 4 setups |
| Sessions run as | OS user `telosbench` |

Command:

```bash
node bench/run.mjs --manifest bench/corpus --seed 709 --cap-usd 242 --cell-usd 3.88 \
  --out bench/results/raw/campaign --config /srv/telos-bench/campaign.config.json
```

## Preflight canaries (§5.2), 2026-11-04

Run in all four variants on `lazygit-single1` at the campaign's Telos commit, with fresh code words. The C/D overlays were copied from the final pilot's snapshots of the same start, because they only need to be present. The canaries did not cover `mintplex-labs-anything-llm`.

| Canary | A | B | C | D |
|---|---|---|---|---|
| Instruction file in the work dir, in `copies/`, above the work dir | refused | refused | refused | refused |
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

Refusals, code-word absence and the denied, blocked and allowed rows were checked against records and transcripts. C and D reach the plugin export by design. The script was rebuilt for this preflight from the pilot's recorded prompt, because the pilot's script was not kept.

Preflight spend: $0.37 (verified). Pilot total $57.62 + preflight $0.37 + cap $242 = $299.99, under the $300 cap of §7.3.

## Timeline

Times are UTC.

| Time | Cell | Event |
|---|---|---|
| 2026-11-04T09:05:06Z | – | Campaign started |
| 2026-11-04 ~10:33 | `anything-llm-scenario.C.5` | Run stopped by the 5-hour usage limit (HTTP 429, resets 14:00 UTC) during the setup session `/telos:map` of the deep snapshot. The runner reported it as `infra: … /telos:map exit 1`, not `usage-limit`. Not resumed. |

State at the stop: 14 of 120 cells recorded, 8 accepted, `spend.jsonl` $15.79.

## Defects found during the run

Found after 14 cells. No cell has been rerun.

| # | Defect | Affected | Evidence |
|---|---|---|---|
| 1 | lazygit's integration runner hardcodes `/tmp/lazygit`, which the session sandbox keeps read-only, so `TestIntegration` cannot run inside a session. | `lazygit-scenario.C.5`, `.D.5`, `.C.2`, `.D.2` | Final messages: "`mkdir /tmp/lazygit/: read-only file system`"; the session's `telos accept` cannot pass and the task blocks. |
| 2 | The `suites.json` recipe installs yarn under the setup user's `$HOME/yarn`, which is not on a session's `PATH`, and the sandbox blocks fetching it. | `anything-llm-scenario.D.5`; probably every C/D cell on this repository whose acceptance uses yarn | Final message: `yarn` not available; `deny network-outbound registry.npmjs.org:443`. |
| 3 | While a session runs, the sandbox mounts empty stubs at the copy's root (`.bashrc`, `.gitconfig`, `.mcp.json`, `.profile`, `.ripgreprc`, `.zshrc`, `.claude/*` and others, 20 paths seen), so `telos accept` inside the session reports them as scope failures. They are gone after the session, and the recorded patches and `changedPaths` do not contain them. lazygit's `.gitignore` hides them; anything-llm's does not. | `anything-llm-scenario.D.5` | `telos accept 01-01` output in the transcript. |
| 4 | A trajectory that ends blocked is not graded, so hidden acceptance never ran on these cells. Their recorded result is `accepted: false` without a test run. | The 5 cells above | Records: `acceptance: null`, `accepted: false`. Later diagnostic: see below. |
| 5 | A 429 during a setup session is reported as an infrastructure stop, and that session's cost is not charged. | `setup …anything-llm….deep`, $0.099 (from the session's `cost-state`), not in `spend.jsonl` | Transcript: `You've hit your 5-hour limit`, `apiErrorStatus: 429`. |

**Effect on the comparison.** Defects 1–3 reach C and D through the mandatory `telos accept` step. A and B have no such step, so they finish and get graded. Scenario cells so far: C and D 0 of 5 accepted, A and B 4 of 5. Single-task cells: 4 of 4. These figures reflect the defects and must not be read as a measure of Telos.

**Why the pilot missed it.** The pilot's scenario needed no integration runner, and it did not cover the JavaScript repository.

**Diagnostic grading (not a measurement).** On 2026-11-04 the hidden acceptance scripts were run on duplicates of these 5 cells, outside the sandbox and with no model session. All 5 exited 0: `lazygit-scenario.C.5`, `.D.5`, `.C.2`, `.D.2` and `anything-llm-scenario.D.5`. The records stay `accepted: false`, and these results do not enter any table. They show that the failures came from the block, and that the 0 of 5 says nothing about the agents' code. One limit: `lazygit-scenario.D.5` left a sandbox workaround in `pkg/integration/components/runner.go` and `env.go`, so its patch is not clean even though it passes.

Spend including defect 5: $15.89. Total against the $300 cap: pilot $57.62 + preflight $0.37 + campaign $15.89 = $73.88.
