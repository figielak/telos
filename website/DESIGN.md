# Telos website: design system

Direction: **Ancient Precision / Obsidian & Gold**. A quiet, dark developer-tool page with one
metal accent and restrained Greek references: a tau monogram, thin lines and a target motif. Tokens live in
`src/styles/global.css` (`@theme`); this file is the reference for them. The tests in
`test/foundation.test.mjs` check that both agree.

## Content rule

The page states only what the repository can back (README, SPEC, code). It shows no benchmark
result, no token or cost saving and no comparison with other tools. Illustrative content, such
as the terminal session, is labelled as illustrative.

## Color

One accent, five roles. Never pure black or white, no gradients on text, no glows.

| Token | Value | Tailwind | Role |
|---|---|---|---|
| bg | `#101114` | `bg-bg` | Page background, text on accent |
| surface | `#1A1C20` | `bg-surface` | Raised areas: terminal, table, panels |
| accent | `#C8A96B` | `text-accent`, `bg-accent` | Links, primary action, monogram, focus ring |
| text | `#F1EEE6` | `text-text` | Headings and body |
| muted | `#A5A29A` | `text-muted` | Secondary text, captions, labels |
| line | `#2A2D33` | `border-line` | 1px rules and dividers (decorative only) |

Contrast (WCAG 2.x, checked in tests, minimum 4.5:1): text on bg 16.28, text on surface 14.72,
muted on bg 7.40, muted on surface 6.69, accent on bg 8.40, accent on surface 7.59, bg on accent 8.40.
`line` is for borders and carries no text.

Use surface plus a `line` border for depth. Shadows are not used. Selection is accent on bg.

## Typography

| Role | Family | Use |
|---|---|---|
| Display | Manrope (variable, 200–800) | `h1`–`h3`, nav, buttons |
| Body | Inter (variable, 100–900) | Paragraphs, lists, table text |
| Mono | JetBrains Mono (variable, 100–800) | Terminal, commands, file names, labels |

Files are self-hosted latin-subset woff2 in `public/fonts/` (SIL Open Font License, texts next
to the files), `font-display: swap`, about 113 KB together. Nothing loads from a font CDN.
The brief fixes Inter as body face, so the usual "avoid Inter" guidance is overridden here.

Scale (mobile / `md` and up):

| Level | Size | Weight | Tracking |
|---|---|---|---|
| h1 | `text-4xl` / `md:text-6xl` | 600 | -0.02em, leading 1.1 |
| h2 | `text-2xl` / `md:text-4xl` | 600 | -0.02em |
| h3 | `text-lg` / `md:text-xl` | 600 | -0.01em |
| body | `text-base` | 400 | normal, leading 1.65, max `65ch` |
| label | `text-xs` mono, uppercase | 500 | `tracking-widest` |

Numbers, commands and paths are always mono.

## Spacing

Tailwind's 4px base scale; use these steps only.

| Use | Value |
|---|---|
| Inline gap, icon to text | `gap-2` (8px) |
| Related items | `gap-4` (16px) |
| Page side gutter | `px-4` below `sm`, `px-6` from `sm` |
| Inside a panel | `p-5`, `md:p-8` |
| Between blocks in a section | `gap-8` to `gap-12` |
| Between sections | `section-y`: 80 px below `md`, 136 px from `md` |

Content width: `max-w-page` (`--container-page`, 75rem = 1200 px) centered; descriptive text
600 to 680 px (`max-w-[40rem]`), long reading text `max-w-[65ch]`. Never `h-screen`. Layouts use
CSS Grid, not percentage math.

## Layout rules

- Content is 1200 px wide at most (`max-w-page`); sections are separated by `section-y`
  (80 px on small screens, 136 px from `md`, as two paddings of 40 px and 68 px).
- The hero is a centered stack: eyebrow, headline (two lines at most on desktop), a 600 to 680 px
  description, two calls to action and a terminal 900 to 1000 px wide that starts in the first view.
  There is no split hero and no large illustration beside the copy.
- Each section has its own composition; the sections that follow the hero vary (horizontal
  process, 2 x 2 grid, text beside a tree, a single row of three profile cards).
- A frame (border or surface) wraps a real group of information only, not every element.
- Below `md` every layout is a single column with no horizontal page scroll at 390, 768 or 1440 px;
  the multi-column compositions (workflow, features, memory, profiles) start at `lg`.
- Wide content (terminal lines, trees) scrolls inside its own container, never the page.

## Components

- **Skip link**: first focusable element, visible on focus, accent background.
- **Monogram** (`components/Monogram.astro`): Greek capital tau inside a thin circle (the target
  motif), `aria-hidden`, `currentColor`; used in the navigation and as the favicon.
- **Button, primary**: `bg-accent text-bg`, Manrope 600, radius `sm`, `:active` moves 1px
  (`translate-y-px`).
- **Button, secondary**: 1px `line` border, `text-text`, hover border `accent`.
- **Link**: accent, underline offset 4px; never color alone for meaning in running text.
- **Panel**: `bg-surface`, 1px `line` border, radius `md`, no shadow. Only where grouping needs it.
- **Terminal**: panel with mono text; real text in `<pre>`, labelled illustrative, scrolls inside.
  In the hero it is 960 px wide, left-aligned inside the centered stack.
- **Install block**: a `figure` styled like the terminal with one row per command, a copy button
  (enabled by one small inline script) and one `aria-live` status; the commands stay selectable text.
- **Mobile menu**: native details/summary works without JS; inline enhancement closes on
  anchor selection, focuses the destination heading, and returns focus to the summary on Escape.
- **Feature details**: benefits remain visible; native disclosures hold implementation mechanics.
- **Profiles**: audience and benefit first, Standard labelled Recommended start with an accent
  border, full comparison in closed native disclosures for each profile.
- **Task example**: an illustrative request beside scope, acceptance and checked commit in one panel.
- **Final CTA**: centered h2, one sentence and two links, to the repository and the README.
- **Focus**: 2px accent outline, 3px offset on every `:focus-visible`.

## Motion

CSS only, `transform` and `opacity` only, easing `cubic-bezier(0.16, 1, 0.3, 1)`, 200–400 ms.
One staggered reveal in the hero terminal and a blinking cursor; nothing loops elsewhere.
`prefers-reduced-motion: reduce` shortens every animation and transition to nearly zero.
All content is visible with JavaScript off.

## Accessibility and performance

- One `h1`, headings never skip a level; landmarks `header`, `nav`, `main`, `footer`.
- Decorative SVG is `aria-hidden`; controls have accessible names.
- Budget: client JavaScript at most 2 KB in total (two small inline scripts: copy buttons and the
  mobile menu), CSS at most 40 KB, fonts at most 250 KB, no images and no external host.
  `test/audit.test.mjs` checks these budgets, the landmarks, accessible names and every external link.
- Scroll regions (terminal, tree) are focusable (`tabindex="0"`) and labelled. Native `details`
  elements carry every disclosure, so they work without JavaScript.
- Claims on the page must trace to the README or SPEC. The one product recommendation, Standard as
  the starting profile, rests on the install example (`/telos:init standard`) and the user's
  first-visit audit; it is the only profile that is highlighted.

## Run

```sh
cd website
npm ci          # Node >= 22.23.4 (Astro 7)
npm run dev     # local server
npm test        # astro build, then node --test against dist/
```

`website/` is a standalone npm package, not a workspace; it has no effect on the plugin or the
root `npm test`.

## Guide pages

The command guide is static English content under `/docs/`, built from plain `.mjs` records.

- **Routes**: `/docs/` is the index; `/docs/commands/<slug>/` is one command. Slugs are prefixed with
  the kind (`skill-status`, `cli-status`) so skills and terminal commands never collide.
- **Records** live in `src/data/docs/` and are registered in `commands.mjs`, which documents the
  contract: slug, kind, name, invocation, summary, profiles, prerequisites, explanation, effects,
  examples (title, command, outcome), use, avoid, alternatives, sources, and optional `variants`
  and `subcommands` that render under the same template. Sources are repository paths linked on GitHub.
- **Reading layout**: a breadcrumb, a Guide-labelled contents row (a sticky column from `lg`), then one
  article at most 48 rem wide with `h1`, a syntax/profile/prerequisite panel and `h2` sections in a
  fixed order: what it does, effects, examples, variants, subcommands, when to use, when to avoid,
  alternatives, sources. Example commands are escaped text in a focusable, labelled scroll region;
  nothing needs JavaScript beyond the shared menu script.
- **Navigation**: the header and footer link `/docs/`. From guide pages the landing sections are
  `/#section` links; on the landing page they stay in-page anchors. The header switches to the menu
  below `lg`, because seven links do not fit at 768 px.
- **Labels**: examples are illustrative, never recorded output or benchmark results.

