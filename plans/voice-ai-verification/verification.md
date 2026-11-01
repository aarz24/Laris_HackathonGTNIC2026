# Gemini voice ordering in demo and cloud

The microphone now records audio for Gemini instead of relying solely on browser transcription. Typed orders also use Gemini's natural-language interpretation. Both paths use the current catalogue, fill quantities and notes, and produce an editable review before adding anything to the cart.

## Changes

- Added MediaRecorder capture with a 30-second limit, timer, finish control, cancellation during permission requests, and microphone cleanup. Browser speech recognition remains a compatibility fallback. Audio uploads are also supported.
- Enabled public demo voice AI through the server-only `LARIS_DEMO_VOICE_AI` flag. The supplied key is stored in ignored `.env`. Other demo AI features retain their existing local behavior.
- Added a separate `LARIS_AI_MODEL_VOICE` setting, defaulting to `gemini-2.5-flash`. The existing general model setting timed out during a live test; other features' model settings were preserved.
- Simplified the response schema sent to Gemini after a real provider call rejected the previous grammar as too complex. The shared validator still enforces catalogue IDs, field sizes, quantities, unique occurrences, and source coverage.
- Natural text interpretation keeps every source word visible, preserves deterministic quantities, and rejects omitted/rewritten fragments. Audio proposals require explicit review. One action can accept clear suggestions together; ambiguous rows and unclear payment remain blocked.
- Demo requests use the browser's bounded demo catalogue. Cloud requests continue using the authenticated tenant catalogue, ignoring client catalogue replacements.
- Added demo limits of 10 requests/minute per IP, 30/minute and 120/hour per server instance. Multi-instance hosting needs a shared gateway budget for a global cap.

## Verification

- Typecheck and `npm run lint`: passed.
- Unit/integration tests: 185 passed. Includes malformed provider responses, auth/tenant preservation, source coverage, invalid quantities, payment uncertainty, rate limits, recording lifecycle, late callbacks, and double confirmation.
- Offline voice evaluation: 77/77 fixtures, including 27/27 required safety cases.
- `npm run build`: passed against an isolated source copy using the installed dependencies. The copy's Turbopack root was adjusted to resolve dependencies; application code is the current workspace version.
- Live Gemini HTTP tests passed for the original 2/1/1 transcript, natural phrasing with a less-sugar note, and a generated Indonesian speech sample. Observed response times were approximately 1.7s, 1.3s, and 8.2s respectively. See `live-results.json`.
- Headless Chrome passed at 390×844, 768×1024 and 1440×1000: live demo responses, quantities, explicit payment resolution, bulk suggestion acceptance, editing, cart insertion, duplicate-click protection, close/reopen, and horizontal overflow checks. The final run used Gemini in all three viewports. One earlier model response used the labelled local fallback; the preview remained usable.
- Real browser MediaRecorder recorded generated speech through a virtual microphone, sent WebM to the live Gemini route, and produced the correct 2/1/1 cart with `less sugar`. Audio upload also passed. Cancellation on text edit and close stopped tracks without submitting audio. See `native-recording-results.json`, `browser-results.json`, and screenshots.

Audio tests use generated speech, not a person's live microphone or noisy cafe recording. Recognition can still be uncertain; the UI retains manual correction and explicit payment selection. The app does not store recordings. No checkout or database writes were performed during verification.

## Try it

The updated production preview is running at `http://127.0.0.1:3001/demo#pos`. The previous process on port 3000 was preserved. The preview runs from `C:\Users\LENOVO\AppData\Local\Temp\laris-voice-ai-b8c2722b264b4ef49743a8747a3cf68f` and remains available while that process is running.

For a hosted jury demo, configure `GOOGLE_GENERATIVE_AI_API_KEY` and `LARIS_DEMO_VOICE_AI=true` in the hosting provider's server environment, then deploy the current source. The local `.env` is intentionally not committed.
