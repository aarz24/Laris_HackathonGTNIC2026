# Laris — UI Polish Rules (Copilot / AI Agent Instructions)

> **Where to put this file:** copy it to `.github/copilot-instructions.md` in your local clone
> (GitHub Copilot reads that automatically), or paste it as the first message of every chat session.
> Keep the original at the repo root for reference.

---

## 0. Your role

You are doing **visual polish only** on an existing, working, production-ready Next.js 15 + Supabase
app (`Laris`, an F&B POS submitted to a hackathon). The business logic, database, auth, AI endpoints,
and tests are **finished and must keep behaving identically**.

Your job: make it look better. Nothing else.

**If a styling request cannot be done without touching a forbidden file or logic, STOP and ask the
human instead of improvising.** Never "fix" or "improve" code you weren't asked about.

---

## 1. The single most important fact

`/demo` and `/` (the real logged-in app) **render the exact same component**:

```
src/app/demo/page.tsx  ->  <LarisApp mode="local" />   // demo, data in localStorage
src/app/page.tsx       ->  <LarisApp mode="cloud" ... /> // real app, data in Supabase
```

Both are [`src/components/laris-app.tsx`](src/components/laris-app.tsx) — **one 1542-line file, ~159 KB**.

So there is **no separate "demo UI"**. Any edit there hits the production app too. Treat every change
in that file as a production change and keep it strictly presentational.

---

## 2. File permissions — hard rules

### ✅ Free to edit

| Path | What you may do |
| --- | --- |
| `src/app/globals.css` | **Primary workspace.** Colors, spacing, radii, shadows, typography, layout, animation, responsive tweaks |
| `src/components/laris-help.module.css` | Same, scoped to the help/tour UI |
| **new** `*.module.css` files | Preferred for anything large or new |
| **new** presentational components in `src/components/` | Pure props-in/JSX-out, no data fetching, no business logic |
| `src/components/laris-visuals.tsx` | Decorative only (`CafeIllustration`, `LarisMark`, `EmptyState`, `Sparkline`, `RevenueChart`, `Trend`, `AiBadge`) — keep prop signatures and the numbers they render unchanged |
| `public/images/*`, `public/*.svg` | Add new assets (don't delete existing ones) |

### ⚠️ Edit with care — presentational changes only

| Path | Allowed | Forbidden |
| --- | --- | --- |
| `src/components/laris-app.tsx` | `className`, inline `style`, wrapper `<div>`/`<span>`, element order **within one visual block**, icon swaps from the existing `lucide-react` import, user-facing copy | Everything in §4 |
| `src/components/laris-help.tsx` | same as above | same as above |
| `src/app/layout.tsx` | font config, `<body>` class names, metadata text | provider/structure changes |
| `src/app/login/*.tsx`, `register`, `onboarding`, `forgot-password`, `reset-password` | styling + copy of the forms | form field `name=""` attributes, server-action wiring |

### 🚫 Never touch

```
src/lib/**                  <- laris-data.ts, repo.ts, ai*.ts, env.ts, rate-limit.ts, *.test.ts
src/app/actions.ts          <- all server actions
src/app/**/actions.ts       <- login/onboarding actions
src/app/api/ai/**           <- ask / parse-order / scan-receipt routes
src/app/auth/callback/route.ts
src/middleware.ts
src/lib/supabase/**
supabase/migrations/**      <- NEVER. Not a new file, not a tweak.
scripts/**
package.json, package-lock.json, tsconfig.json, next.config.ts,
eslint.config.mjs, postcss.config.mjs, .env, .env.example,
.github/workflows/ci.yml
```

Renaming a `name=""`, changing an action import, or "tidying" a type in `src/lib` silently breaks
checkout, stock, or RLS. Don't.

---

## 3. How styling actually works here (follow the existing system)

**Tailwind v4 + CSS custom properties. There is no `tailwind.config.js`.**

1. **Design tokens** live in `:root` in `globals.css` (`--green`, `--saffron`, `--surface-warm`,
   `--radius-md`, `--shadow-card`, `--sidebar-width`, …) and are re-exported to Tailwind through
   `@theme inline` (`--color-green` → `bg-green`, `text-green`, `border-green`).
2. **Most JSX uses semantic global class names**, not utility soup: `.app-shell`, `.sidebar`,
   `.topbar`, `.workspace`, `.nav-item`, `.product-card`, `.modal`, `.icon-button`, `.text-button`,
   `.section-heading`, `.status-dot`, `.growth-card`, …
3. Those classes are defined in `globals.css`.

### Consequences

- **Best change = CSS-only.** Restyle `.product-card` in `globals.css`; touch zero `.tsx` files.
  This is the lowest-risk, highest-reward work. Do as much as possible this way.
- **Do not rename existing class names** in TSX or CSS. If you need a variant, add a new class
  *alongside* the old one: `className="product-card product-card--featured"`.
- **Never use a raw hex / rgb value.** Always `var(--token)`. If you genuinely need a new color,
  add a token to `:root` (and to `@theme inline` if you want a Tailwind utility for it) rather than
  inlining it. Stay inside the warm cream + emerald + saffron palette.
- Tailwind utilities are fine where the file already uses them (`font-medium text-foreground`), but
  **prefer extending the semantic class** for anything structural.
- Use `color-mix(in srgb, var(--x) N%, transparent)` for tints — that's the house pattern.
- There is **no dark mode**. Don't add `dark:` variants or a theme toggle.

---

## 4. Logic you must not modify in `laris-app.tsx`

Do not add, remove, reorder, or rewrite:

- `"use client"` on line 1 — must stay the first statement.
- Any **import** (keep the `@/lib/laris-data`, `@/app/actions`, `@/lib/ai-request`,
  `@/lib/laris-guide` import lists exactly as-is). You may add an icon to the existing
  `lucide-react` import block.
- Any hook: `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`, `useId` — including
  **dependency arrays**.
- Any **event handler body**: `onClick`, `onSubmit`, `onChange`. You may restyle the element; the
  arrow function inside stays byte-identical.
- Any **arithmetic or formatting**: totals, tax, discounts, stock math, `currency()`, `sum()`,
  `getCartTotal()`, `getStock()`, `getSalesFinancials()`, `toLocaleDateString("id-ID")`.
- **`mode === "cloud"` / `mode === "local"` branches** and the `LarisAppProps` interface.
- **Guard conditions** — `disabled={!available || !canRecordOperations}`, role checks
  (`owner`/`manager`/`kasir`/`dapur`), `canRecordOperations`, permission gating. A pretty button
  that lets a `dapur` user ring up a sale is a bug, not a polish.
- **Modal/state plumbing**: the `ModalName` union, `open()`, `close()`, `go()`, `notify()`,
  `createRequestSlot()` / AI request cancellation, `STORAGE_KEY`, `DEMO_STORAGE_KEY`,
  `resetDemoSession`.
- `navigation`, `pageNames`, `roleLabels`, `roleDetails`, `PRODUCT_IMAGES` — the nav array drives
  routing and the `View` type. Change a label string only, never an `id`.
- Form `name` attributes, `<input type>`, `required`, `value`/`defaultValue`, `key` props.
- **Button labels that tests anchor on.** `src/lib/ai-reliability.test.ts` parses `laris-app.tsx`
  source and finds the Overview assistant button by its exact text **"Cari peluang lainnya"**.
  Renaming it fails 10 tests. Before renaming any button copy, grep `src/lib/*.test.ts` for it.

### Accessibility is part of the contract — preserve it

Keep every `aria-label`, `aria-modal`, `aria-labelledby`, `aria-describedby`, `aria-current`,
`role="dialog"`, `tabIndex={-1}`, `inert={...}` and the modal's backdrop-click + focus-ref behavior.
If you wrap an element, the ARIA attributes move with it, not off it. Any interactive thing stays a
real `<button>` — never swap a `<button>` for a `<div onClick>`.

---

## 5. Other hard constraints

- **No new npm dependencies.** No shadcn/ui, Radix, framer-motion, MUI, styled-components,
  react-icons, Sass, clsx, tailwind-merge, animation libs. Allowed deps are already installed:
  `lucide-react` for icons, `next/image`, `next/link`. Use CSS `@keyframes` / `transition` for motion.
- **Never run `node scripts/beautify-ui.mjs` or `node scripts/tokenize-ui.mjs`.** They are one-shot
  codemods that *overwrite* `globals.css` with an older palette and re-inject an already-applied
  polish block. Running them corrupts the current design.
- **Keep `next/image` as `next/image`** with explicit `width`/`height`. Don't switch to `<img>`,
  don't add remote image domains, don't touch `next.config.ts`.
- **Don't reformat the file.** `laris-app.tsx` is intentionally dense (long single-line JSX).
  No Prettier run, no mass re-indent, no "split this into modules", no converting arrow functions.
  A 4000-line whitespace diff makes review impossible and will be rejected.
- **Don't refactor.** Not even if asked nicely by your own suggestion engine. No extracting
  components out of `laris-app.tsx`, no renaming variables, no `any`, no `@ts-ignore`,
  no `eslint-disable`.
- **Copy stays Indonesian** (informal-professional, matching e.g. "Usaha tumbuh, bareng Laris.",
  "Stok habis", "Tambah pesanan"). No English UI strings. Money always goes through `currency()` —
  never hardcode `"Rp"` or reformat numbers yourself.
- **Keep it responsive.** The shell uses `--sidebar-width: 248px` / `--topbar-height: 68px` plus a
  mobile drawer (`.sidebar-overlay`, `sidebarOpen`). Test ~375px, ~768px, ~1440px. Don't break the
  drawer, don't introduce horizontal scroll, don't set fixed pixel heights on content areas.
- **No new files outside `src/components/`, `src/app/*.css`, and `public/`.** No README edits,
  no doc files, no config.

---

## 6. Workflow

```powershell
git checkout main
git pull
git checkout -b ui/polish-<area>      # e.g. ui/polish-pos, ui/polish-overview
npm install
npm run dev                            # http://localhost:3000/demo
```

- Work on the **branch**, never commit to `main`. Open a PR; the human reviews the diff.
- **One area per branch/commit** (POS, overview, modals, …). Small reviewable diffs.
- Without `.env` Supabase/Gemini keys, `/` won't have real data — **use `/demo`** for visual work,
  that's what it's for.
- Before every commit, all four must pass:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

(CI runs exactly these on the PR. A red CI = the PR doesn't merge.)

- Then confirm the diff touched nothing forbidden:

```powershell
git diff --stat main
```

If `src/lib/`, `src/app/actions.ts`, `src/app/api/`, `supabase/`, `scripts/`, `src/middleware.ts`,
or `package.json` show up — revert those files before pushing.

---

## 7. Manual QA before you call it done

On `/demo`, after your changes:

- [ ] Add items to cart → quantities, line totals, subtotal, tax and grand total are **the same
      numbers as before** your change.
- [ ] Complete a checkout → receipt renders, transaction appears in **Transaksi**, ingredient stock
      drops in **Stok bahan**.
- [ ] Open every nav item: Ringkasan, Kasir, Transaksi, Produk & resep, Stok bahan, Pembelian,
      Pelanggan, Etalase online, Keuangan, Tim & akses.
- [ ] Open and close several modals (checkout, receipt, purchase, expense, settings, search,
      notifications, guide): backdrop click closes, `Esc` closes, focus lands in the dialog,
      background is inert and not scrollable.
- [ ] Keyboard-only pass: `Tab` order sane, focus visible on every control.
- [ ] 375px / 768px / 1440px: sidebar drawer opens and closes, no clipping, no horizontal scroll.
- [ ] Browser console: no new errors or React warnings (hydration, key, a11y).
- [ ] "Stok habis" / disabled-button states still look and behave disabled.
- [ ] Guided tour + help center still open and read correctly.

---

## 8. Prompting pattern (for the human driving Copilot)

**Good**

> In `src/app/globals.css` only, restyle `.product-card`: softer shadow using `var(--shadow-card)`,
> `var(--radius-lg)` corners, 1px `var(--border)`, hover lift with `var(--shadow-lift)`. Don't open
> any `.tsx` file.

> Improve vertical rhythm in `.section-heading` and `.nav-group` using existing tokens. CSS only.

**Bad — refuse these**

> Make the demo page look modern. *(too vague → agent rewrites the component)*

> Refactor `laris-app.tsx` into smaller components while you're at it.

> Install shadcn/ui and migrate the buttons.

> Add dark mode.

---

## 9. Definition of done

A change is acceptable only if **all** of these hold:

1. `typecheck`, `lint`, `test`, `build` pass.
2. `git diff --stat main` lists only files from §2 "free to edit" / "edit with care".
3. No new npm dependency; `package.json` and the lockfile are untouched.
4. Every number the UI displays is identical to before.
5. No ARIA attribute, `role`, `inert`, `disabled` condition, or form `name` was removed or renamed.
6. Diff contains no pure-formatting churn.
7. The app looks better at all three breakpoints and the demo flow in §7 passes end to end.

**When in doubt: write CSS, not TypeScript. Ask, don't guess.**
