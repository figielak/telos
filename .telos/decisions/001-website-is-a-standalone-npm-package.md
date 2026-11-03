# 001 · Website is a standalone npm package
Date: 2026-11-03 · Status: accepted · Source: 08:D-04
Supersedes: none
<!-- Header is written by `telos adr new`; edit only the sections.
     Status: accepted | superseded by NNN | reverted (date, task or commit). Only `accepted` is binding. -->

## Context
The plugin has a hard rule: no runtime or dev dependencies, Node >= 20.10. The landing page was requested with Astro and Tailwind CSS, and Astro 7 requires Node >= 22.23.4. The two must not share an install or a test run.

## Decision
`website/` is a standalone npm package with its own lockfile and tests, not a workspace. The no-dependency rule keeps applying to the plugin; root `package.json` and `npm test` stay unchanged.

## Alternatives
- npm workspace at the root — adds a root manifest change and ties the plugin's install to the site.
- Separate repository — splits the page from the README and skills its tests check claims against.

## Consequences
- The plugin stays dependency-free, and root `npm test` never needs the site installed.
- Site tests run separately with `npm --prefix website test`, so root CI alone does not cover them.
- `website/` still ships in plugin installs, because the marketplace source is the repository root.

Reverse by: moving `website/` to its own repository, or adding a workspace and changing the root manifest.
Links: HISTORY decision ADR 001; .telos/phases/08-website/08-CONTEXT.md D-04
