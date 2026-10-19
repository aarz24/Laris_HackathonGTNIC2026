# Plan: Supabase backend + Gemini AI for Laris

**Goal:** turn the browser-only prototype into a real app with Postgres, login, multi-tenant RLS, and real AI features. The demo must **keep working if the cloud or AI is down** (PRD §8, "graceful degradation").

## Key design decisions

| Decision | Choice | Why |
|---|---|---|
| Data layer | `@supabase/ssr` + plain SQL migrations (no Drizzle for now) | RLS-first, less tooling, faster to ship in 23 days. Drizzle can come later |
| Atomic sale | Postgres RPC `complete_sale()` (`security invoker`) | PRD M1 acceptance: order + items + payment + stock movements in **one transaction** |
| UI migration | Keep the current `BusinessState` shape as the **snapshot contract** | The 72 KB UI keeps working. Only the data source and mutations change |
| Fallback | Without env keys → current localStorage demo mode | Works offline and locally, plus a safety net for judging |
| AI SDK | Vercel AI SDK v7 (`ai`) + `@ai-sdk/google` | Matches the PRD, gives structured output and tool calling |
| Models | `LARIS_AI_MODEL_FAST` / `LARIS_AI_MODEL_SMART` env vars | IDs get checked against your key via ListModels before they're hard-coded |

## Phase A: Supabase foundation

- **[NEW]** `supabase/migrations/0001_schema.sql`: `business`, `outlet`, `membership`, `product`, `product_variant`, `inventory_item`, `recipe_line`, `stock_movement` (ledger), `sales_order`, `order_item`, `payment`, `customer`, `supplier`, `purchase`, `purchase_line`, `expense`, `audit_log`, `ai_event`, `holiday_calendar`. Money is `bigint`, quantities are `numeric(14,3)`, every table has `business_id`.
- **[NEW]** `0002_rls.sql`: helper `is_member(business_id)` plus policies on every table. Roles: owner, manager, kasir, dapur.
- **[NEW]** `0003_functions.sql`: `complete_sale` (idempotency key, stock check, recipe deduction, customer upsert, audit) and `record_purchase` (stock-in plus moving-average cost).
- **[NEW]** `scripts/seed.ts`: ports the deterministic 90-day "Kopi Senja" generator from [laris-data.ts](file:///c:/Users/LENOVO/Music/hackathon_gtnic/src/lib/laris-data.ts). Also creates the judge demo user.
- **[NEW]** `src/lib/supabase/{server,client,middleware}.ts`, plus `middleware.ts` for session refresh.
- **[NEW]** `.env.example`, plus README setup steps.

## Phase B: Auth + wiring the UI

- **[NEW]** `/login` page: email/password, plus a **"Masuk sebagai Juri"** one-click demo login (PRD §13).
- **[NEW]** `src/lib/repo.ts`: `loadSnapshot()` on the server returns the same `BusinessState` shape the UI already uses.
- **[NEW]** `src/app/actions.ts`: server actions validated with Zod (`completeSale`, `recordPurchase`, `addExpense`, `addCustomer`, `updateSettings`).
- **[MODIFY]** [laris-app.tsx](file:///c:/Users/LENOVO/Music/hackathon_gtnic/src/components/laris-app.tsx): accept `initialState` + `mode` ("cloud" | "local"). Mutations call server actions in cloud mode and local functions otherwise. The UI text that says "lokal / belum terhubung" updates accordingly.
- **[NEW]** RLS test script: Tenant A can never read Tenant B's rows.

## Phase C: Gemini AI features

1. **Catat Suara → cart** (M2), `POST /api/ai/parse-order`: `generateObject` with a Zod schema, the catalog, and a slang glossary (kopsu, goceng, ceban…). Returns a confidence score per line and unknown items. Falls back to the existing regex parser. Also accepts **audio upload** for Firefox/Safari, which lack Web Speech.
2. **Scan Nota** (M4.3), `POST /api/ai/scan-receipt`: image → line items → fuzzy match to inventory → confirmation table → `record_purchase`. Adds the **price-hike alert** (M4.4).
3. **Tanya Laris** (M8.4), `POST /api/ai/ask`: streaming with roughly 8 typed, read-only tools (`getRevenue`, `getTopItems`, `getStockRisk`, `comparePeriods`, `getMargins`, `getCustomerSegments`, `getPeakHours`, `getExpenses`). Answers can include chart data. No raw SQL.
- Guardrails: always a confirmation card, simple per-user rate limit, input size limits, logging to `ai_event`. Without a key, the existing deterministic logic runs.
- **[NEW]** `evals/voice.jsonl` (50 utterances) + `npm run eval:voice` → accuracy table for the proposal.

## What I need from you

> [!IMPORTANT]
> Put the keys in `c:\Users\LENOVO\Music\hackathon_gtnic\.env.local` (it's git-ignored). **Don't paste them in chat.**
> ```
> NEXT_PUBLIC_SUPABASE_URL=...
> NEXT_PUBLIC_SUPABASE_ANON_KEY=...
> SUPABASE_SERVICE_ROLE_KEY=...      # for the seed script only, never sent to the browser
> GOOGLE_GENERATIVE_AI_API_KEY=...
> ```
> Create the Supabase project in the **Singapore (ap-southeast-1)** region. I'll write the migrations so you can run them through the Supabase SQL editor or the CLI.

## Verification

- `tsc`, `eslint`, and the existing `node:test` suite, plus new tests for repo mapping and AI fallbacks.
- RLS isolation test against the real project.
- Browser run of the golden path: judge login → voice order → QRIS sim → stock drops in the DB → Scan Nota → Tanya Laris.
- Voice eval accuracy ≥ 90% (PRD target).

## Open questions

1. Is **dropping Drizzle** OK (plain SQL + supabase-js)?
2. Should **local mode stay** as the fallback when env keys are missing? (Recommended: yes.)
3. Order: I'll start with Phase A + C1 (voice), since they don't depend on each other. OK?
