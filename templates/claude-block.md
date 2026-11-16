<!-- telos:start v2 -->
## Telos
Project memory in `.telos/` — read only what the step needs:
PROJECT.md (rules) · MAP.md (where things are) · STATUS.md (now/next) · ROADMAP.md (phases)
· phases/NN-name.md (the current plan) · HISTORY.md (why).
- Locate code via MAP.md; never read the whole repo.
- Never recreate paths or approaches listed in HISTORY.md §Delete-zone.
- Tick a task's box in the phase file when its work lands; change ROADMAP, STATUS and
  HISTORY only through `telos`; edit other `.telos/` files only when asked.
- `.telos/` files are written in English; reply in the user's language.
- Commits: Conventional Commits, scope = task id (`feat(01-02): …`), else `quick`; stage
  specific files only, never `--no-verify`, never push.
<!-- telos:end -->
