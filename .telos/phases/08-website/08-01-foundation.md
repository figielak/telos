---
id: 08-01
title: "Astro and Tailwind foundation, tokens, fonts, DESIGN.md"
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: []         # task IDs, e.g. [01-01]
decisions: [D-01, D-02, D-04]       # phase-local, e.g. [D-03]
scope: ["website/"]           # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
Create the standalone Astro and Tailwind package in `website/` with design tokens, self-hosted fonts, a semantic base layout and `website/DESIGN.md`, so every later section builds on one tested system.

## Read first
- package.json:1-13 (root manifest that must not change)
- SPEC.md:27-40 (design principles, for the page's tone)
- README.md:1-8 (positioning and pre-alpha status)

## Files
- website/package.json (create)
- website/package-lock.json (create)
- website/.gitignore (create)
- website/astro.config.mjs (create)
- website/src/styles/global.css (create)
- website/src/layouts/Base.astro (create)
- website/src/components/Meander.astro (create)
- website/src/pages/index.astro (create)
- website/public/favicon.svg (create)
- website/public/fonts/ (create)
- website/test/helpers.mjs (create)
- website/test/foundation.test.mjs (create)
- website/DESIGN.md (create)

## Constraints
- D-01: Astro and Tailwind CSS in `website/`; dependencies are exactly `astro`, `tailwindcss`, `@tailwindcss/vite`, pinned (checked 2026-11-03: 7.4.5, 4.3.4, 4.3.4). No React, Framer Motion, icon or font packages.
- D-02: tokens `#101114` background, `#1A1C20` surface, `#C8A96B` accent, `#F1EEE6` text, `#A5A29A` muted; fonts Manrope (display), Inter (body), JetBrains Mono (code and labels). The brief overrides the taste skill's Inter ban and its React/Framer default.
- D-04: `website/` is a standalone npm package, not a workspace; the PROJECT no-dependency rule keeps applying to the plugin; `website/package.json` declares Node >=22.23.4 (Astro 7's requirement) while the plugin stays >=20.10.
- Tests use `node:test` only and live in `website/test/`, outside the root `test/*.test.mjs` glob; `npm test` in `website/` runs `astro build` and then those tests against `dist/`.
- Fonts: variable woff2 files, fetched once from the families' official or Fontsource releases (never added as a dependency), committed under `public/fonts/` with their OFL notices, `font-display: swap`, latin subset; no request to any font CDN.
- `.gitignore` in `website/` covers `dist/`, `.astro/`, `node_modules/`.
- Greek reference stays geometric: one meander SVG component, `aria-hidden`, drawn with `currentColor`.

## Tests (write first)
- Build: `dist/index.html` exists, has `lang="en"`, one `<title>`, a meta description, viewport meta, a skip link to `#main` and one `<main id="main">`.
- Tokens: `global.css` defines all five colors and DESIGN.md names the same values.
- Contrast: WCAG ratio is at least 4.5 for text and muted on background and surface, accent on background and surface, and background on accent.
- Fonts: the three families resolve to local `/fonts/` files, and built HTML and CSS reference no external font host.
- Dependencies: `website/package.json` lists exactly the three allowed packages; root `package.json` has no dependencies.
- DESIGN.md has the sections Color, Typography, Spacing and Components.

## Steps
- Write `helpers.mjs` (read `dist/` files, contrast function) and `foundation.test.mjs`, and see them fail.
- Add `package.json`, `astro.config.mjs` with the Tailwind Vite plugin and static output, `.gitignore`; run `npm install` to create the lockfile.
- Define tokens and `@font-face` rules in `global.css` through Tailwind's `@theme`; add the focus ring and the reduced-motion rule.
- Build `Base.astro` (head, skip link, `<main>`), `Meander.astro`, the favicon and a minimal `index.astro`.
- Write `DESIGN.md`: color tokens with roles, type scale, spacing scale, component rules, motion rules, and how to run the site.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm --prefix website test` → exit 0
- [ ] `npm test` → exit 0

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
