# 06 · Measure and tune
## Goal
Measure SPEC §12 on two real repositories, resolve the carried workflow defects, and trim demonstrated prompt overhead. Publish a scorecard whose estimates, live usage, failures and remaining gaps are distinguishable.

## Decisions
- D-01: Add read-only `telos budget [--ctx <bundle> [args...]]`; use the existing UTF-16 length / 4 estimate, label it, and report stored files and rendered injections separately. Actual host usage is external evidence.
- D-02: Use two real repositories (one Astro, one Python), pinned disposable copies and a shared run manifest. Measure both map variants and refresh, a three-task plan, one representative do and one deep phase review per repo; compare plan-lite on identical input. No third repository unless evidence warrants a revised task.
- D-03: Tune once, at most two measured shared bodies plus one template. Preserve model defaults and delete-zone warning policy; document evidence-backed recommendations and seek confirmation before any policy change.
- D-04: Measurement repositories (was Q-01), used only through disposable copies. Python: `/home/figielak/Documents/Projects/telos_testing/BlueVest` (`git@github.com:figielak/BlueVest.git`), baseline `4063adce89449bcb713151be1b675ab7b2eec3a4`, refresh `89d4b098d52f92f216d649c59b6f1e41e40e8c03` (payouts update; 13 files incl. generated `ui_compiled/`). Astro: `/home/figielak/Documents/Projects/telos_testing/knml.edu.pl` (`git@github.com:knmlprz/knml.edu.pl.git`; Astro app in `new-website/`, legacy Hugo in `old-website/`), baseline `2a47a6d49b09e076f4fe0d305f691809c84e3b93`, refresh `8d29d1008a785757fdb172ad1e5e95facea21341` (EN version; 47 files, 7 added).

## Constraints
- Work on the current deep profile; preserve minimal/standard behavior. Node >=20.10, no dependencies; CLI never writes git.
- Budget output is a deterministic size proxy, not actual model usage or a proof that workflow targets were met.
- Record repository and Telos commits, Claude host version, model IDs, profile, exact commands, run boundaries, cache conditions, input/output/cache usage fields, failures and evidence locations.
- Define do overhead versus code work before measuring. If usage or attribution is unavailable, mark UNVERIFIED; do not invent estimates as actuals or silently sum unlike token metrics.
- Real map evidence includes revision, outputs, configured limits, five navigation spot-checks per variant, refresh mode and byte preservation outside affected blocks; fixtures do not satisfy the carried real-repo gate.
- Original repositories remain untouched; live runs use disposable copies at supplied revisions. Keep raw transcripts outside tracked reports and retain sanitized excerpts/digests for audit.
- User said they will provide repository paths/URLs and revisions; none have been supplied yet. Drafting can finish, but dependent live runs await those inputs.
- Keep tasks bounded: two isolated map campaigns, one workflow campaign and one focused tuning pass; propose follow-ups for expansion rather than widening scope.
- Plan self-critique must preserve strict task acceptance, deep retry behavior, configured output caps and explicit evidence limitations.

## Open questions
- none (Q-01 answered as D-04)

## Carried over
- headless map/refresh proof on one real Astro and one real Python repo at pinned revisions (map + map-hard, evidence, §12 usage) → 03-CONTEXT D-09, D-07 ⇒ 06-04, 06-05
- deep close reverify — telos accept SCOPE-fails on uncommitted doc-sync paths; fix accept or done ordering (todo test in e2e-deep) → 05-15 ⇒ 06-02
- stale Next after map — init sets Next=/telos:map on repos with code, map never edits STATUS, so status/SessionStart keep suggesting it; derive Next at read time when MAP is built → lib/init.mjs:17,90 ⇒ 06-03

## Links
- SPEC.md §12. Token budget
- SPEC.md §14. Build roadmap for Telos itself
- .telos/phases/03-map/03-CONTEXT.md D-07, D-09
- test/e2e-deep.test.mjs:510-514
