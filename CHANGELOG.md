# Changelog

## 2026-11-03

- Added a landing page in `website/`, a standalone Astro and Tailwind package outside the plugin runtime.
- Page sections: hero with an illustrative terminal, Workflow, Core features, Project memory, Profiles, Getting Started and a final call to action.
- Added `website/DESIGN.md` with color tokens, typography, spacing and component rules.
- Copy buttons and the mobile menu use two small inline scripts; content and navigation work without JavaScript.
- Added site tests under `website/test/`, run with `npm --prefix website test`, including budgets and checks of page claims.
- Telos's own full check now uses the dot test reporter so its output stays under the 64 KiB limit.
