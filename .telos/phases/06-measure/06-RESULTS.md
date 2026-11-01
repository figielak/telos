# 06-measure results: SPEC §12 scorecard

Sources: [06-ASTRO-EVIDENCE.md](06-ASTRO-EVIDENCE.md) (06-04), [06-PYTHON-EVIDENCE.md](06-PYTHON-EVIDENCE.md) (06-05), [06-WORKFLOW-EVIDENCE.md](06-WORKFLOW-EVIDENCE.md) (06-06), [06-TUNING.md](06-TUNING.md) (06-07). Repositories (D-04): Astro `knml.edu.pl` `2a47a6d` → `8d29d10`; Python `BlueVest` `4063adc` → `89d4b09`. Host Claude Code 2.1.316, installed Telos plugin 0.1.0, profile deep, one headless run per cell (observations, not statistics).

**Reading used for live targets.** §12 does not name a token field. Here a run's cost is **fresh = input + cache_creation**, with output listed separately; cache reads (0.03–1.3M per run) are listed in the sources and never added in. Estimates (`telos budget`, `claude plugin details`) are size proxies and kept apart from host usage.

**Tuning.** 06-07 changed no prompt or template (justified no-change), so the "tuned" value equals the baseline for every row.

| # | Target (§12, unchanged) | Baseline = tuned (unit, source) | Status | Reason | Follow-up |
|---|---|---|---|---|---|
| 1 | Always-on ~0 | 363 tokens measured (plugin on vs off, 1 probe, 06-06); ~962 tok projected by `plugin details` | **missed** | the 24 skill + 4 agent listings cost tokens even with `disable-model-invocation` | F1 |
| 2 | SessionStart ≤ ~400 | ~71–72 est. (`telos budget`); live, together with #3: 369 (Astro), 615 (BlueVest, includes a new CLAUDE.md wrapper) | **met (estimate)** · live split UNVERIFIED | the host does not report hook and CLAUDE.md tokens separately | — |
| 3 | CLAUDE.md block ≤ ~250 | ~166 est.; live: see #2 | **met (estimate)** · live split UNVERIFIED | same | — |
| 4 | plan, 3-task phase ~8–15K | plan (opus) fresh 53.1K / 48.0K + output 13.7K / 12.7K; plan-lite (sonnet) 53.8K / 43.9K + 14.7K / 9.6K (Astro / BlueVest) | **missed** | a trivial "reply ok" session already costs ~22–27K cache_creation (host floor); exploration turns dominate; Telos text ≈ 1.3K est. | F2 |
| 5 | do overhead ~2–4K (excl. code work) | fixed-injection proxy ≈ 2.9K est.; host totals fresh 34.6–45.9K + output 4.7–10.6K include code work | **UNVERIFIED** | the host reports one total per session; no per-step attribution | F3 |
| 6 | map mid-size ~15–30K once; refresh ~3–8K | build fresh: Astro 65.3K / 53.6K, BlueVest 46.8K / 46.4K (map / map-hard), output 4.9–6.2K; refresh: Astro REFUSED (no run), BlueVest full fallback 45.8K / 50.8K | **missed** (build) · refresh **missed** (BlueVest, full fallback) / **UNVERIFIED** (Astro, refused) | host floor plus 13–19 turns; both refreshes either refused or touched >30% of units; no incremental refresh measured | F4, F5 |
| 7 | review (deep) ~10–20K per phase | fresh 22.3K (Astro) / 8.6K (BlueVest) + output 2.8K / 1.7K; both verdicts `UNVERIFIED` | **UNVERIFIED** | the bundle's own `git '--literal-pathspecs' 'diff'` continuation was denied headless, so coverage never completed | F6 |

## Carried map proof (03-CONTEXT D-07/D-09 → 06)
| Repo | Full build (map / map-hard) | Spot-checks | Refresh | Proof status |
|---|---|---|---|---|
| Astro | PASS 800/1500 · PASS 789/1500 | 3/5 · 5/5 (map wrote shorthand paths that validation passed) | REFUSED for both (glob ref; `[...slug].astro` ref) | build **proven**; refresh **outstanding** |
| Python | PASS 653/1500 · PASS 751/1500 | 5/5 · 5/5 | full fallback, PASS 719 / 901, PROJECT byte-identical | build and refresh-as-full **proven**; noop/incremental and unchanged-block byte compare **outstanding** |

The headless map run asks nothing and does not commit (seen in all 8 map runs). The offline proof (`test/e2e-map.test.mjs`) stays a separate gate and does not stand in for the outstanding rows.

## Recommendations (not implemented; need user confirmation)
- **Model defaults (SPEC §15 Q1):** keep `opus` for plan. plan-lite cost 42–49% as much and its plans were lint-clean, but on BlueVest it skipped the deep CONTEXT file and on Astro it guessed the template. One run per repo is too few to flip the default; offer plan-lite for small phases as now.
- **Shared injection (§15 Q1):** `!` injection behaved like inline text in every run. What failed was permissions around it: template reads from plugin skills and the review diff continuation (F6, F7).
- **Delete-zone guard (§14 06 decision):** keep warn-only. In the one scenario the warning fired with its exact revert command, and the model told the user. It proceeded because the user had asked for the file. No evidence of silent recreation, so a blocking flag is not justified yet.
- **Stack-note size (§15 Q2):** no stack notes exist yet and nothing was measured. The ≤ ~300-token guidance is unchanged and **unverified**.

## Follow-ups
- F1: trim skill/agent `description` fields or merge model variants to cut the always-on listing; re-measure with the plugin on/off probe.
- F2: decide whether §12 workflow targets mean Telos-attributable tokens; if so, measure them with a host-floor baseline per run instead of whole-session totals.
- F3: per-step attribution for do (e.g. compare against a no-Telos run of the same task); until then overhead stays UNVERIFIED.
- F4: make refresh accept every reference form that full-build validation accepts (globs, bracketed route files), or have validation reject them; also check that refs resolve under the repo root.
- F5: record one real incremental refresh (a small change touching ≤ 30% of units) on either repo.
- F6: allow the review bundle's quoted `git diff` continuation in `/telos:review` permissions, then repeat one deep review per repo.
- F7: make the CONTEXT/task templates readable to plan skills, or inline the CONTEXT layout in the plan bundle.
- F8: inject the deep-critical parts of `shared/do.md` only for deep critical tasks (~350 est. tokens per other do run); `ctx do` hit its 6000-char cap on an 80-line detailed task.
- F9: the installed plugin cache lags the repo (0.1.0 has no `telos budget`, the `do-hard` hint or the derived Next); reinstall before the next live measurement.

Status of this phase's goal: targets are **documented**, not met. Rows 1, 4 and 6 were missed, rows 5 and 7 are unverified, rows 2 and 3 were met by estimate. Closing the phase remains `/telos:done`.
