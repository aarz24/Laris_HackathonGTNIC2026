---
kind: configuration_system
name: Next.js Environment Variables with Centralized Env Module
category: configuration_system
scope:
    - '**'
source_files:
    - src/lib/env.ts
    - .env.example
    - package.json
    - next.config.ts
---

## Approach

Laris uses Next.js's built-in environment variable system — no dedicated config library (dotenv, convict, etc.) is used. Configuration lives in `.env` files and is consumed through a single central module.

## Key Files

- `src/lib/env.ts` — the only place that reads `process.env`; all other modules import from here.
- `.env.example` — the canonical list of required/optional variables for developers to copy into `.env`.
- `package.json` scripts (`db:seed`, `test:rls`, `eval:voice`) pass `--env-file=.env` to Node so seed/test scripts can read the same `.env` as the app.
- `next.config.ts` — minimal; only sets Turbopack root, does not load any external config file.

## Architecture

The env module (`src/lib/env.ts`) exposes two access patterns:

1. **Client-safe exports** — `supabaseUrl`, `supabaseKey`, `isCloudConfigured`. These are plain `const`s derived from `NEXT_PUBLIC_*` variables. The comment at the top of the file documents the rule: `NEXT_PUBLIC_*` must be read with literal `process.env.X` so Next.js can inline them into the browser bundle.
2. **Server-only accessor** — `serverEnv()` returns an object containing secrets and server-side values (`LARIS_DEMO_EMAIL`, `LARIS_DEMO_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `LARIS_AI_MODEL_FAST`, `LARIS_AI_MODEL_SMART`). The function is documented as "Server-only values. Never import these from client components." This convention is enforced by consuming code importing it from server routes / API handlers rather than React components.

Runtime mode is derived from configuration: if both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are set, `isCloudConfigured` is true and the app runs in "cloud" mode against Supabase; otherwise it falls back to a local browser-storage demo (documented in `.env.example`: "Leave Supabase values empty to use the explicit browser-only demo at /demo").

## Conventions and Constraints

- All environment access goes through `src/lib/env.ts`. Direct `process.env` usage elsewhere would bypass the centralization and the `trim()` normalization applied here.
- `NEXT_PUBLIC_*` variables are the only ones safe to consume on the client; secret keys (`SUPABASE_SERVICE_ROLE_KEY`, `LARIS_DEMO_PASSWORD`, `GOOGLE_GENERATIVE_AI_API_KEY`) are exposed only via `serverEnv()` and are intended for server routes / scripts.
- Backward compatibility is maintained: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is preferred, but `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback (see line 5 of `env.ts`).
- Optional AI model names default to `gemini-2.5-flash` when unset.
- Seed/test scripts explicitly load `.env` via Node's `--env-file=.env` flag in `package.json` scripts, keeping script and app configuration in sync.
- No YAML/TOML/JSON config files are used; configuration is exclusively key-value environment variables.