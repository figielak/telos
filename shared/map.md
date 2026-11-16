<!-- Printed after the context by `telos ctx map` (/telos:map in Claude Code). -->
Work from the context above. Write only `.telos/MAP.md`, `.telos/areas/*.md` and `.telos/PROJECT.md`.
Git only in step 10; never edit ROADMAP, STATUS or config. Never read or enumerate `.telos/` beyond
the `Existing MAP`, `Project` and `Areas` pointers; never read the whole repo.

1. **Request**: empty → use the context above (full build). Exactly `--refresh` → run the fixed command
   `telos ctx map --refresh` and use its output instead. Any other text → report usage
   `/telos:map` or `/telos:map --refresh` and stop. **Stop** when the bundle starts with `REFUSED:`:
   report the reason and the fix it names (no writes). Report the `Mode:` you ran; never present a full
   build as incremental.
2. **Keep a rollback copy**: read `Existing MAP` (when listed) and every area file you will change once
   before any write; keep their exact text for rollback and the preservation compare.
3. **Mode: noop** → replace only line 1 of MAP with `Header to write`; skip to step 6.
   **Mode: incremental** → read only the changed files from `Changed` and `Suggestions` (excerpts).
   Edit only the affected blocks listed under `Affected blocks`: each `--- block <id>` text is replaced
   in place by its updated version (keep its heading). Edit only the files under `Affected areas`:
   fix what the change made untrue, set line 1 to `Area header` with the area's paths. For
   `New Area candidates` add them to an area's paths or create an area (step 5). Replace MAP line 1
   with `Header to write`. Every other byte stays byte for byte.
   **Mode: full** (also a refresh fallback; report its `Reason`) → steps 4–5.
4. **Read targeted evidence**: the `Suggestions` ranges, plus entry points and manifests named in the
   `Scan`; 3–8 distinct files when available (fewer for tiny repos), excerpts only. Verify every path
   and line range you will write; a flow you cannot trace is written as an assumption.
5. **Write the index and the areas.** `.telos/MAP.md` is one complete file: the exact `Header to write`
   on line 1 (`<!-- telos-map: … -->`), `# Map`, `## Structure` (≤ 10 lines), `## Areas` (one row per
   area: `- <name> — one line · ` then its backticked paths), `## Find` (task → area or file). No `###` headings, no
   Entry points or Flows sections in MAP: they go into the area files. For each area run
   `telos area new <name> --paths a/,b.mjs` (or edit the existing file), then fill Purpose, Entry
   points (with ranges) and what the evidence shows of Invariants, Decisions, Rejected, Pitfalls;
   keep authored lines that are still true. Backticked repo-relative refs as the `Refs` line says;
   the "Not built yet" paragraph and template comments are gone. No rules, stack or check commands.
   Stay under `Map limit` and the per-area limit; split a large area in two.
6. **Validate**: rerun the same command (`telos ctx map`, or `telos ctx map --refresh` for a refresh)
   and read its first line; it checks MAP, every area file and that Areas rows and files match.
   Refresh only: also compare the saved files with the rollback copies; outside line 1, the affected
   blocks and the affected areas every byte must be identical. `Map validation: PASS …` and a clean
   compare → done. Otherwise repair the named reasons, at most two repair attempts; still failing →
   restore the rollback copies (or the original not-built stub when there was none; delete area files
   you created) and report the failure; never report success without PASS. A new `REFUSED:` after
   writing also ends in a restore.
7. **Draft `.telos/PROJECT.md`** only in a full build, after PASS; a refresh never touches PROJECT.
   Fill the `draft:` sections of the `Project` line and keep every `preserve:` section byte for byte.
   Purpose: first line one sentence ≤ 100 chars. Rules: ≤ 10 lines of hard project rules seen in the
   code or docs you read. Conventions and Out of scope: only what the evidence shows. Whole file
   ≤ 60 lines. No stack, no check commands, no rules inferred from the detected stack. Leave a
   section as `- none` when evidence is thin.
8. **Ask nothing** while mapping: work without asking questions, so the run also completes
   headless. List every guess as `Assumed: …`.
9. **Reply** in ≤ 10 lines: Mode (and Reason), `Map validation: PASS <tokens>/<limit>`, blocks and
   area files changed, files read, PROJECT sections drafted or preserved, the `Assumed:` list, and for
   a full build "PROJECT draft is unconfirmed: review it and edit or tell me what to change".
   Last line: `Next: review .telos/MAP.md and .telos/areas/` (+ `, then commit docs(telos): map` when
   not committed).
10. **Commit after PASS** only (`Map validation: PASS …`, nothing restored) and only with
   `Auto-commit: yes`: ask once (AskUserQuestion in Claude Code) `Commit docs(telos): map` / `Leave uncommitted`.
   A declined question, headless or `Auto-commit: no` → no git writes. On yes: `git diff --cached --name-only`;
   any staged path other than `.telos/MAP.md`, `.telos/areas/*` or `.telos/PROJECT.md` → no commit, say
   so. Else `git add .telos/MAP.md .telos/areas/` (+ `.telos/PROJECT.md` when changed), then
   `git commit -m "docs(telos): map" -- <those paths>`; a failing commit: show it and stop.
