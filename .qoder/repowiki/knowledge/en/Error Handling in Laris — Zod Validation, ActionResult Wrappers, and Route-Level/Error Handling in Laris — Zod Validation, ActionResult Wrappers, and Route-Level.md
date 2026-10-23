---
kind: error_handling
name: Error Handling in Laris — Zod Validation, ActionResult Wrappers, and Route-Level Try/Catch
category: error_handling
scope:
    - '**'
source_files:
    - src/app/actions.ts
    - src/lib/supabase/middleware.ts
    - src/lib/supabase/server.ts
    - src/lib/env.ts
    - src/middleware.ts
    - src/app/api/ai/ask/route.ts
    - src/app/api/ai/parse-order/route.ts
    - src/app/api/ai/scan-receipt/route.ts
---

## Overview

Laris does not define a custom error class hierarchy or a centralized error-reporting framework. Instead it uses three complementary patterns that are consistent across the codebase:

1. **Zod-driven input validation** with human-readable Indonesian messages.
2. **A typed `ActionResult<T>` wrapper** around Next.js Server Actions that normalizes all thrown errors into `{ ok: false; error: string }` responses.
3. **Per-route try/catch blocks** in API routes (`src/app/api/ai/*`) that log telemetry and return user-facing JSON with explicit HTTP status codes.

There is no `panic`/`recover` equivalent (this is JavaScript/TypeScript), no global error boundary for React components, and no dedicated `errors/` directory.

## Key Files

- `src/app/actions.ts` — defines `ActionResult<T>` and the `run()` wrapper used by every Server Action.
- `src/lib/supabase/middleware.ts` — session refresh + auth redirect logic; the only place where unhandled exceptions from Supabase claims would surface to the Next.js middleware pipeline.
- `src/lib/supabase/server.ts` — wraps `cookieStore.set` in a try/catch so cookie writes from server components are silently ignored (documented as safe because the middleware refreshes the session).
- `src/lib/env.ts` — central env access; missing keys resolve to empty strings rather than throwing, making configuration errors manifest at runtime.
- `src/app/api/ai/ask/route.ts`, `parse-order/route.ts`, `scan-receipt/route.ts` — AI API routes with per-block try/catch, telemetry logging, and fallbacks.
- `scripts/lib.ts`, `scripts/seed.ts`, `scripts/rls.test.ts` — dev scripts that throw plain `new Error(...)` on failures and rely on Node's default unhandled rejection behavior.

## Architecture & Conventions

### 1. Server Actions use a uniform `ActionResult<T>` shape

Every exported action returns `Promise<ActionResult<T>>`, where:

```ts
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
```

The private `run(fn)` helper (line 30–38 of `actions.ts`) is the single point of error normalization:

- `z.ZodError` → `{ ok: false, error: <first issue message> }`.
- Any other `Error` → its `.message` is passed through, except when the message matches `/fetch failed|network|ECONN/i`, which is rewritten to the Indonesian user message `"Tidak bisa terhubung ke server. Periksa koneksi internet."`.
- Non-`Error` values fall back to `"Terjadi kesalahan. Coba lagi."`.

This means callers never see raw stack traces or internal PostgREST / Supabase error messages — they receive a localized string.

### 2. Authorization and context checks throw early

The `context(roles?)` helper (line 21–28) performs three preconditions before any DB call:

- Cloud mode must be configured (`isCloudConfigured`).
- A membership row must exist (session validity).
- The caller's role must be in the allowed set.

Each failure throws a plain `Error` with an Indonesian message, which `run()` then converts into `{ ok: false, error }`. This pattern is repeated verbatim at the top of every mutating action (`completeSaleAction`, `recordPurchaseAction`, `addExpenseAction`, `addCustomerAction`, `updateSettingsAction`, `saveProductAction`, `saveInventoryItemAction`, `inviteTeamMemberAction`).

### 3. Database errors are surfaced via Supabase's `error` field

For every Supabase RPC/query, the code checks `if (error)` and re-throws `new Error(error.message)`. There is one notable exception: duplicate phone number detection in `addCustomerAction` (line 157) maps PostgreSQL error code `23505` to the user-friendly `"Nomor telepon ini sudah terdaftar."` instead of passing the raw DB error through.

### 4. API routes handle their own errors with telemetry

AI route handlers follow this structure:

1. Validate the request body with a Zod schema inside a try/catch → return `NextResponse.json({ error }, { status: 400 })`.
2. Load workspace context via `requireAiContext(mode)` inside a try/catch → return `aiErrorResponse(error, <user message>)`.
3. Call the AI model inside another try/catch → log telemetry via `logAiTelemetry({ ok: false, ... })` and return a `502` JSON response.
4. On success, log telemetry with `ok: true` and return the result.

`parse-order/route.ts` adds an extra layer: if the Gemini call fails, it falls back to the local `parseOrder(text, catalog)` parser and returns `{ source: "fallback-parser", warning: "Model AI sedang sibuk..." }` (status 200). It also enforces content-length (`MAX_BODY_BYTES = 12 MB`) and audio size (`MAX_AUDIO_BYTES = 8 MB`) up front, returning `413` for oversized payloads.

### 5. Middleware is thin and delegates to Supabase SSR

`src/middleware.ts` simply calls `updateSession(request)` from `@/lib/supabase/middleware`. That function:

- Skips all processing when cloud mode is off (`!isCloudConfigured`).
- Refreshes the Supabase session cookie on every request.
- Redirects unauthenticated users away from `/` and `/onboarding` to `/login`.
- Redirects authenticated users away from `/login`, `/register`, `/forgot-password` to `/`.

No custom error handling lives here — any exception bubbles to Next.js's default handler.

### 6. Cookie writes from server components are intentionally swallowed

In `createClient()` (`src/lib/supabase/server.ts`), the `setAll` callback wraps `cookieStore.set` in a try/catch with an empty catch block. The comment explains the rationale: when called from a Server Component, cookies are read-only, but the middleware already refreshed the session, so ignoring the write is safe.

### 7. Environment variables do not throw

`supabaseUrl`, `supabaseKey`, and `isCloudConfigured` resolve to empty strings / `false` when unset. This lets the app run in "local demo" mode without environment variables. Dev scripts (`scripts/lib.ts`, `scripts/seed.ts`) are stricter and throw `new Error(...)` when required env vars are missing, since those scripts require a real Supabase instance.

## Conventions Observed

- **Validation-first**: Every public input is parsed through a Zod schema before business logic runs. Validation errors are surfaced to the UI via the `ActionResult.error` string.
- **Localized user messages**: All user-facing error strings are written in Indonesian (e.g. `"Sesi berakhir. Silakan masuk kembali."`, `"Peranmu tidak memiliki akses untuk tindakan ini."`, `"Data tidak valid."`). Internal/logged messages may remain English.
- **Network errors are normalized**: The regex `/fetch failed|network|ECONN/i` in `run()` collapses diverse network failure messages into a single user-friendly string.
- **PostgreSQL constraint codes are mapped**: Only `23505` (unique violation) is explicitly handled; other DB errors pass through as-is.
- **API routes always return JSON**: Even invalid requests return `NextResponse.json(...)`, never throw unhandled exceptions.
- **Telemetry is logged on both success and failure paths** in AI routes via `logAiTelemetry`, including latency, feature name, model id, and either the answer length or the error message.
- **Fallbacks degrade gracefully**: When Gemini is unavailable, `ask/route.ts` returns a static local answer; `parse-order/route.ts` falls back to the deterministic `parseOrder` parser.
- **No custom error types**: The codebase does not define sentinel error classes, error codes, or an error taxonomy. Errors are represented as plain `Error` instances or Zod validation issues.
- **Dev scripts throw and exit**: Scripts under `scripts/` use `throw new Error(...)` directly and rely on Node's default process termination on unhandled rejections (see `main().catch((error: unknown) => {...})` in `seed.ts`).

## Rules Enforced by the Code

- Every Server Action must return `ActionResult<T>` — enforced by the TypeScript signature of each exported action.
- Input validation must go through the action-specific Zod schemas defined in `actions.ts` — there are no ad-hoc `if (!field)` checks before calling Supabase.
- Network-related errors from Supabase are rewritten to a generic Indonesian message before reaching the client — enforced by the regex check in `run()`.
- Duplicate phone numbers produce a specific user message rather than exposing the PostgreSQL error code — enforced by the `error.code === "23505"` branch in `addCustomerAction`.
- AI route handlers log telemetry with `ok: false` on every catch path — enforced by the try/catch blocks in `ask/route.ts` and `parse-order/route.ts`.
- Content-length and audio-size limits are enforced before parsing the request body in `parse-order/route.ts`, returning HTTP 413 for violations.