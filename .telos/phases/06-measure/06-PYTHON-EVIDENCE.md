# 06-05 Python map and refresh evidence

Status: **PASS for the recorded runs, with limits**: full builds and both refreshes ran live and validated; both refreshes fell back to full mode, so no incremental or noop refresh and no unchanged-block byte compare was exercised. Usage is host-reported; one run per variant.

## Manifest
| Field | Value |
|---|---|
| Repository | `figielak/BlueVest` (PySide6 desktop app), local source `/home/figielak/Documents/Projects/telos_testing/BlueVest` (D-04, untouched; its HEAD `2e941b6` is not used) |
| Baseline / refresh | `4063adce89449bcb713151be1b675ab7b2eec3a4` / `89d4b098d52f92f216d649c59b6f1e41e40e8c03` (13 files, +3727 −366, incl. generated `ui_compiled/`) |
| Telos | installed plugin `0.1.0` (cache copy used by the live runs); repo HEAD at report time `e86f7b9`. Map path files (`lib/ctx/map.mjs`, `lib/map*.mjs`, `shared/map.md`) match between the two |
| Host | Claude Code 2.1.316, `claude -p "/telos:<skill> [--refresh]" --output-format json --permission-mode acceptEdits` |
| Models | map → `claude-sonnet-5-5` · map-hard → `claude-opus-5-5` (from `modelUsage`) |
| Profile / limit | deep · `limits.map_tokens` 1500 · 32 eligible files |
| Copies | one disposable clone per variant at baseline, `telos init --profile deep` committed as the only extra commit; sequential separate sessions; cache state before each run not controlled |
| Refresh setup | built MAP+PROJECT committed in the copy, refresh commit merged on top, then `/telos:<skill> --refresh` |
| Raw outputs | scratchpad `/tmp/claude-1000/-home-figielak-Documents-Projects-telos/6beb196d-c497-40dd-b67a-73a3ae223bbc/scratchpad/py` (not tracked); digests below |

## Full build (baseline)
| | map (sonnet) | map-hard (opus) |
|---|---|---|
| Mode / validation | full · `PASS 653/1500` | full · `PASS 751/1500` |
| MAP / PROJECT size | 2665 / 814 bytes | 3071 / 1304 bytes |
| Turns / wall | 17 / 42.8 s | 15 / 53.2 s |
| input_tokens | 16 | 10 |
| output_tokens | 4881 (thinking 266) | 4985 (thinking 327) |
| cache_creation_input_tokens | 46767 | 46429 |
| cache_read_input_tokens | 460286 | 261157 |
| total_cost_usd (host) | 0.2819 | 0.5234 |
| Permission denials | 1 (a `sed -i` edit of the MAP) | 0 |
| Commit | none (headless asks nothing) | none |

Fields are not summed with each other; cache reads are cumulative over turns.

## Refresh (baseline → refresh revision)
| | map | map-hard |
|---|---|---|
| `telos ctx map --refresh` mode | **full** (fallback: 9/9 editable units affected, >30%) | **full** (fallback: 9/10 units, >30%) |
| Validation after | `PASS 719/1500`; re-run reports `noop` | `PASS 901/1500`; re-run reports `noop` |
| Header | rewritten to the merged HEAD `2aa2df7` | rewritten to the merged HEAD `c17b781` |
| Content | payouts flow and tables, Withdraw area added, line ranges recomputed | same, plus withdraw page now treated as live |
| PROJECT.md | byte-identical to the built file (`cmp`) | byte-identical |
| input / output | 12 / 4001 | 10 / 3738 |
| cache_creation / cache_read | 45802 / 318606 | 50752 / 261236 |
| cost, turns, denials | $0.2551 · 12 · 0 | $0.5331 · 10 · 0 |

The refresh was a full rebuild in both variants, so the unchanged-block byte compare does not apply: every block was affected. Noop and incremental modes were not exercised on this repository (the refresh commit is too large: 13 files against 32).

## Navigation checks
Mechanical check of every `path:range` against the pinned trees (path exists, range within file length): baseline MAPs map 23/23 and map-hard 25/25; refreshed MAPs map 28/28 and map-hard 32/32 (against the refresh revision).

Five content spot-checks per variant at the baseline (the start of each range was read):
| Variant | References checked | Result |
|---|---|---|
| map | `main.py:200-204` (`__main__`), `core/pages/collectors.py:76-143` (addCollector), `main.py:23-198` (MainWindow), `core/database_controller.py:57-103` (add_collector), `widgets/custom_grips/custom_grips.py:13-125` (CustomGrip) | 5/5 OK |
| map-hard | `main.py:200-204`, `core/database_controller.py:57-103`, `core/ui_functions.py:15-279` (UIFunctions), `core/database_controller.py:107-168` (add_baskets), `core/dialogs/add_basket.py:44-56` (get_addValues) | 5/5 OK |

Refresh content was checked only mechanically plus the payout coverage of the text; no separate five-reference content check at the refresh revision.

## Against SPEC §12 (`map` mid-size repo ~15–30K once; refresh ~3–8K)
BlueVest is small (32 files). Host-reported fresh cache writes plus output, kept as two numbers: build map 46.8K + 4.9K, map-hard 46.4K + 5.0K; refresh map 45.8K + 4.0K, map-hard 50.8K + 3.7K. Both builds exceed 30K and both refreshes exceed 8K under that reading: **MISS** for build and refresh (the target does not name its token field, so this is one reading). Refresh cost equals a build because it fell back to full; an incremental refresh was not measured. One run each, no variance.

## Findings and remaining gaps
1. A change touching 9 of 9–10 map units triggers a full fallback, so refresh offers no saving on this repository for a payouts feature; the incremental path is unmeasured here.
2. Untouched PROJECT preservation holds on refresh (byte-identical).
3. The `map` build had one denied `sed -i` edit (headless permission); it still validated.
4. Not covered: noop/incremental refresh evidence on real repositories (neither repo produced one), repeated runs, cache-cold vs warm control.

## Digests (sha256)
| File | sha256 |
|---|---|
| `map-build.json` | `d42cf3d081de74347c1c91abeeb97ac6b389145433cb9ee62b3230b2da158500` |
| `maphard-build.json` | `aa4b8f25dba35fb6e44d487f7ecebeb22321435b7e0ebac461ee1953f77ff248` |
| `map-refresh.json` | `3aaea2ea5e377737bd5ce49e28be277ef91d4e01e7b570c2d9db00d2a21330f5` |
| `maphard-refresh.json` | `9cdae07763a5d71a876435a20f4a70290cd53a1ea4bd9c8fe922da307bfdec8c` |
| `map-MAP.built.md` | `0ecf28d3b3c1a97e75cc4990b670912041ec351e9e9906a7baf8149746805733` |
| `maphard-MAP.built.md` | `8a49640bae9864272517af8c5fdcf3bb5a1a853af90058843b2e5d75df01c720` |
| `map-MAP.refreshed.md` | `a36841e84bcf50155e86aa01e0c7e570b5b42e4f4bbcca1295ffdb8bcdd27149` |
| `maphard-MAP.refreshed.md` | `1cc0424fa01c8b5d03ec98984b23b33108ad2214a57543f03bb5670aab7285ae` |
