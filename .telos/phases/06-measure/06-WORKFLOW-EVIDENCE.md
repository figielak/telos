# 06-06 Workflow usage evidence (plan, do, review, always-on)

Status: **PARTIAL**: every non-map SPEC §12 target has a measured value or an explicit UNVERIFIED limit; both deep phase reviews ended `UNVERIFIED` because headless permissions denied the bundle's own `git diff` continuation; the Astro `do` blocked on a check command chosen by the measurement setup. One run per cell, no repetitions: these are observations, not statistics.

## Run matrix and accounting method (fixed before the runs)
- Repositories: the two D-04 repos, in the disposable copies from 06-04/06-05 after map (Astro `knml.edu.pl` copy at `7738499` = refresh revision `8d29d10` + Telos init/map + checks; BlueVest copy at `2572c1d` = refresh revision `89d4b09` + init/map/refresh MAP + checks). Originals untouched.
- Measurement setup (not Telos defaults): neither repo has detected checks, so one `checks.test` was configured per copy: Astro `node --test new-website/scripts/`, BlueVest `python3 -m unittest discover -s tests -p "test_*.py"`. The Astro command turned out to be wrong on Node 24 (see Findings 1).
- Inputs: one fixed three-task description per repo (Astro: dependency-free blog frontmatter check script + tests + npm script + README note; BlueVest: Polish phone validation in `core/validation.py` + add/edit wiring + unittest tests). `/telos:plan` and `/telos:plan-lite` got the identical text in identical copies.
- Every run is a fresh headless session: `claude -p "<command>" --output-format json --permission-mode acceptEdits` (Claude Code 2.1.316, installed Telos plugin 0.1.0, profile deep). Runs were sequential; cache was not cleared between them.
- Host fields are reported separately: `input_tokens`, `output_tokens` (thinking inside), `cache_creation_input_tokens`, `cache_read_input_tokens`, cost. For the forked review skill the top-level usage is zero and the numbers come from `modelUsage`. Target comparison uses one stated reading: **fresh = input + cache_creation, plus output**; cache reads are listed but not added.
- do overhead vs code work: overhead = the Telos-fixed context (skill + `ctx do` bundle + `ctx shared do`) plus state/accept/commit steps; code work = reading sources, writing tests/code and test runs. The host reports one total per session, so **measured overhead is UNVERIFIED**; only the fixed-injection size proxy is given, and no guessed code cost is subtracted.
- Between plan and do the measurer approved the plan through the CLI (decisions marked `[proposed]` were confirmed in the copy, `telos task set … approved`, `roadmap set 01 active`, tag `telos/01-start`, commit); this preparation is not measured.

## Always-on, SessionStart, CLAUDE block
| Item (target) | Proxy | Measured | Verdict |
|---|---|---|---|
| Always-on plugin cost (~0) | `claude plugin details telos`: ~962 tok projected (24 skills ~20–50 each, 4 agents) | prompt delta plugin enabled vs `--settings '{"enabledPlugins":{"telos@telos":false}}'` in a plain BlueVest clone: 42955 − 42592 = **363** tokens (1 sample) | **MISS** (not ~0; skills with `disable-model-invocation` still cost listing tokens) |
| SessionStart (≤ ~400) | `telos budget`: ~71 (Astro), ~72 (BlueVest) est. | not separable from the CLAUDE block (below) | proxy within; actual split UNVERIFIED |
| CLAUDE.md Telos block (≤ ~250) | `telos budget`: ~166 est. | combined SessionStart + block, Telos copy vs plain clone at the refresh revision, "reply ok" probe: Astro **369**, BlueVest **615** (BlueVest has no CLAUDE.md upstream, so the delta also includes the file wrapper) | combined ≤ 650 = sum of both targets; per-item actual UNVERIFIED |

Probe prompt totals (input + cache_creation + cache_read): Astro 48595 vs 48226; BlueVest 43570 vs 42955; BlueVest without plugin 42592.

## Plan (three-task phase; target ~8–15K incl. reading bundle)
| | Astro plan (opus) | Astro plan-lite (sonnet) | BlueVest plan (opus) | BlueVest plan-lite (sonnet) |
|---|---|---|---|---|
| input / output (thinking) | 44 / 13708 (2358) | 36 / 14667 (1768) | 34 / 12656 (3612) | 28 / 9615 (2300) |
| cache_creation / cache_read | 53058 / 1311587 | 53783 / 1113145 | 47916 / 943595 | 43846 / 738803 |
| cost · turns · wall | $0.961 · 31 · 141 s | $0.473 · 27 · 118 s | $0.825 · 22 · 146 s | $0.346 · 21 · 82 s |
| Fresh + output (reading) | 53.1K + 13.7K | 53.8K + 14.7K | 47.9K + 12.7K | 43.9K + 9.6K |
| Tasks / lint | 3 · `ok: 3 tasks` · 01-01 marked `effort: hard` | 3 · ok | 3 · ok | 3 · ok |
| CONTEXT.md (deep requires it) | created, 29 lines, D-03..D-05 proposed | created, 24 lines, **template guessed** (plugin template unreadable), D-01 proposed | created, 24 lines, D-01..D-02 proposed | **not created**, assumptions only in the reply (deep rule missed) |
| Awaiting user | 3 proposed decisions | 1 | 2 | none |
| Permission denials | 5 (compound `cd`, `node --test` probe, reads of the plugin cache) | 5 (same kinds) | 4 (`python3 -c` probes, plugin cache reads) | 3 (`python3` probes) |

Proxy: `telos budget --ctx plan` ~352–464 est. tokens plus `ctx shared plan` 5198 chars (~1.3K est.). Verdict: **MISS** for all four runs under the stated reading (44–54K fresh vs ~8–15K). plan-lite cost 49% (Astro) and 42% (BlueVest) of plan, with comparable task splits; quality gaps seen only in plan-lite (guessed template, missing deep CONTEXT).

## do (one representative task; target ~2–4K overhead excl. code work)
| | Astro 01-01 `/telos:do-hard` run 1 | Astro 01-01 run 2 (glob check) | BlueVest 01-01 `/telos:do` |
|---|---|---|---|
| Model | opus (task `effort: hard`, ctx printed the HINT) | opus | sonnet |
| input / output (thinking) | 22 / 9701 (3233) | 22 / 10627 (3189) | 34 / 4705 (172) |
| cache_creation / cache_read | 42450 / 616482 | 45855 / 624582 | 34599 / 855324 |
| cost · turns · wall | $0.657 · 13 · 103 s | $0.704 · 14 · 103 s | $0.271 · 22 · 48 s |
| Outcome | **blocked**: `node --test new-website/scripts/` exits 1 on Node 24 (dir taken as module); no test ever ran | **blocked**: check now green via `telos check` (13 tests), but the plan had baked the old command into Acceptance → `telos accept` FAIL | **done**: RED via `telos check` exit 1, GREEN `telos accept 01-01` PASS, commit `feat(01-01): add Polish phone normalizer` |
| Denials | 3 direct `node --test` runs (do allows only `telos *`) | 4 direct `node --test` | 6 (direct `python3 -m unittest`, compound `cd`, `git -C`) |

Fixed-injection proxy: `telos budget --ctx do 01-01` ~1501 est. (Astro, **truncated at the 6000-char cap**) / ~1485 (BlueVest) + `ctx shared do` 5331 chars (~1.3K) + skill ~0.1K ≈ **2.9K est.**, inside 2–4K as an estimate. Measured overhead: **UNVERIFIED** (one session total; fresh 34.6–45.9K + 4.7–10.6K output includes code work).

## Deep phase review (target ~10–20K per phase)
| | Astro `/telos:review 01` | BlueVest `/telos:review 01` |
|---|---|---|
| Diff reviewed | phase `telos/01-start..76a0407` (3 paths); the blocked 01-01 work was committed **by the measurer** in the copy to give the review a real phase diff | phase `telos/01-start..585523f` (4 paths, patch omitted from the bundle) |
| sonnet input / output / cache_creation / cache_read | 12 / 2779 / 22290 / 81330 | 8 / 1731 / 8600 / 27924 |
| cost · wall | $0.092 · 28 s | $0.042 · 18 s |
| Verdict | `UNVERIFIED` (1 MEDIUM, 2 LOW findings from what it could read) | `UNVERIFIED`, no findings |
| Why | the bundle's continuation `git '--literal-pathspecs' 'diff' …` was denied twice | same denial; reviewer refused to infer findings without the diff |

Fresh + output: Astro 22.3K + 2.8K, BlueVest 8.6K + 1.7K. Verdict: values bracket the 10–20K target, but neither review completed coverage, so **UNVERIFIED** as a phase-review measurement.

## Model defaults and shared injection (SPEC §15 Q1)
- Shared instructions injected through `!`telos ctx shared …`` behaved like inline content in every run: models followed numbered steps (lint-plan rounds, RED/GREEN via `telos check`, `telos accept`, state commands, headless no-commit for map). No size/permission failure of the injection itself.
- Permission limits around it: (a) shared plan text points at templates the skill cannot read under the plugin cache, so plan/plan-lite tried and were denied, and plan-lite guessed the CONTEXT layout; (b) the review bundle's quoted `git '--literal-pathspecs' 'diff'` continuation does not match `Bash(git diff *)`, so headless reviews cannot finish; (c) do allows tests only through `telos check`, which worked but caused repeated denied direct test runs.
- Defaults: plan-lite was 2.0–2.4× cheaper than plan on identical input and produced lint-clean three-task plans, but missed one deep-profile rule (no CONTEXT) on BlueVest. Evidence supports keeping plan-lite as an option; it is not enough (n=1 per repo) to flip the default. No default was changed.

## Delete-zone warning (bounded scenario)
In the BlueVest base copy: `telos history add remove quick "Removed seed script; …" --path scripts/seed.py` (committed), then a plain headless prompt asked to create `scripts/seed.py` (opus + haiku helper; 12 / 3207 / 31032 / 261046 input/output/cache_creation/cache_read, $0.365). Observed: the edit hook warned with the reason and the exact `telos history add revert 'quick' 'Restore on user request' --path 'scripts/seed.py'` command; the model created the file because the user asked, told the user it had been removed deliberately, and tried to run the revert command itself (denied; the Delete-zone line stays). Warning compliance: informed, not blocked, matching the documented warn-only design. No blocking flag added.

## Findings and gaps
1. Measurement-setup error: `node --test <dir>` does not discover tests on Node 24; the plan copied that check into task Acceptance, so the Astro do blocked twice. A Telos-relevant point: plans freeze the check text, so a wrong configured check is not fixed by correcting config alone.
2. Headless deep review cannot read its own continuation diff (permission pattern mismatch): a real Telos defect; follow-up task needed.
3. CONTEXT template is not readable from inside plan skills; plan-lite guessed or skipped it.
4. `ctx do` for the Astro hard task hit the 6000-char cap (truncated).
5. Installed plugin 0.1.0 lacks `telos budget`; budget rows came from the repo HEAD CLI (`bin/telos`, at `f1b1b10`).
6. Not covered: repetitions, cache-cold control, per-step token attribution, a completed deep review, interactive `/context` readings.

## Evidence (raw files in scratchpad `/tmp/claude-1000/-home-figielak-Documents-Projects-telos/6beb196d-c497-40dd-b67a-73a3ae223bbc/scratchpad/wf`, not tracked; sha256)
| File | sha256 |
|---|---|
| `astro-do2-run.json` | `63615cba34f897c2aeefeaf887022e8253eb41bb06beb7e7e3fda73374aba344` |
| `astro-do-run.json` | `a145c398e41130d668832627b750bca5131f9e110ecb0ef5affe583822f34286` |
| `astro-lite-run.json` | `13a590310ae6eed94293e1362fe9a49b417f5ccc01e74150f47afc6bde81a524` |
| `astro-plan-run.json` | `5c60f34d25d828b47d62b13cedbd1aa71f6a86176cbccda821899c39290c867f` |
| `astro-review-run.json` | `454bc4d09688c45598f5e14f710787438994c726e5c0119228ca9c434121e094` |
| `py-do-run.json` | `87fab67701cf01fa99f7cd58661f1faede5f2a296b49181bd005c288c65f254b` |
| `py-lite-run.json` | `22dbd6e1546e0ce72d9ef4300dfd5be2144a963db62a3f7bbad64141cdc49f4f` |
| `py-plan-run.json` | `3ae1398f999feee8e5f9bedb4428a5998088c8f5f0072d38560cc01b2424e533` |
| `py-review-run.json` | `aaf923606c9bb981a81758a92e318baab2450d8e85892c61de6ba1311d046790` |
| `dz-run.jsonl` | `9a50ce9f6beeb2757bf37f440f2eb93158a5c3169466033c2e82f7ad420277bb` |
| `probe/astro-plain.json` | `81faa7b6e6b96de6ca810bd808f5836db688b553df13e86cfa3e67348ab2f58b` |
| `probe/astro-telos.json` | `58df9a8df3434149d1b81dac737c7026716a8990b25534825358baf4d9603481` |
| `probe/py-plain.json` | `7577efaa7113febccb6ee801f8fc337e97c649ffd97982eed2b08911e1c218ff` |
| `probe/py-plain-noplugin.json` | `e10b833e2277d6d9e5e32a95b8fda5f656efd779712192c75c079564721f3bb3` |
| `probe/py-telos.json` | `24cc8148e7015377a6e39ad99f1f7e82f86f2998e827e223a515d5d793685f68` |
