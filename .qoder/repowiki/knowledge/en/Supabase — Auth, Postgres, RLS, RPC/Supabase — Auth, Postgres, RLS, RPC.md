---
kind: external_dependency
name: Supabase — Auth, Postgres, RLS, RPC
slug: supabase
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

### Identity
Supabase provides Auth, Postgres storage, Row-Level Security policies, and server-side RPC functions used by Laris.

### Role in Laris
- Cloud mode is enabled only when `NEXT_PUBLIC_SUPABASE_URL` + a publishable/anon key are set; otherwise the app runs in local/demo mode using browser storage.
- Auth flow uses Next.js App Router callback at `src/app/auth/callback/route.ts`; site URL and redirect URLs must be configured in the Supabase dashboard.
- Data isolation is enforced per-tenant via `business_id` columns and RLS policies; membership/role checks also run inside Supabase RPCs.
- Migration order is strict: `0001_schema.sql` → `0002_rls.sql` → `0003_functions.sql` → `0004_workspaces.sql` → `0005_production_hardening.sql`. Applying only the latest migration on a fresh DB is explicitly warned against.

### Secrets
- Client keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Server-only: `SUPABASE_SERVICE_ROLE_KEY` (used for inviting members without an account and admin scripts); never exposed to the browser.

### Auth protocol
Auth callbacks rely on Supabase's standard OAuth/email flow with `site_url` and `<origin>/auth/callback` registered in the dashboard.