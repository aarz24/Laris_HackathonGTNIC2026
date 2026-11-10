# Testing and deployment summary

## Automated checks

The latest CI run passed:

- TypeScript type-check
- ESLint
- Node test suite
- Production build

Run the same checks locally:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The test suite covers ledger calculations, checkout and idempotency, validation, catalog and recipe behavior, moving-average cost, HPP, voice parsing, AI reliability, CSV export security, QRIS actions, and cloud-readiness checks.

## Production verification

The public deployment is available at [laris.website](https://laris.website). The submission verification covered public health checks, browser flows, authentication redirects, responsive layouts, AI/OCR behavior, and the QRIS recording flow. QRIS remains a manual confirmation flow: the cashier verifies the payment in the merchant app before recording it in Laris. No real-money payment was used during testing.

## Cloud setup

1. Copy `.env.example` to `.env`.
2. Set the Supabase URL, public key, and `NEXT_PUBLIC_APP_URL`.
3. Apply every migration in `supabase/migrations/` in order.
4. Configure Supabase Auth Site URL and callback URL.
5. Keep service-role and Gemini keys server-side only.
