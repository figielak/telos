# 06-04 Astro map and refresh evidence

Status: **PARTIAL** — full builds PASS validation for both variants; refresh FAILED (REFUSED) for both on the real repository; usage is host-reported, targets are compared below. Nothing here is a fixture result.

## Manifest
| Field | Value |
|---|---|
| Repository | `knmlprz/knml.edu.pl` (Astro app in `new-website/`, legacy Hugo in `old-website/`), local source `/home/figielak/Documents/Projects/telos_testing/knml.edu.pl` (D-04, untouched) |
| Baseline / refresh | `2a47a6d49b09e076f4fe0d305f691809c84e3b93` / `8d29d1008a785757fdb172ad1e5e95facea21341` (47 files changed, +815 −128) |
| Telos | installed plugin `0.1.0` (`~/.claude/plugins/cache/telos/telos/0.1.0`), used by the live runs; repo HEAD at report time `ec7f5b0`. The installed copy differs from HEAD in accept, cli, ctx/check, status (not in the map path; `lib/ctx/map.mjs` identical) |
| Host | Claude Code 2.1.316, `claude -p "/telos:<skill> [--refresh]" --output-format json --permission-mode acceptEdits` |
| Models | map → `claude-sonnet-5-5` · map-hard → `claude-opus-5-5` (from `modelUsage`) |
| Profile / limit | deep · `limits.map_tokens` 1500 |
| Copies | one disposable clone per variant (`map`, `maphard`) at baseline + `telos init --profile deep` committed as the only extra commit; runs sequential, separate sessions, no shared cache control (1h ephemeral cache, `cache_read` shows reuse inside a run) |
| Refresh setup | built MAP+PROJECT committed in the copy (`docs(telos): map`), then the refresh commit merged on top (`git merge --no-edit`); then `/telos:<skill> --refresh` |
| Raw outputs | scratchpad `/tmp/claude-1000/-home-figielak-Documents-Projects-telos/6beb196d-c497-40dd-b67a-73a3ae223bbc/scratchpad/astro` (not tracked); digests below |

## Full build
| | map (sonnet) | map-hard (opus) |
|---|---|---|
| Mode / validation | full · `PASS 800/1500` | full · `PASS 789/1500` (first validation failed on `/blog/<slug>/` and shortened ranges; repaired once) |
| MAP size | 3303 bytes | 3174 bytes |
| PROJECT draft | 29 lines | 36 lines |
| Turns / wall | 13 / 49.9 s | 19 / 72.9 s |
| input_tokens | 16 | 18 |
| output_tokens | 5738 (thinking 494) | 6193 |
| cache_creation_input_tokens | 65287 | 53638 |
| cache_read_input_tokens | 416079 | 527104 |
| total_cost_usd (host) | 0.3602 | 0.6585 |
| Permission denials | 1 (a compound `cd … && wc` Bash) | 2 |
| Commit | none (headless asks nothing) | none |

Token fields are kept separate; cache reads are cumulative across turns and are not summed with fresh input.

## Refresh (baseline → refresh revision)
| | map | map-hard |
|---|---|---|
| `telos ctx map --refresh` | **REFUSED**: unsupported reference `src/sections/*.astro` (Flows) | **REFUSED**: unsupported reference `new-website/src/pages/blog/[...slug].astro` (Entry points) |
| Mode | none run (no noop/incremental/full executed) | none run |
| MAP / PROJECT bytes after | identical to the built files (`cmp`) | identical |
| Usage (output / cache_create / cache_read / input) | 963 / 32784 / 76305 / 4 · $0.148 · 3 turns | 480 / 30715 / 76304 / 4 · $0.271 · 2 turns |

Refresh of an unchanged-block compare, mode honesty and the 3–8K target are therefore **not measured**: no refresh ran on either variant. This is a defect found by the real run (see Findings), not a pass.

## Navigation spot-checks (against baseline source, five per variant)
| Variant | Reference | Result |
|---|---|---|
| map | `new-website/src/pages/index.astro:1-20` | OK (composes the section imports) |
| map | `new-website/src/pages/blog/index.astro:1-19` | OK (post list) |
| map | `new-website/src/data/site.ts:1-39` | OK (email, Discord, nav constants) |
| map | `src/pages/tags/[tag].astro:1-28` | FAIL: not repo-relative; exists only under `new-website/` |
| map | `SiteFooter.astro:1-115` | FAIL: bare filename, no such path |
| map-hard | `new-website/src/pages/blog/[...slug].astro:1-74` | OK |
| map-hard | `new-website/src/pages/sitemap.xml.ts:1-28` | OK (sitemap endpoint) |
| map-hard | `new-website/src/content.config.ts:69-84` | OK (achievements collection) |
| map-hard | `new-website/src/styles/global.css:1-30` | OK |
| map-hard | `new-website/src/lib/posts.ts:37-39` | OK (`tagSlug`) |

Whole-file mechanical check of every `path:range` ref: map 12 of 18 resolve at the exact repo-relative path (5 resolve only under `new-website/`, 1 missing, plus a `*.astro` glob outside the check); map-hard 27 of 27.

## Against SPEC §12 (`map` mid-size repo ~15–30K once; refresh ~3–8K)
The target does not say which token field it counts. Host-reported fresh context written to cache plus output: map 71.0K (65.3K + 5.7K), map-hard 59.8K (53.6K + 6.2K); both above 30K, so **MISS** under that reading, with each build also reading 416–527K cached tokens across turns. Refresh: **no result** (refused). Treat the build comparison as one run per variant (no repeat, no variance).

## PROJECT preservation
Full builds drafted PROJECT from an empty template (nothing to preserve). On refresh PROJECT stayed byte-identical (the run was refused before any write).

## Findings and remaining gaps
1. Both headless-built MAPs from a real Astro repo are rejected by `--refresh` (glob reference; bracket/dot route filename). Full build passes validation while the refresh parser rejects the same text: build and refresh accept different reference syntax. Follow-up for the map workflow (outside this doc task).
2. `map` (sonnet) wrote 5 shorthand or bare paths that `Map validation: PASS` accepted, because validation checks form and budget, not that the path exists under the repo root. map-hard had none.
3. Not covered: refresh success, refresh modes, unchanged-block byte compare on a refresh that runs, repeat runs. The Python half is task 06-05.
4. Host usage is reported per run by the CLI JSON; cache state before each run is not controlled.

## Digests (sha256)
| File | sha256 |
|---|---|
| `map-build.json` | `fbc8e7b0088478c9d1c1957dc73d1015896cd077b716e512e6d35c6249e36141` |
| `maphard-build.json` | `303f2d6e3cb5b3ab9ec15761aeae37af510c7c6515f146fc4ed0ab9ee88588fd` |
| `map-refresh.json` | `743c53916fc8e540fb6da5ee34c42d696cb2f7636e9d41f5535c964a16fd7dab` |
| `maphard-refresh.json` | `7202e8a013c134991abcf6b0f313c1871168a6de567bfb0f5ade9569b5df8899` |
| `map-MAP.built.md` | `05a8d3337c5d305f37d9cb29a82873398df612438c0f5ae6f0eae2c2f19e96fb` |
| `maphard-MAP.built.md` | `e5752f2afe9438772e35d82c8ef1ae9f21cf8dcf3ce50b32dad9440bd4b71855` |
