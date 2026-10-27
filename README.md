# Telos

A lean, token-economical workflow plugin for Claude Code:
plan → test → implement → verify, with durable project memory in `.telos/`.

Status: **pre-alpha** (phase 01-skeleton). See [SPEC.md](SPEC.md).

## Install (per repository)

```
/plugin marketplace add figielak/telos
/plugin install telos@telos
/telos:init standard
```

Requires Claude Code with plugin support, Git and Node.js ≥ 20.10.

## Commands (in Claude Code)

All skills are user-invoked only, so they cost nothing until called.

| Command | Purpose |
|---|---|
| `/telos:init [minimal\|standard\|deep]` | Initialize Telos in the current repo: detects stack and check commands, asks once to confirm them (and the profile when not given; an initialized repo keeps its profile), runs `telos init`, prints a ≤ 10-line summary ending with the next step |
| `/telos:discuss [NN]` | Standard/deep: clarify a phase (the STATUS phase or `NN`, selected with the validated `telos ctx discuss <NN>`) before planning: one question round, then writes `.telos/phases/NN-name/NN-CONTEXT.md` (all six sections, ≤ 60 lines). Answers become `D-NN`, assumed or open choices `D-NN [proposed]` and `Q-NN`; existing IDs and answers are kept, never renumbered; an `active` phase only gains new proposed items and plan changes go to `/telos:revise`. Updates Awaiting user via `telos status set awaiting=`; no commit; minimal replies `Requires standard profile. …` |
| `/telos:plan [NN\|description]` | Plan a phase (the STATUS phase, phase `NN`, or a new phase from a description): asks at most one round of questions, writes draft task files with `telos task new`, fixes them until `telos lint-plan` passes, marks the phase `drafted`, ends with a ≤ 10-line summary ; standard/deep also keeps the target phase's `NN-CONTEXT.md` (creates it only when missing, ≤ 60 lines): answers as `D-NN`, assumed choices as `D-NN [proposed]` (they block approve/do of tasks listing them), IDs never renumbered, new proposed IDs added to Awaiting user |
| `/telos:plan-lite [NN\|description]` | Same as `/telos:plan` on a cheaper model, for small obvious phases |
| `/telos:revise <notes>` | Apply notes to the current phase's plan with minimal edits (split, merge, reorder, change); approved tasks it changes go back to `draft`; keeps CONTEXT `D-NN` / `[proposed]` / `Q-NN` lines unless the notes change them (confirms a proposed one only when the notes do) and syncs Awaiting user; re-lints and summarizes |
| `/telos:revise-lite <notes>` | Same as `/telos:revise` on a cheaper model, for minor edits |
| `/telos:approve` | Approve the drafted plan: refuses on lint problems, keeps tasks with unconfirmed decisions in `draft`, sets the rest `approved`, the phase `active` and STATUS, commits `docs(telos): plan phase NN-name` and creates the local tag `telos/NN-start` |
| `/telos:do [task-id]` | Execute the next approved task (or the given one): tests first → implement → `telos accept` (max 2 fix attempts, then `blocked`) → Result with Deviations → task and STATUS state → one commit `<type>(NN-MM): …` of the listed files; an `effort: hard` task stops first and suggests `/telos:do-hard` |
| `/telos:do-hard [task-id]` | Same as `/telos:do` on a stronger model, for complex or blocked tasks |
| `/telos:map [--refresh]` | Map an existing repository: reads `telos ctx map` (scan, header to write, PROJECT state), reads 3–8 suggested files, writes `.telos/MAP.md` and requires `Map validation: PASS` (at most two repairs, else the old MAP is restored), then drafts empty PROJECT sections only. The PROJECT draft is **unconfirmed**: it asks no questions, lists `Assumed:` items and waits for your review. `--refresh` runs `telos ctx map --refresh`: `noop` only advances the header; `incremental` (≤ 30% of editable units affected) edits only the affected blocks and checks every other byte against the original; more than 30%, a stub or an unusable baseline falls back to a full build; a refresh never touches PROJECT. No commit, no ROADMAP change; any other argument prints usage |
| `/telos:map-hard [--refresh]` | Same as `/telos:map` on a stronger model, for large or tangled repositories |
| `/telos:quick <description>` | Make a small change without a phase (≤ ~5 files, < 1 hour): ≤ 5-line mini-plan in chat, implement (test first for behavior changes), run `test_related`/`test`, `lint`, `types`, commit only the touched paths as `<type>(quick): …`; no plan file or STATUS change; larger or unclear → suggests `/telos:plan` |
| `/telos:quick-hard <description>` | Same as `/telos:quick` on a stronger model, for small but tricky fixes |
| `/telos:profile <minimal\|standard\|deep>` | Switch the profile of an initialized repo: reads `telos ctx profile`, runs `telos profile <p>` once, summarizes created files; a downgrade retains HISTORY, LESSONS, CONTEXT, RESEARCH and `decisions/` (only features become unavailable); checks, stack, limits, git settings and CLAUDE.md stay unchanged; no commit |
| `/telos:status` | Show phase, task, blockers, latest result and the next step in ≤ 10 lines; reads and changes nothing |

## CLI

`map-scan` reads repository evidence without executing source files or manifests. Its tree
stops at depth 3; directory counts include deeper eligible files. Entry points are candidates,
and suggested excerpts prioritize entries, recent churn (last 100 commits), then size.

The plugin puts `telos` on the Bash PATH (`bin/`). Skills call it; you can run it too.
Exit codes: `0` ok · `1` failure or `.telos/` missing · `2` usage error.

| Command | Purpose |
|---|---|
| `telos --help` / `-h` | List commands |
| `telos --version` / `-v` | Print the version |
| `telos init --profile <p> [--stack a,b] [--checks '<json>'] [--force]` | Create `.telos/` for `minimal`, `standard` or `deep`, sync the CLAUDE.md block, add `.telos/.cache/` to `.gitignore`. Rerun-safe: creates missing files, keeps existing ones; `--force` rewrites `config.json`. Stack/checks default to detection. Exit 1 on a profile mismatch or a broken CLAUDE.md block |
| `telos status` | Compact status: current phase/task with live states from ROADMAP and the task file, Next, Blockers, Awaiting user first |
| `telos map-scan` | Deterministic inventory of tree/counts, manifests/scripts/checks, entry candidates, tests, sizes, churn, dirty paths and up to 8 suggested line ranges; works before init and without HEAD. Output ≤ 8000 UTF-16 code units including newline (2000 estimated tokens), whole-row omissions counted. Excludes git/Telos state, build/vendor/cache/virtualenv directories, lockfiles, binaries and symlinks; never executes repository code |
| `telos history add <kind> <ref> "<text>" [--path <relative-path> \| --approach "<text>"]` | Standard/deep: prepend a UTC-dated Log entry. Kinds: `decision`, `phase`, `revert`, `remove`, `quick`, `profile`, `init`; refs: `NN`, `NN-MM`, `ADR NNN`, `quick`, `telos`. Selectors are optional, mutually exclusive and only valid for `remove`/`revert`: remove records one Delete-zone target; revert clears entries for only that exact normalized path or exact approach text. Without a selector, either kind only logs. Exit 2 on invalid input, 1 on profile/storage failure |
| `telos profile <minimal\|standard\|deep>` | Change only `config.profile` (other config keys, their order and values, and CLAUDE.md are kept; no re-detection). First creates the target's missing files (`HISTORY.md`, `LESSONS.md` for standard, `decisions/` for deep), then publishes config atomically and logs `profile telos: <from> → <to>` via `history add` when HISTORY exists. Downgrades keep all files. Same profile → no-op without history. Exit 1 on invalid config or a failed write (config and HISTORY restored, safe to retry), 2 on usage |
| `telos status set <key>=<value>…` | Set STATUS lines; keys `phase`, `task`, `next`, `blockers`, `awaiting`; empty value → `none` |
| `telos status add recent "<line>"` | Prepend to Recent, keep the 3 newest |
| `telos status add carry "<line>"` | Append to Carry-over; exit 1 when 5 items exist |
| `telos status rm carry <n>` | Remove Carry-over item `n` (1-based) |
| `telos accept <id>` | Run the task's `` `cmd` → exit N `` Acceptance items (`sh -c` in the repo root, 600 s each; other items are MANUAL) and check that every changed file (work tree + commits `<type>(<id>):` since `telos/NN-start`) is in `scope`, `.telos/` or the Result's `Deviations:` line. One line per item, `accept <id>: PASS\|FAIL`; exit 1 on any FAIL |
| `telos check [--level quick\|full] [--files <path>…]` | Standard/deep: run only configured checks in the repo root. Default `full`: build, types, lint, test; `quick`: test_related when files and that command exist (otherwise test), lint, types. Missing checks print SKIP; no applicable checks prints UNVERIFIED and exits 1. Commands run unchanged except `{files}` placeholders, which receive individually quoted repo paths prefixed with `./` to prevent options; use `./` for CLI file names starting with `-`. Outside-repo paths and symlink escapes are rejected. Each command has a 600 s timeout and 64 KiB combined output limit; failures show a reason and at most 30 output lines (500 characters each). Exit 0 verified, 1 failed/unverified/profile or config error, 2 usage error. No Telos state or git writes |
| `telos lint-plan [NN]` | Check a phase's task files (default: phase from STATUS): sections per type and detail level, line limits, `scope` set and Files ⊆ scope, machine-checkable acceptance, depends (exist, no cycles), decisions in CONTEXT, id = file name. Prints `ok: N tasks` or one `<id>: <problem>` line each and exits 1 |
| `telos roadmap set <NN> <status>` | Change a phase's `[status]` in ROADMAP.md in place (`planned`, `drafted`, `active`, `done`, `dropped`) |
| `telos roadmap add <name> "<goal>" "<done when>"` | Append `- NN-name [planned] goal · done when: …` with the next free NN |
| `telos task new <NN> <slug> "<title>"` | Create the next task file `NN-MM-slug.md` (status `draft`) from the template; the phase dir is named after its ROADMAP line |
| `telos task set <id>… status=<s>` | Set the status of one or more tasks in place (comments kept); all ids are checked before any write |
| `telos task rm <id>` | Delete a `draft` task file; other statuses exit 1 |
| `telos ctx <bundle> [args]` | Print a skill's context bundle (≤ 6000 chars, comments stripped); unknown bundle → one line, exit 0 |
| `telos ctx init [profile]` | Bundle for `/telos:init`: profile, repo and Telos state, CLAUDE.md block state, detected stack/checks with evidence |
| `telos ctx map [--refresh]` | Bundle for `/telos:map`: `Map validation: NOT BUILT\|PASS <tokens>/<limit>\|FAIL <reasons>` for the whole saved MAP (machine header read before comments are stripped), mode, exact header to write, token limit, headings and ref syntax, PROJECT draft/preserve state, source suggestions, then scan rows sized to fit. `--refresh` diffs the MAP header commit to HEAD: `Mode: noop`, `incremental` (≤ 30% of nonempty sections and `###` Areas affected; adds Reason, Impact, Changed, New Area candidates and each affected block whole) or `full` with the fallback Reason. `REFUSED: …` (exit 0) without init or HEAD, with uncommitted source changes (init-managed files allowed), a limit below the skeleton, an ambiguous MAP or diff, or affected blocks too large for the 6000-char payload; other arguments → exit 2 |
| `telos ctx plan [NN\|description]` | Bundle for `/telos:plan` and `/telos:revise`: profile, target phase (STATUS phase by default, plus the NN a new phase would get; a description → the next NN), PROJECT Purpose and Rules, stack, checks, ROADMAP, phase CONTEXT, numbered carry-over items for the phase, task index, format rules |
| `telos ctx approve [NN]` | Bundle for `/telos:approve`: phase line, task index, lint-plan result, draft ids, tasks blocked by proposed or awaited decisions, phase tag, uncommitted `.telos/` changes |
| `telos ctx discuss [NN]` | Bundle for `/telos:discuss` (focus text stays in the skill body): exact `Requires standard profile. …` on minimal; `REFUSED: …` for no STATUS phase, a phase missing from ROADMAP, or a `done`/`dropped` one; otherwise profile, target line, Mode (`write` planned, `drafted`, `active` → append-only, changes via revise), CONTEXT path and line count, next free `D-NN`/`Q-NN`, decisions referenced by tasks, Awaiting user, PROJECT Purpose/Rules, carry-over, task index and the CONTEXT (or the skeleton to create). Never writes; a non-`NN` argument → exit 2 |
| `telos ctx do [id]` | Bundle for `/telos:do`: picks the in-progress task or the first approved one with done depends; `REFUSED: …` (exit 0) for draft tasks, unmet depends and proposed/awaited decisions; else the task file, STATUS, PROJECT Rules, stack, checks, CONTEXT goal and decisions, depends' Interface, Read-first excerpts (stale ones flagged) and up to 10 scope-matching MAP lines (a stub MAP → only its Not built yet hint) |
| `telos ctx profile` | Bundle for `/telos:profile` (the requested profile stays in the skill body): current profile, present/missing files per profile, phase CONTEXT/RESEARCH counts, switch and retention guidance; `REFUSED: …` on invalid config; never writes |
| `telos ctx quick` | Bundle for `/telos:quick` (the description stays in the skill body): current phase/task (warns when one is in progress), PROJECT Rules, stack, quick checks (`test_related`, `test`, `lint`, `types`), working tree (≤ 20 files), size guard |
| `telos ctx shared <name>` | Print `shared/<name>.md`, the instructions a skill and its `-lite`/`-hard` variant share (skills cannot `cat` plugin files) |
| `telos ctx status` | Bundle for `/telos:status`: status view, stack line, file pointers |

History text and approach selectors must be non-empty single lines without surrounding whitespace
or HTML comments; approaches cannot contain the separator ` — `. Paths use `/` separators;
`./`, repeated and trailing slashes normalize away. Absolute paths, traversal, backslashes,
backticks, colons and targets resolving outside the repository are refused. A selector names
one exact target: reverting `src/old` does not clear `src/older` or other entries with the same ref.

Only Log entries over `limits.history_entries` rotate, oldest first, into
`.telos/HISTORY-archive.md` (created on demand, with a `# History archive` title and `## Log`
section). Delete-zone entries, comments and unrelated sections stay intact. Existing storage
must have valid canonical sections and rows; missing HISTORY, malformed or unreadable files,
and storage symlinks are refused before mutation. Writes are staged and synced before
replacement, with the archive installed first. If interrupted between replacements, the
original live entries remain recoverable and the archive may contain duplicate live rows;
retrying is safe for retaining entries, but can preserve those duplicates. No Git writes occur.

## Hooks

Node scripts in `hooks/`, no model calls; each exits silently when `.telos/` is missing.

| Event | Profile | Behavior |
|---|---|---|
| `SessionStart` (startup, resume, clear) | all | Injects a compact status (≤ 1200 chars): *Awaiting user* first (if any), PROJECT Purpose line 1, stack, profile, phase/task with live states, Next, Blockers, carry-over count, latest Recent line, file pointers |
| `PreToolUse` Bash | all | Git guard: blocks `git push`, `--no-verify` (also `commit -n`), `git add -A` / `--all` / `.` / `:/`, `git commit --amend` when HEAD is on a remote branch, and `git reset --hard`, with exit 2 and `telos git guard: <rule> — <why>`; it splits `&&`, `;`, `|`, env prefixes, `git -C`/`-c` and `sh -c '…'`, and ignores quoted text |
