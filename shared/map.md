<!-- Shared by /telos:map and /telos:map-hard (SPEC §5.0, §6). Injected via `telos ctx shared map`. -->
Work from the context above. Write only `.telos/MAP.md` and `.telos/PROJECT.md`. Never commit, never
touch git, never edit ROADMAP, STATUS or config. Never read or enumerate `.telos/` beyond the
`Existing MAP` and `Project` pointers; never read the whole repo.

1. **Request**: empty → use the context above (full build). Exactly `--refresh` → run the fixed command
   `telos ctx map --refresh` and use its output instead. Any other text → report usage
   `/telos:map` or `/telos:map --refresh` and stop. **Stop** when the bundle starts with `REFUSED:`:
   report the reason and the fix it names (no writes). Report the `Mode:` you ran; never present a full
   build as incremental.
2. **Keep a rollback copy**: when `Existing MAP` is listed, read it once before any write and keep its
   exact text in the session for rollback and the preservation compare.
3. **Mode: noop** → replace only line 1 with `Header to write`; skip to step 6.
   **Mode: incremental** → read only the changed files from `Changed` and `Suggestions` (excerpts).
   Edit only the affected blocks listed under `Affected blocks`: each `--- block <id>` text is replaced in place by its updated
   version (keep its heading); add a `### <domain>` under `## Areas` only for `New Area candidates`;
   replace line 1 with `Header to write`. Every other byte stays byte for byte.
   **Mode: full** (also a refresh fallback; report its `Reason`) → steps 4–5.
4. **Read targeted evidence**: the `Suggestions` ranges, plus entry points and manifests named in the
   `Scan`; 3–8 distinct files when available (fewer for tiny repos), excerpts only. Verify every path
   and line range you will write; a flow you cannot trace is written as an assumption.
5. **Write `.telos/MAP.md`** as one complete file: the exact `Header to write` on line 1 (`<!-- telos-map: … -->`),
   `# Map`, then `## Structure`, `## Entry points`, `## Flows`, `## Areas` (one `### <domain>` each, key
   files with ranges), `## Find`. Use backticked repo-relative refs as the context's `Refs` line says;
   the "Not built yet" paragraph and all template comments are gone. MAP answers only *where is X*:
   no rules, stack or check commands. Stay under `Map limit`; keep authored lines that are still true.
6. **Validate**: rerun the same command (`telos ctx map`, or `telos ctx map --refresh` for a refresh)
   and read its first line; it checks the whole saved MAP, unchanged blocks included. Refresh only:
   also compare the saved file with the rollback copy; outside line 1 and the affected blocks (plus
   new Areas) every byte must be identical. `Map validation: PASS …` and a clean compare → done.
   Otherwise repair the named reasons, at most two repair attempts; still failing → restore the
   rollback copy (or the original not-built stub when there was none) and report the failure;
   never report success without PASS. A new `REFUSED:` after writing also ends in a restore.
7. **Draft `.telos/PROJECT.md`** only in a full build, after PASS; a refresh never touches PROJECT.
   Fill the `draft:` sections of the `Project` line and keep every `preserve:` section byte for byte.
   Purpose: first line one sentence ≤ 100 chars. Rules: ≤ 10 lines of hard project rules seen in the
   code or docs you read. Conventions and Out of scope: only what the evidence shows. Whole file
   ≤ 60 lines. No stack, no check commands, no rules inferred from the detected stack. Leave a
   section as `- none` when evidence is thin.
8. **Ask nothing**: work without asking questions, so the run also completes headless. List every
   guess as `Assumed: …`.
9. **Reply** in ≤ 10 lines: Mode (and Reason), `Map validation: PASS <tokens>/<limit>`, blocks or
   files changed, files read, PROJECT sections drafted or preserved, the `Assumed:` list, and for a
   full build "PROJECT draft is unconfirmed: review it and edit or tell me what to change".
   Last line: `Next: review .telos/MAP.md (and PROJECT.md), then commit docs(telos): map`.
