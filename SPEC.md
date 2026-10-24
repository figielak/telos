# Telos — Specification v0

> A lean, token-economical workflow plugin for Claude Code.
> Plan → test → implement → verify, with durable project memory in the repo.
> Inspired by GSD (structure, phases) and ECC (hooks, review rules, living docs), without their token cost.

Status: **draft v0** · Date: 2026-10-24 · Language of all files and commands: **English** (Claude replies in the user's language, e.g. Polish).

---

## 1. Goals and non-goals

**Goals**
- A simple, usable workflow for personal and side projects, scaling up to projects that matter.
- Durable project memory in the repo (`.telos/`): what the project is, where things are, what is in progress, what was decided. Claude should not need to read the whole repo when returning to a project.
- Explicit plan approval by the user before any code is written.
- Automatic, atomic commits per task, easy to inspect and revert.
- Three installation profiles (**minimal**, **standard**, **deep**), each a strict superset of the previous one.
- Token economy as a first-class requirement. Target: well under GSD's ~5–6× overhead (see §12).

**Non-goals**
- Fully autonomous multi-phase execution (no "run everything while I sleep").
- Multi-agent orchestration, parallel waves, multi-model workflows.
- Continuous learning / instinct systems, LLM-generated session summaries in hooks.
- Supporting every language. Target stacks: **Astro, TypeScript, Python** (others work, without stack notes).

## 2. Design principles (token economy rules)

These rules apply to every profile, including deep.

1. **Near-zero standing cost.** All Telos skills are user-invoked only (`disable-model-invocation: true`), so their descriptions are *not* in context until called. Only hooks inject context, and they are capped.
2. **Deterministic work runs outside the model.** Scanning the repo, running checks, finding commits, computing IDs and building context bundles is done by the `telos` CLI (Node, no dependencies). The model only reads compact results.
3. **Read only what the step needs.** Every command loads a fixed, minimal context bundle (via `` !`telos ctx <cmd>` `` injection), never "read the project". `telos ctx` strips HTML comments and frontmatter `#` comments from everything it injects, so the formats and limits documented in templates cost nothing per call; the model sees them only when it edits a file directly.
4. **One canonical home per fact.** Map vs status vs history vs plan never duplicate each other (from ECC's living-docs governance).
5. **Hard size limits** on every Telos file (§4). Commands trim or rotate when a limit is reached.
6. **Subagents only where a fresh context adds real value** (review, research), only in deep, only on demand or for tasks marked `critical`. They receive a prepared bundle and never explore the project on their own.
7. **At most one round** of plan critique or code review. Never a loop.
8. **Output is expensive.** Templates are short; chat summaries are ≤ 10 lines; the agent never re-writes whole files when an edit suffices.
9. **Fresh context per task is cheap.** Task files are self-contained (with phase CONTEXT), so the user can `/clear` between tasks and resume at ~1.5–3K tokens.

## 3. Profiles

Each profile is a superset of the previous one. Profile is stored in `.telos/config.json` and can be changed any time with `/telos:profile <name>`.

| Area | minimal | standard | deep |
|---|---|---|---|
| **Workflow** | plan → tests → implement → run tests → commit | + discuss, phase CONTEXT, phase close | + research, plan self-critique, code review, retro |
| **Files** | PROJECT, MAP, ROADMAP, STATUS, task files | + `NN-CONTEXT.md`, HISTORY, LESSONS | + `NN-RESEARCH.md`, `decisions/` (ADR-lite) |
| **Tests** | tests written before implementation, run after | + full verification (build, lint, types, tests) + acceptance check | + strict TDD (RED evidence) and e2e for `critical` tasks |
| **Docs** | — | README touched only when setup/usage changes | + doc-sync at phase close, CHANGELOG, docstrings for changed public API, `/telos:docs` |
| **Subagents** | none | none | reviewer, researcher (Sonnet, on demand / `critical`) |
| **Hooks** | session status, git guard | + config protection, compaction hint, batch typecheck on Stop, post-compact reinjection | + map-staleness reminder |
| **Target cost vs. plain Claude Code** | ~1.1× | ~1.3–1.5× | ~2–2.5× |

Commands not available in the current profile reply with a single line: `Requires <profile> profile. Switch with /telos:profile <profile>.`

## 4. Files in the target repository

```
.telos/
  config.json            # profile, stack, check commands, limits
  PROJECT.md             # Constitution: what the project is, rules, conventions   (≤ 60 lines)
  MAP.md                 # Map: where things are, entry points, "find X" table     (≤ ~1500 tokens)
  ROADMAP.md             # Phases (optional milestone headings) with status        (≤ 80 lines)
  STATUS.md              # Status: current phase/task, next step, blockers         (≤ 40 lines)
  HISTORY.md             # History: decisions, phase closes, delete-zone, reverts  (std+, Log rotated)
  HISTORY-archive.md     # Rotated-out Log entries, never injected                 (std+, on demand)
  LESSONS.md             # Lessons learned, `- [area] lesson (ref)`, max 20          (std+)
  decisions/             # ADR-lite files for hard-to-reverse decisions            (deep)
  phases/
    01-repo-audit/
      01-CONTEXT.md      # phase goal, decisions, constraints, links               (std+, ≤ 60 lines)
      01-RESEARCH.md     # research result, ≤ 1 page                               (deep, optional)
      01-01-check-structure.md
      01-02-check-board-game.md
  .cache/                # gitignored: edited-files accumulator, session marker
```

Root `CLAUDE.md` gets a short Telos block (≤ 15 lines) written by `/telos:init` (plugins cannot ship rules, and per-repo is better anyway). It points to `.telos/` files and states the core rules (read only what you need, delete-zone, commit format, no push). The block is wrapped in `<!-- telos:start vN -->` / `<!-- telos:end -->` and replaced in place on re-run (matching ignores `vN`, so older blocks are upgraded). It carries no profile or other per-repo state: the profile lives only in `config.json`, so switching profiles never rewrites CLAUDE.md.

### 4.1 Roles (one canonical home per fact)

| Question | Lives in | Never in |
|---|---|---|
| What is this project, which rules apply? | PROJECT.md | STATUS, MAP |
| Which stack and versions? | `config.json` `stack` + manifests (rendered by `telos ctx`) | PROJECT, MAP |
| Which check commands? | `config.json` `checks` | MAP, PROJECT |
| Where is X in the code? | MAP.md | STATUS, HISTORY |
| What is in progress / next / blocked? | STATUS.md | MAP, task files |
| Which phases exist and their state? | ROADMAP.md | STATUS (links only) |
| Why was X decided / removed / reverted? | HISTORY.md, `decisions/` | MAP, PROJECT |
| How exactly is task 01-02 done? | task file | CONTEXT, STATUS |
| What changed in code? | git (commits) | Telos files |

**PROJECT.md sections** (headings stable): *Purpose* (line 1 ≤ 100 chars, shown by SessionStart), *Rules* (≤ 10 lines of hard project rules, injected into every `do`/`quick` bundle), *Conventions* (naming, layout, patterns; read on demand via `PROJECT.md §Conventions`; promoted lessons land here), *Out of scope* (never built, as opposed to Delete-zone: built and removed). Telos workflow rules live in the CLAUDE.md block; the stack is `config.json` `stack` plus versions from the manifests, rendered live by `telos ctx` (`stackLine()` in `lib/ctx`) into the `plan`/`do`/`quick` bundles and SessionStart, so it is never written down and never goes stale.

**ROADMAP.md**: one phase per line, `- NN-name [status] goal · done when: criterion`, where `NN-name` matches the directory in `phases/`. Optional milestone headings `## M1 · Name`; a finished milestone collapses to `## M1 · Name — done (01–05)`. Lines are changed only by `telos roadmap set <NN> <status>`, never rewritten by hand. Status transitions:
- `planned`: phase exists, no task files (added by the user, or proposed by the first `map`).
- `drafted`: `plan` wrote draft task files (`revise` keeps it).
- `active`: `approve`.
- `done`: `done` (std+); in minimal, `do` after the last task of the phase.
- `dropped`: on explicit user request; the line stays so the phase number is not reused.

**Delete-zone** (section of HISTORY.md, from ECC): paths or approaches intentionally removed, so the agent does not recreate them. Never rotated. Two line forms:
- `` - `path/` — reason (ref, YYYY-MM-DD) ``: checked by the delete-zone hook (§8) on every Edit/Write.
- `- approach: … — reason (ref, YYYY-MM-DD)`: injected by `telos ctx` into `plan` and `quick` bundles.

**Log** (section of HISTORY.md): one line per entry, newest first, `- YYYY-MM-DD <kind> <ref>: text`, written only by `telos history add <kind> <ref> "<text>"` (never by hand). Kinds: `decision | phase | revert | remove | quick | profile | init`; refs: `NN`, `NN-MM`, `ADR NNN`, `quick`, `telos`. Over `limits.history_entries`, the oldest entries move to `HISTORY-archive.md`.

**Lessons** (LESSONS.md, std+): one line each, `- [area] lesson (ref)`. `area` is a path prefix (`src/game/`) or a topic (`tests`, `astro`, `git`); `ref` is the source task (`01-02`) or `quick`.
- **Readers.** `telos ctx plan` includes all lessons (once per phase, so cheap) and `plan` turns the relevant ones into the Constraints of the tasks they apply to. `telos ctx quick` includes only lessons whose area matches the paths in the change description, since quick has no plan to filter them. `do` never reads LESSONS: the lesson already sits in the task where it applies.
- **Full list (20).** `/telos:lesson` does not add a 21st entry; it proposes either promoting a lesson that became a rule to PROJECT.md §Conventions (removing it from LESSONS, one canonical home) or dropping a stale one. Duplicates are detected by area first.

### 4.2 Naming

- Phase directory: `NN-kebab-name` (e.g. `01-repo-audit`).
- Phase context: `NN-CONTEXT.md`. Research: `NN-RESEARCH.md`.
- Task file: `NN-MM-kebab-name.md` (e.g. `01-02-check-board-game.md`). Task ID = `NN-MM`.
- A phase with a single task may merge CONTEXT into the task file (std+).

### 4.3 Task file template (normal level ≤ 80 lines; detailed level see §4.3.3)

```markdown
---
id: 01-02
title: Check board game module
type: code               # code | doc | audit
status: draft            # draft | approved | in-progress | done | blocked | reverted
critical: false          # deep: enables TDD-RED evidence, e2e, review
effort: normal           # normal | hard — hint to use /telos:do-hard (see §5.0)
depends: [01-01]
decisions: [D-03]        # from NN-CONTEXT.md
scope: [src/game/, tests/game/]   # paths the task may change (.telos/ always allowed)
---
## Goal
One or two sentences.

## Read first
- src/game/board.ts:20-60 (grid model)
- PROJECT.md §Conventions

## Files
- src/game/rules.ts (modify)
- tests/game/rules.test.ts (create)

## Constraints
- no new dependencies

## Tests (write first)      <!-- type: code only -->
- rejects moves outside the 8x8 grid

## Steps
1. ...

## Acceptance
- [ ] all listed tests pass
- [ ] `npx vitest run tests/game` → exit 0
<!-- scope is checked automatically, no criterion needed -->


## Result
<!-- filled by /telos:do: 3–5 lines -->
Deviations: none
```

`templates/task.md` holds the empty form: guidance in comments, empty sections, `scope` required, detailed-level sections (§4.3.3) as a commented skeleton.

### 4.3.1 Field and section semantics

| Field / section | Meaning | How Telos uses it |
|---|---|---|
| `type` | `code`: changes behavior, has tests. `doc`: changes documentation only. `audit`: inspects, changes no code. | `do` picks the flow (§5.1). `Tests` is required for `code` and omitted for `doc`/`audit`. Commit type: `code` → feat/fix/refactor/test, `doc` and `audit` → `docs`. |
| `decisions` | IDs `D-NN` defined in the phase's `NN-CONTEXT.md` (std+). Empty in minimal. | `telos ctx do` injects only the referenced decisions plus the CONTEXT goal, not the whole CONTEXT. |
| `scope` | Path prefixes (or globs) the task may change. `.telos/` is always allowed. **Required**: `plan` always fills it and `lint-plan` rejects `[]` or a missing field. Deliberately unrestricted = `["*"]`; audit tasks = `[".telos/"]`. | `telos accept <id>` always checks that every changed file (`git status` + commits of the task) is inside `scope` ∪ `.telos/`; no hand-written grep commands in plans. The scope hook (§8, std+) warns at edit time. `Files` must lie inside `scope`; `plan` validates this. |
| `Read first` | Exact excerpts the task needs: `path:start-end (label)` or `FILE.md §Section`. | `telos ctx do` extracts these excerpts into the bundle, so the agent does not open whole files. If a file changed since the plan was approved (compared with `telos/NN-start`), ctx flags the range as possibly stale and the agent re-locates it by the label. Labels should name a symbol or concept. |
| `Files` | Files the task may create or modify. | Config protection allows protected configs only when listed here. `do` stages only these (plus the task file and STATUS). |
| `Constraints` | Task-specific rules (scope, no new dependencies, keep API stable…). | Included verbatim in the bundle. |
| `Acceptance` | Checkbox criteria. An item with a backticked command followed by `→ <expected>` is machine-checkable. `plan` adds `all listed tests pass` only for `type: code`. | `telos accept <id>` runs the machine-checkable items and reports PASS/FAIL; the agent verifies the rest and ticks the boxes. |
| `Result` | 3–5 lines written by `do` (audit: ≤ 10, findings + proposed follow-ups). Last line always `Deviations: none` or `Deviations: path — why` (one entry per out-of-scope edit). | Read by later tasks, `done` and `undo`. `telos accept` fails a task whose out-of-scope files are not listed in `Deviations`. |

**Audit tasks** produce findings, not code. Findings go into `Result` (≤ 10 lines for audits); each finding that needs work becomes a proposed follow-up task, which the user approves through `plan`/`revise`. An audit task never modifies files outside `.telos/`.

### 4.3.3 Plan detail scales with risk

Detail is spent only where a wrong guess is expensive. `plan` picks the level per task from `effort` and `critical`:

| Level | When | Sections | Size |
|---|---|---|---|
| **Normal** | `effort: normal` and `critical: false` | Template above. `Steps` may be high-level (3–6 bullets). | ≤ 80 lines (~300–800 tokens) |
| **Detailed** | `effort: hard` or `critical: true` | Template above **plus** `Interface` and `Edge cases`; `Steps` become concrete. | ≤ 140 lines (~800–1600 tokens) |

Extra sections for detailed tasks:

```markdown
## Interface
<!-- contracts the task introduces or changes: signatures, types, API shapes, events; ≤ 15 lines -->
export function validateMove(board: Board, move: Move): Result<Move, MoveError>
type MoveError = { kind: 'out_of_bounds' | 'occupied' | 'not_your_turn'; at: Coord }

## Edge cases
<!-- each one maps to a test (type: code) or an acceptance item (doc/audit) -->
- move to (8, 0) → out_of_bounds
- move onto own piece → occupied
- move when it is the opponent's turn → not_your_turn

## Steps
<!-- concrete: file + function, in order, each step verifiable -->
1. src/game/types.ts: add Move, MoveError
2. src/game/rules.ts: implement validateMove; reuse Board.inBounds (board.ts:34)
3. tests/game/rules.test.ts: one test per edge case
```

Rules:
- `critical` raises the detail level in **every** profile; its other effects (TDD-RED evidence, e2e, review) stay deep-only.
- For `type: code`, every edge case must appear in `Tests`; `plan` checks this before presenting.
- The `Interface` section is included in the `telos ctx do` bundle of later tasks that `depend` on this one, instead of the implementation, so dependents stay cheap.
- `telos lint-plan` (run by `plan` before the summary) checks required sections per level, size limits, `scope` present and non-empty, and `Files ⊆ scope`.
- The plan summary marks detailed tasks (`01-02 [hard]`, `01-03 [critical]`) so the user sees where the extra detail went.

### 4.3.2 Phase CONTEXT template (std+, ≤ 60 lines)

```markdown
# 01 · Repo audit
## Goal
Find structural problems in the game module before adding features.
## Decisions
- D-01: Keep game logic framework-free (pure TS modules).
- D-02 [proposed]: Move board rendering into an Astro island.
## Constraints
- no public API changes in src/game/
## Open questions
- Q-01: Is the legacy scoring endpoint still used?
## Carried over
- rate limit for score endpoint → 01-02 Result ⇒ 02-03
## Links
- MAP.md §Game
```

Conventions (guidance lives in HTML comments in `templates/CONTEXT.md`; empty sections hold `- none`):
- **Goal** is 2–3 sentences and is injected into every task bundle of the phase.
- **Decisions:** `D-NN: …` is confirmed, `D-NN [proposed]: …` awaits the user. `approve`/`do` refuse a task whose `decisions` include a proposed one, and STATUS *Awaiting user* lists them. After `done`, a promoted decision gets `→ ADR NNN` or `→ HISTORY`.
- **Open questions** are `Q-NN: …`; when answered they are removed and recorded as a `D-NN`.
- **Carried over** items keep their source (`→ <source>`) and get `⇒ NN-MM` once a task covers them.
- **Constraints** are phase-specific only; project-wide rules live in PROJECT.md.

Decision IDs are phase-local (`D-01` in phase 01 and `D-01` in phase 02 are different). Hard-to-reverse decisions are promoted to `decisions/` (deep) or HISTORY (std) at `done`, with a global reference.

### 4.4 STATUS.md template (≤ 40 lines)

```markdown
# Status
Phase: 01-repo-audit
Task: 01-02
Next: implement move validation, then run tests
Blockers: none
Awaiting user: 01:D-03, 01:Q-01

## Carry-over
- 02: rate limit for score endpoint → 01-02 Result

## Recent
- 01-01 done: structure audit
```

**Rules**
- **One format, CLI-maintained.** STATUS has no frontmatter: fixed `Key: value` prefix lines plus two lists. The agent never edits it by hand. `telos status set phase=… task=… next=… blockers=… awaiting=…` changes the lines; `telos status add recent "<line>"` (keeps 3), `telos status add carry "<line>"` (exit 1 when 5 are present) and `telos status rm carry <n>` change the lists. Guidance lives in HTML comments; empty values are `none` / `- none`.
- **Pointers only.** STATUS says *which* phase and task are current, never their state. Phase state lives in ROADMAP, task state in the task file's frontmatter; `telos status` and the SessionStart hook read them from there (e.g. `Phase: 01-repo-audit [active] · Task: 01-02 [in-progress]`), so STATUS can never contradict them. No `profile` (canonical in `config.json`, read by the hook) and no `updated` (git knows).
- **Next** is set by `init` from the repo state (existing code → `/telos:map`, empty repo → `/telos:plan`) and afterwards by each command that changes the current step.
- **Blockers**: `NN-MM: reason`, set by `do` when it marks a task `blocked`.
- **Awaiting user**: IDs only, phase-prefixed because `D-NN`/`Q-NN` are phase-local (`02:D-03, 02:Q-01`). Items the agent cannot resolve alone (proposed decisions, open questions, credentials). The SessionStart hook shows this line first. `approve`/`do` refuse a task that depends on a decision still listed here.
- **Carry-over** (max 5): work discovered during a phase that belongs to a later phase. Format: `- <target phase NN>: <item> → <source task or file>`. When `plan` runs for phase NN, matching items are moved into that phase's CONTEXT (std+, section *Carried over*) or into its task files (minimal), and removed from STATUS. When the list is full, `do` asks the user whether to add a ROADMAP phase or drop an item.
- **Recent** (max 3): newest first, `- NN-MM done: one line`; older entries are dropped (full trail is in git and HISTORY).

### 4.5 config.json

```json
{
  "version": 1,
  "profile": "standard",
  "files_language": "en",
  "stack": ["astro", "typescript"],
  "checks": {
    "build": "npm run build",
    "types": "npx astro check && npx tsc --noEmit",
    "lint": "npx eslint .",
    "test": "npx vitest run",
    "test_related": "npx vitest related --run {files}",
    "e2e": "npx playwright test"
  },
  "docs": { "readme": "README.md", "changelog": "CHANGELOG.md", "paths": ["docs/"] },
  "protected_configs": ["eslint.config.*", "biome.json", "tsconfig.json", "ruff.toml", "pyproject.toml#tool.ruff"],
  "limits": { "status_lines": 40, "map_tokens": 1500, "history_entries": 30 },
  "git": { "auto_commit": true, "phase_tags": true },
  "strict_scope": false
}
```

Check commands are detected once by `init`/`map` (from `package.json`, `pyproject.toml`, lockfiles) and confirmed by the user, so the agent never guesses them later.

## 5. Commands

All commands are plugin skills invoked as `/telos:<name>`. All have `disable-model-invocation: true`. Default models are set in frontmatter (`opus` for thinking, `sonnet` for doing). Several commands have a `-hard` (stronger model) or `-lite` (cheaper model) variant, see §5.0.

| Command | Variant | Profile | Model | Purpose |
|---|---|---|---|---|
| `init [profile]` | | all | sonnet | Create `.telos/`, detect stack and checks, write CLAUDE.md block, gitignore `.telos/.cache/` |
| `map [--refresh]` | `map-hard` | all | sonnet | Build or incrementally update MAP.md (§6) |
| `plan [phase\|description]` | `plan-lite` | all | opus | Write phase task files (+ CONTEXT in std+), short chat summary, status `draft` |
| `approve` | | all | sonnet | Mark plan approved, update STATUS/ROADMAP, commit `docs(telos)`, create phase tag |
| `revise <notes>` | `revise-lite` | all | opus | Discuss/adjust the draft plan, re-summarize |
| `do [task-id]` | `do-hard` | all | sonnet | Execute next (or given) approved task: tests → implement → run → commit |
| `quick <description>` | `quick-hard` | all | sonnet | Small change without a phase: mini-plan in chat → implement → test → commit |
| `status` | | all | sonnet | Show STATUS + next step (from CLI output, minimal model work) |
| `profile <name>` | | all | sonnet | Switch profile, adjust files (e.g. create HISTORY when moving to std) |
| `discuss [phase]` | | std+ | opus | Clarify scope/decisions before planning, write `NN-CONTEXT.md` |
| `check` | | std+ | sonnet | Run full verification via `telos check`, verify acceptance criteria |
| `done [phase]` | | std+ | sonnet | Close phase: verify, HISTORY entry, ROADMAP update, compaction hint; deep: retro, doc-sync, CHANGELOG, review of `critical` work |
| `undo <task-id>` | | std+ | sonnet | Show commits of the task (`--stat`), warn about later dependent commits, confirm, `git revert`, update STATUS/HISTORY |
| `lesson <text>` | | std+ | sonnet | Add `- [area] lesson (ref)` to LESSONS.md (dedupe by area; when full, propose promote-to-PROJECT or drop instead of a 21st, §4.1) |
| `research [phase]` | `research-hard` | deep | sonnet (forked) | Researcher subagent with a prepared bundle, writes `NN-RESEARCH.md` (≤ 1 page) |
| `review [task\|phase]` | `review-hard` | deep | sonnet (forked) | Reviewer subagent on the diff + acceptance criteria |
| `docs [scope]` | | deep | sonnet | Update README / docs / docstrings for a scope on demand |

### 5.0 Model variants (`-hard` / `-lite`)

A skill's `model` frontmatter is fixed per skill and applies only to the turn that invokes it, so Telos ships variants instead of a runtime switch. Variant names describe **when** to use them, not which model they run, so they survive model generations (only frontmatter changes).

| Base (model) | Variant (model) | Use the variant when |
|---|---|---|
| `do` (sonnet) | `do-hard` (opus) | complex logic, cross-module refactors, subtle bugs, a task that `do` marked `blocked` |
| `quick` (sonnet) | `quick-hard` (opus) | a small but tricky fix |
| `map` (sonnet) | `map-hard` (opus) | large or tangled repos where architecture and flows must be understood, not just listed |
| `review` (sonnet agent) | `review-hard` (opus agent) | `critical` work: security, payments, concurrency, data integrity |
| `research` (sonnet agent) | `research-hard` (opus agent) | architectural decisions and library choices with real trade-offs |
| `plan` (opus) | `plan-lite` (sonnet) | small, obvious phases (2–3 simple tasks) |
| `revise` (opus) | `revise-lite` (sonnet) | minor plan edits: split, reorder, rename tasks |

Rules:
- **No duplication.** Each variant's SKILL.md holds only frontmatter and injects the shared instructions (`` !`cat ${CLAUDE_PLUGIN_ROOT}/shared/do.md` ``), so base and variant behave identically. Forked variants use separate agent files (`reviewer-hard.md`, `researcher-hard.md`) because a subagent's model is set in its definition.
- **Zero standing cost.** Variants are user-invoked only, so they are not in context unless called; typing `/telos:do` shows both entries in the menu.
- **Per-task hint.** `plan` may set `effort: hard` in a task's frontmatter (complex logic, cross-module refactors, subtle bugs). When `/telos:do` picks such a task, it stops before doing work and suggests `/telos:do-hard <id>`; replying "continue" keeps the base model.
- **Escalation on block.** When `do` marks a task `blocked` after its fix attempts, it suggests `/telos:do-hard <id>`.
- **Scoped to one turn.** After the turn the session returns to its own model, so one hard task does not switch the rest of the session.

### 5.1 Core loop (minimal)

```
/telos:plan "add move validation"   → task files written (draft) + ≤10-line summary in chat
/telos:revise "split task 2"        → optional, any number of times
/telos:approve                      → status approved, commit docs(telos), tag telos/01-start
/telos:do                           → for the next task (respecting `depends`):
                                       1. load bundle: STATUS + task file + "Read first" excerpts
                                          + stack line + PROJECT §Rules + referenced decisions (std+)
                                          + relevant MAP lines
                                       2. type-specific work (below)
                                       3. run `telos accept <id>` + agent check of remaining Acceptance items
                                       4. fill "Result", update STATUS
                                       5. commit (listed Files + task file + STATUS in one commit)
/clear (optional)                   → next /telos:do resumes from STATUS cheaply
```

| `type` | Step 2 |
|---|---|
| `code` | write the tests from "Tests" → implement → run tests (`test_related` or `test`) |
| `doc` | edit the listed docs → run cheap doc checks if configured (build, link check) |
| `audit` | inspect "Read first" and listed paths → write findings to Result → propose follow-up tasks; no code changes |

If tests fail after a reasonable fix attempt (max 2 attempts in minimal/standard), `do` stops, sets task `blocked`, writes the reason in STATUS, and does not commit broken code.

### 5.2 Plan approval

**Clarifying questions (all profiles, incl. `plan-lite`).** Before writing any file, `plan` asks questions only when it genuinely has to. One wrong guess costs a `revise` round or a redone task, which is far more expensive than one short exchange.

- **Ask only when** the answer changes the plan (scope, approach, data model, acceptance criteria, task split) **and** it cannot be inferred from PROJECT, MAP, CONTEXT (incl. decisions from `discuss`), carry-over items or a quick look at the code.
- **Do not ask** about things with a conventional default or a cheap-to-change choice; state the assumption in the plan summary instead (`Assumed: …`), so the user can correct it at approval.
- **One batch, max 4 questions,** multiple choice where possible, recommended option first (`AskUserQuestion` in Claude Code). No follow-up rounds; anything still unclear goes to *Open questions* in the summary.
- **Answers are recorded** where they belong: as decisions `D-NN` in `NN-CONTEXT.md` (std+) or in the relevant task's Constraints (minimal), so later commands never ask again.
- If `discuss` already ran for the phase, `plan` asks only about gaps the CONTEXT leaves open.
- Deep self-critique that surfaces a new blocking question adds it to the summary and to *Awaiting user* in STATUS instead of starting a second question round.

**Approval**

- `plan` writes files with `status: draft` and prints a summary: phase goal, task list (id + one line), risks, open questions. ≤ 10 lines.
- The user replies with `/telos:approve` or `/telos:revise <notes>`. Free-form chat is also fine; `revise` just makes intent explicit.
- Deep: `plan` includes a single self-critique pass (risks, edge cases, missing tests) before presenting. No checker loop.

### 5.3 Quick path

`quick` is for changes that do not deserve a phase (≈ < 1 hour, ≤ ~5 files). It writes no plan file and, by default, no HISTORY line: the change itself lives in git as `<type>(quick): …`. Only a quick change that carries a *why* worth keeping (a decision or a removal) adds one HISTORY entry with kind `quick` (std+). It commits with scope `quick`. If the change turns out larger, it stops and suggests `/telos:plan`.

## 6. `map` (existing repositories)

Goal: MAP.md that lets Claude navigate the repo without reading it. Available in all profiles.

1. **Deterministic scan** (`telos map-scan`, no model): directory tree (depth-limited, ignoring build/vendor dirs), manifests (`package.json`, `pyproject.toml`, `astro.config.*`), detected entry points, scripts, test locations, largest/most-changed files from `git log`, file counts per directory. Output ≤ ~2K tokens.
2. **Targeted reading:** Claude reads only the entry points and 3–8 key files suggested by the scan (excerpts, not whole files).
3. **Write MAP.md** (≤ ~1500 tokens), format from ECC codemaps, filling the fixed sections of `templates/MAP.md`: Structure, Entry points, Flows (`route → handler → service → store`), Areas (one `###` per domain with key files and line ranges), Find (`X → path[:lines]`). MAP answers only *where is X*: rules and conventions live in PROJECT.md, stack and check commands in `config.json`. Headings are stable, because tasks and CONTEXT link to `MAP.md §Heading`; the "Not built yet" paragraph is removed. Header: `<!-- telos-map: commit <hash> · <date> · files <n> -->`.
   - **Not built** (`<!-- telos-map: not built -->`, written by `init`): `telos ctx` injects only the "Not built yet" line instead of MAP excerpts, and `map --refresh` falls back to a full build.
4. **Incremental refresh** (`map --refresh`): `git diff --name-status <hash>..HEAD` → update only affected sections (and only affected `###` areas). Full rebuild only if > 30% of the map is affected or on request.
5. **First run also drafts PROJECT.md** (purpose, rules, conventions; no stack) for the user to confirm, and proposes initial ROADMAP phases if the user wants.

Optional for very large repos: the scan step may run in a forked Explore agent so the main context stays clean. Off by default.

## 7. Verification

`telos check [--level quick|full] [--files ...]` runs the configured commands and prints a compact report (only failures, first ~30 lines each):

```
TELOS CHECK  build:PASS  types:FAIL(3)  lint:PASS  tests:PASS(42/42)
types: src/game/rules.ts:41  Type 'number' is not assignable to 'Coord'
...
```

| Profile | During `do` | `check` / `done` |
|---|---|---|
| minimal | task tests (`test_related` or `test`) | — |
| standard | task tests + types on edited files (Stop hook) | build + types + lint + tests + acceptance criteria |
| deep | + TDD RED evidence and e2e for `critical` tasks | + review subagent for `critical` work, coverage of changed area if configured |

## 8. Hooks

All hooks are Node scripts in the plugin, no LLM calls, each checks the profile from `config.json` and exits silently when not applicable or when `.telos/` does not exist.

| Event | Profile | Behavior |
|---|---|---|
| `SessionStart` (startup, resume, clear) | all | Inject compact status: *Awaiting user* first (if any), then project one-liner (PROJECT §Purpose line 1), stack line, profile, phase/task, next step, blockers, carry-over count, file pointers. Cap ~1200 chars. |
| `SessionStart` (compact) | std+ | Re-inject status + last task id + files edited before compaction (from `.cache`). |
| `PreToolUse` Bash | all | Git guard: block `--no-verify`, `git push`, `git add -A` / `git add .`, `git commit --amend` on pushed commits, `git reset --hard` without user request. Message explains the rule. |
| `PreToolUse` Edit/Write | std+ | Config protection: block edits to `protected_configs` unless the task file lists the config under Files. |
| `PreToolUse` Edit/Write | std+ | Scope guard: when a task is `in-progress` and the target path is outside its `scope` (and outside `.telos/`), add a warning to context naming the scope. Does not block; the agent must either stay in scope or record the deviation in Result's `Deviations:` line. `strict_scope: true` in config turns the warning into a block. |
| `PreToolUse` Edit/Write | std+ | Delete-zone guard: when the target path is under a path listed in HISTORY.md §Delete-zone, add a warning with the reason and ref, ending with: *If the user asked for this, proceed and remove the entry (`telos history add revert …`).* (that command logs the revert and drops the matching Delete-zone line, so the warning does not repeat forever). Once per path per session (marker in `.cache/`). Does not block and has no flag of its own: delete-zone is a project-wide rule, unrelated to task `scope`/`strict_scope`; a blocking flag is considered in 06-measure only if warnings prove ignored. |
| `PostToolUse` Edit/Write | std+ | Append edited path to `.cache/edited` (no output). |
| `Stop` | std+ | Batch format + typecheck of edited files once per response; report only failures. Guarded against loops (`stop_hook_active`). |
| `PreToolUse` Edit/Write | std+ | Compaction hint from transcript usage (e.g. at ~70% and every +15%), max once per threshold, with the ECC decision table in one line. |
| `PreCompact` | std+ | Mechanical: write last task id + edited files to `.cache/session`. |
| `Stop` | deep | Map-staleness reminder when new top-level dirs or entry points appeared since the map commit. |

## 9. Subagents (deep only)

Both agents run on Sonnet (`reviewer-hard` / `researcher-hard` are identical definitions on Opus, used by the `-hard` command variants), receive a bundle prepared by the CLI, and have a hard output cap.

**reviewer** (tools: Read, Grep, Glob, Bash limited to `git diff`/`git log`)
- Input: diff of the task/phase, task acceptance criteria, relevant MAP lines.
- Rules (condensed from ECC code-reviewer): only changed code; only issues with > 80% confidence; HIGH/CRITICAL require evidence (file:line, scenario, impact) or are demoted; zero findings is a valid result; checklist: correctness, security, error handling, tests, stack-specific pitfalls.
- Output ≤ 40 lines: findings by severity + verdict. One round; the main agent fixes, no re-review loop (the user may request another review).

**researcher** (tools: Read, Grep, Glob, WebSearch, WebFetch)
- Input: phase goal, open questions from CONTEXT, stack, relevant MAP lines.
- Search-first rule (from ECC): prefer existing libraries/patterns, check current docs/versions.
- Output ≤ 1 page into `NN-RESEARCH.md`: recommendations, options with trade-offs, sources.

## 10. Git conventions

**Format:** Conventional Commits, English, imperative, subject ≤ 72 chars, scope = task ID.

```
<type>(<scope>): <subject>

- 2–4 bullets describing behavior change (not a file list)
```

| Origin | Scope | Example |
|---|---|---|
| Phase task | `NN-MM` | `feat(01-02): add board game rules validator` |
| Quick path | `quick` | `fix(quick): correct date format on blog cards` |
| Telos files (plan, close) | `telos` | `docs(telos): plan phase 02-auth` |

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `style`, `build`, `ci`.

**Rules for the agent**
1. Commit after each task (several commits per task allowed, same scope).
2. Telos file updates for a task (Result, STATUS) go into the same commit as the code.
3. No commit when verification fails (std+); set task `blocked` instead.
4. Never `--no-verify`, never amend/rebase pushed commits, never `git push` (user pushes).
5. Stage only files changed by the task; never `git add -A` / `git add .`.
6. No Telos trailer. The scope format is strict (`NN-MM`, `quick`, `telos`) because `undo` and lookups rely on it: `git log --grep="^[a-z]*(01-02):"`. Claude Code's own `Co-Authored-By` trailer is controlled by Claude Code settings, not by Telos.
7. Phase tags (all profiles, local only): `telos/NN-start`, created by `approve` before the first task commit; `git diff telos/01-start` shows the whole phase.

## 11. Documentation (deep)

Documentation is kept in sync cheaply, driven by the diff rather than by reading all docs.

- **Doc-sync at `done`:** `telos docs-scan` lists files changed since `telos/NN-start` and doc files (README, `docs.paths`) that reference those paths or exported symbols. Claude updates only those docs. Typical cost: a few small edits.
- **CHANGELOG:** `telos changelog` drafts entries from the phase's conventional commits; Claude condenses to ≤ 10 lines under a version/date heading.
- **Docstrings / JSDoc:** new or changed *public* functions in the phase must have a short docstring; checked by the reviewer checklist and fixed in the same phase.
- **ADR-lite (`decisions/NNN-title.md`, ≤ 30 lines):** created when a phase records a hard-to-reverse decision (storage, framework, API shape). HISTORY links to it.
  - Header is written by the CLI, never by the model: `telos adr new "<title>" --source 02:D-03 [--supersedes NNN]` computes the next number, sets date, `Status: accepted`, `Source: 02:D-03` (the global reference for the phase-local ID, same `NN:` prefix as STATUS *Awaiting user*) and `Supersedes:`. With `--supersedes`, it also flips the old ADR to `Status: superseded by NNN`.
  - Status values: `accepted` | `superseded by NNN` | `reverted (date, task or commit)`. Only `accepted` is binding; `undo` of the source task sets `reverted`.
  - Sections: Context (≤ 5 lines), Decision (≤ 3), Alternatives (one line each), Consequences (≤ 4 bullets), then one-line fields **`Reverse by:`** (kept separate because reversibility is why the ADR exists) and `Links:` (HISTORY entry, `NN-RESEARCH.md`, MAP §Section). Guidance lives in HTML comments, not placeholder prose.
- **`/telos:docs [scope]`:** on-demand refresh of README sections (setup, usage, scripts) or module docs, using MAP as the source of structure.
- Standard profile: `do`/`done` only touch README when setup, scripts or usage changed.

## 12. Token budget

Targets for v0 (to be measured on a real repo in the tuning phase):

| Item | Target |
|---|---|
| Always-on plugin cost (skill listings) | ~0 (all skills user-invoked) |
| SessionStart injection | ≤ ~400 tokens |
| CLAUDE.md Telos block | ≤ ~250 tokens |
| `plan` for a 3-task phase (incl. reading bundle) | ~8–15K |
| `do` per task (excl. the code work itself) | ~2–4K overhead |
| `map` on a mid-size repo | ~15–30K once; refresh ~3–8K |
| `review` (deep) | ~10–20K per phase |

Measurement tools: `claude plugin details telos` (always-on tokens), `/context`, and a `telos budget` command that reports sizes of Telos files and the injected blocks.

## 13. Packaging and installation

**Plugin repository layout**

```
telos/
  .claude-plugin/
    plugin.json
    marketplace.json        # the repo is also its own marketplace
  skills/
    init/SKILL.md  map/SKILL.md  plan/SKILL.md  approve/SKILL.md  revise/SKILL.md
    do/SKILL.md  quick/SKILL.md  status/SKILL.md  profile/SKILL.md
    map-hard/  plan-lite/  revise-lite/  do-hard/  quick-hard/  research-hard/  review-hard/   # variants: frontmatter + shared body
    discuss/SKILL.md  check/SKILL.md  done/SKILL.md  undo/SKILL.md  lesson/SKILL.md
    research/SKILL.md  review/SKILL.md  docs/SKILL.md
  agents/
    reviewer.md  reviewer-hard.md  researcher.md  researcher-hard.md
  hooks/
    hooks.json
  bin/
    telos                   # Node CLI on the Bash PATH while the plugin is enabled
  lib/                      # CLI modules (ctx, check, accept, lint-plan, map-scan, docs-scan, changelog, adr, history, roadmap, git helpers)
  shared/                   # instruction bodies shared by base skills and variants (do.md, quick.md, map.md, plan.md, ...)
  templates/                # PROJECT, STATUS, ROADMAP, CONTEXT, task, ADR, CLAUDE.md block
  stack-notes/              # short Astro / TypeScript / Python notes, loaded by ctx when relevant
  SPEC.md  README.md
```

**Skill pattern** (example `do`):

```yaml
---
name: do
description: Execute the next approved Telos task
argument-hint: "[task-id]"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash(telos *), Bash(git status*), Bash(git diff*), Bash(git add *), Bash(git commit *)
---
## Context
!`telos ctx do $ARGUMENTS`

## Instructions
...
```

**Installation (per repository)**

```
/plugin marketplace add <user>/telos
/plugin install telos@telos        # choose "this repo only" (local) or project scope
/telos:init standard
```

Requirements: Claude Code with plugin support, Git, Node.js (present in Astro/TS projects; required for the CLI and hooks).

## 14. Build roadmap for Telos itself

| Phase | Content | Done when |
|---|---|---|
| 01-skeleton | plugin.json, marketplace.json, CLI skeleton (`ctx`, `status`), templates, `init`, config schema, CLAUDE.md block | `/telos:init` works in a test repo |
| 02-core-loop | `plan`, `approve`, `revise`, `do`, `quick`, `status`, `telos roadmap set`, SessionStart hook, git guard | a minimal phase runs end to end with commits |
| 03-map | `map-scan`, `map`, incremental refresh, PROJECT draft | MAP.md for a real Astro and a real Python repo under limits |
| 04-standard | `discuss`, CONTEXT, `check` + `telos check`, `done`, `undo`, `lesson`, LESSONS in `ctx plan` (all) and `ctx quick` (area-matched), profile switching, std hooks | standard phase incl. undo works |
| 05-deep | reviewer, researcher, `research`, `review`, critical/TDD/e2e, docs (§11), ADR, retro | deep phase incl. doc-sync works |
| 06-measure | budget measurements on 2–3 real repos, trim templates and prompts, README; decide whether the delete-zone guard needs a blocking flag | targets in §12 met or documented |

From phase 03 on, Telos is developed with Telos (minimal profile) to validate the workflow.

## 15. Open questions

1. Default models: `opus` for plan/discuss/revise may be heavy on the Pro plan. `plan-lite` / `revise-lite` cover cheap planning; measurements will show whether the defaults should flip. Also to verify: whether the `` !`cat …` `` injection of shared instructions behaves identically to inline content (permissions, size).
2. Scope of `stack-notes`: which Astro/Python conventions are worth encoding (keep each ≤ ~300 tokens).
3. Windows support for hooks and CLI (Node makes it feasible; needs testing).
4. Whether `.telos/` should be committed in full (recommended: yes, except `.cache/`).

## References

- Claude Code plugin manifest reference: https://code.claude.com/docs/en/plugins-reference
- Claude Code skills (frontmatter, `disable-model-invocation`, `!` injection): https://code.claude.com/docs/en/skills
- Claude Code plugin install scopes: https://code.claude.com/docs/en/plugins/install.md
- ECC (hooks, code-reviewer rules, living-docs-governance, codemaps): https://github.com/affaan-m/ECC
- GSD Core (phase structure, fresh-context execution): https://github.com/open-gsd/gsd-core
