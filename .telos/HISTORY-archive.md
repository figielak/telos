# History archive

## Log
- 2026-11-16 remove 10: Landing page removed with the memory-core prune; kept in tag pre-memory-core
- 2026-11-16 phase 09: dropped 09-command-guide: a guide for 24 commands is obsolete because phase 10 cuts Telos to a memory core; phases 10-16 added after the concept review (benchmark showed 2-5x cost with level acceptance)
- 2026-11-05 remove 07: Benchmark harness, corpus and evidence removed by owner's decision after the 07 results; summary kept outside the repo; results stay in README Benchmark
- 2026-11-03 phase 08: closed 08-website: website tests pass after a clean install, DESIGN.md exists, root tests pass with root package.json unchanged, no horizontal scroll at 390, 768 and 1440 px; retro: the layout changed twice mid-phase, so tests encoding layout were rewritten, and the root suite outgrew the telos check output limit
- 2026-11-03 decision ADR 001: 08:D-04: website/ is a standalone npm package; the plugin keeps its no-dependency rule
- 2026-11-01 phase 06: closed 06-measure: targets in SPEC §12 met or documented (3 missed, 2 unverified, 2 met by estimate; scorecard in 06-RESULTS.md); retro: live runs surfaced real defects (Astro refresh refused, review diff permission, frozen check text in plans) that offline fixtures never showed
- 2026-10-29 profile telos: standard → deep
- 2026-10-29 phase 05: closed 05-deep: deep phase incl. doc-sync works
- 2026-10-29 decision 05: D-04: ADRs need a confirmed source and CLI-owned retryable header transitions; undo reverts only explicitly selected ADRs and never reactivates a superseded predecessor.
- 2026-10-29 decision 05: D-02: Result stores compact real RED/GREEN/e2e and review evidence; full checks take --task/--phase selectors and deep critical code requires a configured e2e.
- 2026-10-27 profile telos: minimal → standard
