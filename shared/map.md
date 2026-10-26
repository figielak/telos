<!-- Shared by /telos:map and /telos:map-hard (SPEC §5.0, §6). Injected via `telos ctx shared map`. -->
Work from the context above. Write only `.telos/MAP.md` and `.telos/PROJECT.md`. Never commit, never
touch git, never edit ROADMAP, STATUS or config. Never read or enumerate `.telos/` beyond the
`Existing MAP` and `Project` pointers; never read the whole repo.

1. **Stop** when the context starts with `REFUSED:`: report the reason and the fix it names.
   Request check: empty → full build. Literal `--refresh` → report "refresh is not available yet
   (arrives with incremental refresh); run /telos:map for a full rebuild" and stop. Any other text →
   report usage `/telos:map` or `/telos:map --refresh` and stop. Never present a full build as incremental.
2. **Read targeted evidence**: the `Suggestions` ranges, plus entry points and manifests named in the
   `Scan`; 3–8 distinct files when available (fewer for tiny repos), excerpts only. Verify every path
   and line range you will write; a flow you cannot trace is written as an assumption.
3. **Keep a rollback copy**: when `Existing MAP` is listed, read it once first and keep its text for rollback; keep any
   authored lines that are still true.
4. **Write `.telos/MAP.md`** as one complete file: the exact `Header to write` on line 1 (`<!-- telos-map: … -->`), `# Map`,
   then `## Structure`, `## Entry points`, `## Flows`, `## Areas` (one `### <domain>` each, key files
   with ranges), `## Find`. Use backticked repo-relative refs as the context's `Refs` line says;
   the "Not built yet" paragraph and all template comments are gone. MAP answers only *where is X*:
   no rules, stack or check commands. Stay under `Map limit`.
5. **Validate**: rerun `telos ctx map` and read its first line. `Map validation: PASS …` → done.
   `FAIL` → repair the named reasons and validate again, at most two repair attempts. Still failing:
   restore the kept previous MAP (or the original not-built stub when there was none) and report the
   failure; never report success without PASS. A new `REFUSED:` after writing (e.g. the work tree
   changed) also ends in a restore.
6. **Draft `.telos/PROJECT.md`** only after PASS. Fill the `draft:` sections of the `Project` line and
   keep every `preserve:` section byte for byte. Purpose: first line one sentence ≤ 100 chars. Rules:
   ≤ 10 lines of hard project rules seen in the code or docs you read. Conventions and Out of scope: only
   what the evidence shows. Whole file ≤ 60 lines. No stack, no check commands, no rules inferred from the
   detected stack. Leave a section as `- none` when evidence is thin.
7. **Ask nothing**: work without asking questions, so the run also completes headless. List every guess as
   `Assumed: …`.
8. **Reply** in ≤ 10 lines: MAP written (`Map validation: PASS <tokens>/<limit>`), files read, PROJECT
   sections drafted or preserved, the `Assumed:` list, and "PROJECT draft is unconfirmed: review it and
   edit or tell me what to change". Last line: `Next: review .telos/PROJECT.md, then commit docs(telos): map`.
