# 06-07 Tuning record

Outcome: **no prompt or template text changed** (justified no-change under D-03). One regression test now pins the per-run do/plan bodies at their measured size and keeps their gates.

## Baseline (repo HEAD `f1b1b10`, before this task)
| Body / template | Raw file | Rendered (`telos ctx shared`, comments stripped) | Est. tokens (chars/4) | Paid |
|---|---|---|---|---|
| `shared/do.md` | 5519 B | 5367 chars (installed 0.1.0: 5331 B) | ~1342 | every do / do-hard |
| `shared/plan.md` | 5309 B | 5198 chars | ~1300 | every plan / plan-lite |
| `shared/map.md` | 4710 B | — | ~1180 | every map run |
| `shared/review.md` | 2437 B | 2322 B (installed) | ~580 | every review |
| `templates/claude-block.md` | 672 B | 662 chars in CLAUDE.md | ~166 | every session |
| `templates/task.md` | 1329 B | per task file | ~330 | per new task |

## Live usage these bodies sit in (06-04/05/06, host-reported, not estimates)
- Trivial "reply ok" session in a Telos copy: input + cache_creation + cache_read = 48595 (Astro), 43570 (BlueVest); a plain clone without Telos: 48226 / 42955. The host floor alone (~22–27K cache_creation) is above the §12 plan target before any Telos text.
- plan / plan-lite fresh (input + cache_creation): 43.8–53.8K, output 9.6–14.7K, cache reads 0.74–1.31M over 21–31 turns.
- do fresh 34.6–45.9K, output 4.7–10.6K; deep review fresh 8.6–22.3K; map build fresh 46.4–65.3K.
- Telos fixed injection per run: ~1.3K est. shared body + ≤ 1.5K est. bundle ≈ 3–6% of fresh tokens. Usage scales with turns and source reads, not with instruction length.

## Why nothing was trimmed
- Wording cuts within the D-03 limit (two shared bodies + one template) would save on the order of 100–300 est. tokens per run (<1% of measured fresh usage) and would touch the gate text that 06-04/06 showed models follow (RED/GREEN, accept, refusal stops, headless no-commit). That is cosmetic by the task's own rule.
- `claude-block.md` (~166 est., inside the ≤ ~250 target) is versioned in installed CLAUDE.md files; changing it re-syncs every repo for a few tokens.
- `task.md`: plans fill the template; ctx do strips comments, so its comment text is not the source of the Astro `ctx do` truncation (that came from an 80-line detailed task).

## Proposed follow-ups (larger than this pass; need their own task)
1. Inject the deep-critical blocks of `shared/do.md` (RED, review, Result keys; ~1.4K chars, ~350 est. tokens) only when the bundle has a `Deep critical` block; needs a `lib/ctx` change.
2. Always-on cost: 363 tokens measured vs ~0 target; shorten skill/agent `description` fields or merge variants (skills are out of this task's scope).
3. Make templates readable to plan skills (or inline the CONTEXT layout in the plan bundle): plan-lite guessed or skipped CONTEXT in 06-06.
4. Review permission: allow the bundle's quoted `git '--literal-pathspecs' 'diff' …` continuation so headless deep reviews can complete.

## Reruns
None: no prompt bytes changed, so the 06-04/05/06 live runs remain the behavior evidence for these exact bodies. A rerun after a future trim is required; until then any claim of preserved behavior after shortening is **UNVERIFIED** (no shortening was made).

## Guard added
`test/skills.test.mjs` — "the per-run do and plan bodies stay within the 06-TUNING baseline and keep their gates": rendered `ctx shared do` ≤ 5367 and `ctx shared plan` ≤ 5198 chars, each still containing its refusal, accept/lint, RED/review, Deviations, blocked and explicit-staging gates.
