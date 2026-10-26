Scripts are standalone Node programs (TypeScript via native TS stripping on Node ≥ 22.18, ESM `.mjs` for CSS transforms) that operate outside the Next.js runtime.

- Shared runtime helpers live in `scripts/lib.ts`: environment loading (`requireEnv`), Supabase client factories (`adminClient` bypasses RLS, `userClient` enforces it), a Jakarta timezone date helper, and an idempotent `ensureUser` admin user upsert.
- Data bootstrap: `seed.ts` uses the admin client to reset and recreate the Kopi Senja demo tenant plus a second Tenant B (Warung Bu Sri) from `src/lib/laris-data.ts`, chunking inserts to avoid payload limits.
- RLS verification: `rls.test.ts` runs with Node's built-in `node:test`, signs in as both tenants via `userClient`, and asserts cross-tenant read/write isolation across every business table plus RPC calls.
- UI asset transformers: `tokenize-ui.mjs` rewrites `src/app/globals.css` into design tokens (`:root` + `@theme inline`) by string replacement; `beautify-ui.mjs` injects a `/* laris-polish */` marker-delimited style block with polish animations and glass effects.
- Voice-parser benchmark: `eval-voice.ts` reads `evals/voice.jsonl`, invokes `parseOrder` from `src/lib/laris-data.ts`, and exits non-zero when overall accuracy falls below the 90% PRD target.

Dependency direction is one-way: scripts import from `../src/lib/*` but nothing in the app imports these scripts.