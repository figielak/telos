---
id: 03-02
title: Deterministic repository scan and bounded CLI output
type: code
status: approved
critical: false
effort: hard
depends: [03-01]
decisions: [D-02, D-03, D-04]
scope: [lib/map-scan.mjs, lib/map-budget.mjs, lib/git.mjs, lib/cli.mjs, test/map-scan.test.mjs, README.md]
---
## Goal
Expose `telos map-scan` as a deterministic, model-free inventory with evidence for targeted
reading, bounded to 2000 estimated tokens even on a large repository.

## Read first
- SPEC.md §6
- lib/detect.mjs:116-145 (detect and manifest error evidence)
- lib/git.mjs:1-35 (read-only git and porcelainFiles)
- lib/cli.mjs:14-31 (Command contract and registry)
- lib/cli.mjs:81-96 (command usage and needsTelos handling)
- lib/config.mjs:15-27 (default limits)

## Files
- lib/map-scan.mjs (create)
- lib/map-budget.mjs (create)
- lib/git.mjs (modify)
- lib/cli.mjs (modify)
- test/map-scan.test.mjs (create)
- README.md (modify)

## Constraints
- Reuse detect for stack/check evidence; summarize manifest scripts/config as data, never execute or import them.
- Exclude `.git`, `.telos`, `.planning`, node_modules, vendor, dist/build/out, coverage, caches, virtualenvs, lockfiles and binary files; do not follow symlinks.
- Count eligible regular files throughout the tree; only rendered tree depth is 3. Sort paths lexically; size/churn ties use path order; git history is capped at 100 commits.
- Entry heuristics: Astro src/pages, package main/bin/exports, Python project.scripts and __main__/main/app modules; label candidates as evidence, not proven flows. Suggestions deduplicate entries → churn → size, max 8, with bounded line ranges.
- Cap output by whole rows with omission counts; preserve section labels, HEAD/file count and warnings. Include the stdout newline in the 8000-char limit.
- Scan works before init, on non-git and unborn repos; the later map bundle enforces provenance requirements.

## Tests (write first)
- Astro/Python temp copies expose manifests, scripts, entry candidates, test paths, tree/counts, sizes and git churn; suggestions deduplicate/rank entries → churn → size with valid ranges, max 8.
- Oversized inventories/manifest values and non-ASCII text stay ≤ 8000 chars including newline; estimator rounds 0/1/4/5 code units correctly.
- Build/vendor/cache dirs, binary files and symlinks are excluded; deep eligible files still count while tree display stops at depth 3.
- Missing HEAD/history and malformed manifests produce explicit notes with usable inventory, not invented facts.
- Equal-size/churn files sort lexically; repeated scans of unchanged inputs are byte-identical.
- Unreadable entries or unsupported newline/backtick paths are reported as omissions; source files are never executed.
- Unknown options return 2; a readable repo without `.telos/` scans successfully; fatal filesystem errors return 1.

## Interface
- `estimateTokens(text)` in lib/map-budget.mjs returns `Math.ceil(text.length / 4)`.
- `scanRepo(root)` returns `{ head, files, tree, manifests, entries, tests, largest, changed, suggestions, dirty, warnings }`.
- `files` contains eligible repo-relative paths/sizes; `head` is full hash or null; suggestions carry path, line range and reason (max 8).
- `renderScan(scan, maxChars = 8000)` returns complete bounded text including final newline; smaller budgets support ctx reuse.
- `mapScanCommand`: no arguments, needsTelos false; stdout report / stderr fatal error, exits 0/1/2.
- New git helpers expose HEAD metadata and bounded recent path counts, using execFileSync argument arrays and read-only commands.

## Edge cases
- oversized/non-ASCII inventory → bounded output, omission counts and exact estimator boundary behavior
- excluded dir, binary, symlink or deep file → excluded safely or counted without a deep tree row
- no HEAD/history or malformed manifest → explicit note and useful partial evidence
- equal rankings/repeated scans → lexical order and identical bytes
- unreadable or unsupported path → omission warning, no execution or symlink traversal
- unknown option / no .telos / fatal filesystem error → exit 2 / exit 0 / exit 1

## Steps
1. test/map-scan.test.mjs: copy existing astro-ts/python-uv fixtures into temp dirs; generate source trees, commits and exclusion/budget cases there.
2. lib/map-budget.mjs: implement the estimator; lib/git.mjs: add HEAD/history helpers without changing existing exports.
3. lib/map-scan.mjs: scanRepo — collect metadata, manifest evidence and ranked entry/key-file excerpts with bounded reads.
4. lib/map-scan.mjs: renderScan/mapScanCommand — fit whole rows, register in lib/cli.mjs and handle exits.
5. README.md: add map-scan row with cap/exclusions; run the suite.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] `bin/telos map-scan` → exit 0
- [ ] Output contains every SPEC scan category, ≤ 2000 estimated tokens including newline, with deterministic truncation notes.

## Result
