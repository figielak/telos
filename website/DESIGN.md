# Telos website: design system

Direction: **Ancient Precision / Obsidian & Gold**. A quiet, dark developer-tool page with one
metal accent and a restrained Greek key (meander) motif. Tokens live in
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
| accent | `#C8A96B` | `text-accent`, `bg-accent` | Links, primary action, meander, focus ring |
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
| Between sections | `py-24`, `md:py-32` |

Content width: `max-w-6xl` (72rem) centered; reading text `max-w-[65ch]`. Full-height sections use
`min-h-[100dvh]`, never `h-screen`. Layouts use CSS Grid, not percentage math.

## Layout rules

- Asymmetric from `md` up (for example `grid-cols-[1.1fr_0.9fr]`); a strict single column
  below `md`, with no horizontal page scroll at 390, 768 or 1440 px.
- No row of three equal cards. Group with rules (`border-t border-line`) and space.
- Wide content (terminal lines, tables) scrolls inside its own container, never the page.

## Components

- **Skip link**: first focusable element, visible on focus, accent background.
- **Meander** (`components/Meander.astro`): one SVG band, `aria-hidden`, `currentColor`.
  Used as divider or section mark in accent. At most one per section.
- **Button, primary**: `bg-accent text-bg`, Manrope 600, radius `sm`, `:active` moves 1px
  (`translate-y-px`).
- **Button, secondary**: 1px `line` border, `text-text`, hover border `accent`.
- **Link**: accent, underline offset 4px; never color alone for meaning in running text.
- **Panel**: `bg-surface`, 1px `line` border, radius `md`, no shadow. Only where grouping needs it.
- **Terminal**: panel with mono text; real text in `<pre>`, labelled illustrative, scrolls inside.
- **Focus**: 2px accent outline, 3px offset on every `:focus-visible`.

## Motion

CSS only, `transform` and `opacity` only, easing `cubic-bezier(0.16, 1, 0.3, 1)`, 200–400 ms.
One staggered reveal in the hero terminal and a blinking cursor; nothing loops elsewhere.
`prefers-reduced-motion: reduce` shortens every animation and transition to nearly zero.
All content is visible with JavaScript off.

## Accessibility and performance

- One `h1`, headings never skip a level; landmarks `header`, `nav`, `main`, `footer`.
- Decorative SVG is `aria-hidden`; controls have accessible names.
- Budget: client JavaScript at most 2 KB, CSS at most 40 KB, fonts at most 250 KB.

## Run

```sh
cd website
npm ci          # Node >= 22.23.4 (Astro 7)
npm run dev     # local server
npm test        # astro build, then node --test against dist/
```

`website/` is a standalone npm package, not a workspace; it has no effect on the plugin or the
root `npm test`.
