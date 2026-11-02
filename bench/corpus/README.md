# Benchmark corpus

Selection, B files, task texts and hidden acceptance of the benchmark (`bench/PROTOCOL.md` §3–§4). `selection.json` is the output of `bench/select.mjs`; `manifest.json` is what the runner loads (`bench/lib/manifest.mjs`).

| path | content |
|---|---|
| `candidates.json`, `search/` | the recorded candidate pool (GitHub Search, 2026-11-01) and its git facts |
| `suites.json`, `suites.jsonl`, `measure-suite.sh` | suite recipes, every measurement run, the measuring script |
| `exclusions.json`, `selection.json` | hand exclusions and the rule output |
| `<repo>/<start>/CLAUDE.md`, `b-effort.json` | variant B instructions and their authoring minutes |
| `manifest.json` | repositories and the six tasks (`prompt` or `steps[]`, `expectedPaths`, acceptance and B paths) |
| `<repo>/acceptance/` | hidden acceptance scripts, their sources (`src/`) and alternative implementations (`*.alt/`) |
| `build-acceptance.mjs` | generates the acceptance scripts from `src/` |
| `REVIEW.md` | model checks and the author's responses |

Reference of a task = the start tree plus the task commit's own diff (`select.mjs`, PROTOCOL §3.5). Acceptance exit codes: 0 accepted, 1 behavioural fails, 2 regression fails.

## Calibration

See `bench/README.md` §"Hidden acceptance and calibration". Result of `node bench/calibrate.mjs --manifest bench/corpus` on the benchmark host:

| task                  | repo                       | start | reference | alternatives | verdict |
| --------------------- | -------------------------- | ----- | --------- | ------------ | ------- |
| lazygit-single1       | jesseduffield-lazygit      | 1     | 0         | 1/1          | OK      |
| lazygit-single2       | jesseduffield-lazygit      | 1     | 0         | 1/1          | OK      |
| lazygit-scenario      | jesseduffield-lazygit      | 1     | 0         | 1/1          | OK      |
| anything-llm-single2  | mintplex-labs-anything-llm | 1     | 0         | 1/1          | OK      |
| anything-llm-scenario | mintplex-labs-anything-llm | 1     | 0         | 1/1          | OK      |
| anything-llm-single1  | mintplex-labs-anything-llm | 1     | 0         | 1/1          | OK      |

Run on 2026-11-02 (Linux 7.2.13, 16 CPUs; go1.27.3, node v24.18.0). start = exit code at the start commit (1: behavioural check fails, regression passes), reference = exit code on start + the task commit's diff, alternatives = accepted / total.
