---
kind: external_dependency
name: Google Generative AI (Gemini) — LLM & OCR provider
slug: google-generative-ai
category: external_dependency
category_hints:
    - vendor_identity
    - sdk_real_api
scope:
    - '**'
---

### Identity
The app uses Google's Generative AI SDK (`@ai-sdk/google`) to call Gemini models; it does not call the REST API directly.

### Role in Laris
- Used by the `/api/ai/ask`, `/api/ai/parse-order`, and `/api/ai/scan-receipt` routes for voice-to-cart parsing, receipt OCR, and workspace-aware "Tanya Laris".
- Without the key the app falls back to deterministic local parsing and rule-based answers; cloud mode never fabricates OCR results.

### Integration shape
- Two logical tiers exist: `modelFast` (parse-order) and `modelSmart` (ask/OCR), both configurable via env vars with the same default.
- Telemetry for each call (feature, model id, input/output, latency, ok flag) is persisted to the `ai_event` table via `logAiTelemetry`; failures are swallowed so telemetry cannot crash primary requests.

Verify exact method/params against the official `@ai-sdk/google` docs.