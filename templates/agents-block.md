<!-- telos:start v5 -->
## Telos
Project memory in `.telos/`, kept by the `telos` CLI. Read only what the step needs:
PROJECT.md (rules) · MAP.md (where things are) · STATUS.md (now/next) · ROADMAP.md (phases)
· phases/NN-name.md (the current plan) · HISTORY.md (why).
- Run `telos status` first in every session: phase, next step, stale areas.
- Locate code via MAP.md; never read the whole repo. Before editing under a path, read its
  area: `telos area for <path>` names it, then read `.telos/areas/<name>.md`.
- Never recreate paths or approaches listed in HISTORY.md §Delete-zone.
- Steps: run `telos ctx <step>` and follow its output (`/telos:<step>` in Claude Code):
  `plan [NN]` a phase · `close` it · `catchup` after work done outside Telos · `map` the code.
- Tick a task's box in the phase file when its work lands; change ROADMAP, STATUS and
  HISTORY only through `telos`; edit other `.telos/` files only when asked.
- `.telos/` files are written in English; reply in the user's language.
- Commits: Conventional Commits, scope = task id (`feat(01-02): …`), else `quick`; stage
  specific files only (never `git add -A` or `.`); never `--no-verify`, `reset --hard`, push.
<!-- telos:end -->
