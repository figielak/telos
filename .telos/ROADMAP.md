# Roadmap
<!-- Telos building itself; .planning/ uses the .telos/ format and moves there in phase 03.
     Goals and criteria from SPEC §14. -->
- 01-skeleton [done] plugin, CLI skeleton (ctx, status), config, templates, init · done when: `/telos:init` works in a test repo
- 02-core-loop [done] plan, approve, revise, do, quick, status, accept, lint-plan, roadmap set, SessionStart hook, git guard · done when: a minimal phase runs end to end with commits
- 03-map [done] map-scan, map, incremental refresh, PROJECT draft · done when: MAP.md for a real Astro and a real Python repo under limits
- 04-standard [done] discuss, CONTEXT, check, done, undo, lesson, profile switching, std hooks · done when: standard phase incl. undo works
- 05-deep [done] reviewer, researcher, research, review, critical/TDD/e2e, docs, ADR, retro · done when: deep phase incl. doc-sync works
- 06-measure [done] budget measurements on 2–3 real repos, trim templates and prompts · done when: targets in SPEC §12 met or documented
- 07-benchmark [active] Public, pre-registered A/B/C benchmark of Telos vs bare Claude Code and a hand-written CLAUDE.md on real repositories · done when: bench/RESULTS.md reports every pre-registered cell (5 reps × variants A/B/C) with raw data under bench/results/, and npm test passes
- 08-website [done] Public landing page for Telos in website/ built with Astro and Tailwind CSS, Ancient Precision direction, stating only verifiable facts · done when: npm --prefix website ci && npm --prefix website test exits 0; website/DESIGN.md exists; root npm test passes with root package.json unchanged; no horizontal scroll at 390, 768 and 1440 px
