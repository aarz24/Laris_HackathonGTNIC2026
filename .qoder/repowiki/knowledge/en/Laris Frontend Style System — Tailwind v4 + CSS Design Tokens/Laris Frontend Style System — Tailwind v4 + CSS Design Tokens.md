---
kind: frontend_style
name: Laris Frontend Style System — Tailwind v4 + CSS Design Tokens
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - postcss.config.mjs
    - next.config.ts
    - package.json
    - src/app/layout.tsx
    - src/app/login/login.module.css
    - src/app/onboarding/onboarding.module.css
---

## Approach

Laris is a Next.js 15 (Turbopack) app styled with **Tailwind CSS v4** (`@tailwindcss/postcss` plugin, `tailwindcss: ^4`) and a hand-authored global stylesheet. There is no component library (no shadcn/ui, Radix primitives, etc.) — the UI is built from raw React components plus the Lucide icon set (`lucide-react`).

The styling system has two layers:

1. **Global design tokens** in `src/app/globals.css` — CSS custom properties for colors, typography, radii, shadows, layout dimensions, and semantic aliases.
2. **Tailwind utilities** imported via `@import "tailwindcss";` at the top of `globals.css`, exposing those tokens as Tailwind theme variables through `@theme inline { --color-* }`.

Per-page or per-component styles are written as plain CSS modules (`*.module.css`) co-located with the page/component file (e.g. `login/login.module.css`, `onboarding/onboarding.module.css`). The main dashboard shell and shared UI primitives live directly in `globals.css` as BEM-style class names (`.app-shell`, `.sidebar`, `.topbar`, `.button`, `.nav-item`, `.growth-card`, etc.).

## Key Files

- `src/app/globals.css` — single ~4000-line stylesheet containing the entire design token system, base resets, utility classes (`@utility tabular-nums`, `@utility surface-glass`, `@utility card-interactive`), and all shared component styles (tables, sidebar, topbar, buttons, cards, modals, forms).
- `postcss.config.mjs` — registers only `@tailwindcss/postcss`; no other PostCSS plugins.
- `next.config.ts` — enables Turbopack (`turbopack.root`); no special CSS/asset config.
- `package.json` — declares `tailwindcss: ^4` and `@tailwindcss/postcss: ^4` as devDependencies; `lucide-react` as the sole icon dependency.
- `src/app/layout.tsx` — imports `./globals.css` and applies the Jakarta font variable (`jakarta.variable`) to `<body>`.
- `src/app/login/login.module.css` — full-page login screen (two-column grid, brand panel, form card, animations).
- `src/app/onboarding/onboarding.module.css` — small scoped stylesheet for the onboarding wizard.
- `scripts/beautify-ui.mjs` / `scripts/ tokenize-ui.mjs` — scripts that process `globals.css` (beautification and tokenization), indicating the stylesheet is treated as a source-of-truth asset.

## Architecture & Conventions

### Design Tokens

All visual values are declared once under `:root` in `globals.css` and then re-exposed to Tailwind via `@theme inline`:

- **Palette**: warm Indonesian coffee-shop theme — off-white background (`#FBF8F3`), dark foreground (`#1A2332`), emerald green (`#1F9D74`) and saffron gold (`#F5A524`) as primary/secondary accents, each with `-light`, `-dark`, `-wash`, `-border`, `-ink`, `-copy` variants.
- **Semantic roles**: `--background`, `--foreground`, `--surface`, `--surface-muted`, `--surface-warm`, `--surface-paper`, `--border`, `--track`, `--muted`, `--text-secondary`, `--text-nav`, `--placeholder`.
- **Shadows**: `--shadow-xs`, `--shadow-card`, `--shadow-lift`, `--shadow-modal`, plus color-tinted shadow variables (`--shadow-green`, `--shadow-saffron`, `--shadow-ink`) built with `color-mix(in srgb, …)`.
- **Radii**: `--radius-xs/sm/md/lg/xl` (8–24px).
- **Layout**: `--sidebar-width: 248px`, `--topbar-height: 68px`.

### Typography

- Sans-serif stack uses the Jakarta font loaded via Next's `next/font/google` (variable applied as `jakarta.variable` on `<body>`), falling back to `ui-sans-serif, system-ui, -apple-system, sans-serif`.
- Serif fallback for profile initials; monospace fallback for code.
- Headings use tight letter-spacing (`-0.03em` to `-1.4px`) and clamp-based fluid sizing.

### Component Styling Patterns

- **BEM-like class names** in globals: `.app-shell`, `.sidebar`, `.topbar`, `.breadcrumb`, `.main-content`, `.page-heading`, `.button.primary|secondary|small`, `.voice-button`, `.table-scroll`, `.table-pagination`, `.business-switcher`, `.growth-card`, `.nav-item.active`, `.icon-button`, `.profile-button`, `.global-search`.
- **Glass morphism**: `backdrop-filter: blur(16px) saturate(1.2)` used on sidebar, topbar, and cards; a `@utility surface-glass` helper encapsulates it.
- **Gradients**: radial gradients on `html` body and page backgrounds mixing green/saffron tints; linear gradients on brand text and growth cards.
- **Micro-interactions**: consistent `transition: transform 0.18s ease, box-shadow 0.18s ease` on buttons; hover lifts (`translateY(-1px)` or `translateY(-2px)`); focus-visible outlines using `--saffron`.
- **Tables**: dedicated `.table-*` classes with tabular-nums, muted uppercase headers, hover row highlights in `--green-light`.
- **Animations**: `spin` (loading), `float-y` (decorative art), `rise` (page entrance), `pulse-dot` (status indicator).

### Responsive Strategy

- Uses CSS `clamp()` for fluid padding and heading sizes rather than Tailwind breakpoints.
- Scoped media queries inside CSS modules (e.g. `@media (max-width: 860px)` in login, `@media (max-width: 560px)` in onboarding) for layout shifts (collapsing grids, hiding illustrations).
- No Tailwind breakpoint utilities appear to be relied upon; the project leans on CSS-native responsive patterns.

### Accessibility

- Focus-visible outlines defined globally (`outline: 2.5px solid var(--saffron); outline-offset: 2px`).
- Skip-link (`<a className="skip-link">`) in `layout.tsx`.
- ARIA labels and `role="status"` on login form notices.
- `prefers-reduced-motion` media query disables animations in login module.

### What Is NOT Used

- No SCSS/Sass, no CSS-in-JS, no styled-components/emotion.
- No Tailwind config file (`tailwind.config.*` absent); Tailwind v4's default configuration is used.
- No third-party UI component library (no shadcn, MUI, Ant Design, etc.).
- No CSS framework beyond Tailwind's base import.

## Conventions & Constraints

- All global design tokens live in `:root` in `globals.css` and are mirrored into `@theme inline` so they become available as Tailwind utilities like `bg-surface-warm`, `text-green-ink`, `border-saffron-border`, `shadow-card`, `rounded-lg`.
- Shared component styles (buttons, tables, sidebar, topbar, cards) are authored as plain CSS classes in `globals.css` using BEM-style naming (`.button.primary`, `.nav-item.active`, `.growth-card`).
- Page-specific or component-scoped styles go into a sibling `*.module.css` file and are imported via `import styles from "./foo.module.css"` (observed in `login-form.tsx`).
- Colors are referenced exclusively through CSS custom properties (`var(--green)`, `var(--saffron-light)`, `color-mix(in srgb, var(--foreground) 32%, transparent)`), never as hard-coded hex values outside the token declarations.
- Shadows and overlays are constructed with `color-mix(in srgb, …)` against the semantic palette rather than fixed opacities.
- The build pipeline processes CSS through PostCSS with only the Tailwind v4 plugin (`postcss.config.mjs`), so any new Tailwind features must be compatible with v4's new engine.
- The `scripts/beautify-ui.mjs` and `scripts/tokenize-ui.mjs` scripts operate on `globals.css`, treating it as the canonical stylesheet artifact.