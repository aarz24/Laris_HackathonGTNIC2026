# Forgiving Voice Order Matching

## Expected behavior
- Understand quantity-separated orders without commas.
- For “2 es kopi susu 1 Americano 1 butter crossan bayar kiri”, preserve quantities 2/1/1, recognize the first two menus, offer Butter Croissant for confirmation, and require a payment choice.
- Never silently substitute an uncertain menu, discard unknown words, or accept an unclear payment.

## Shared parser and review contract
- Add `src/lib/voice-order.ts` for pure parsing, response validation, draft validation and safe cart-merge helpers. Use type-only domain imports to avoid runtime cycles.
- Preserve the existing `parseOrder` return shape and API fields: items, payment and unknown. Add an API review object with version 1, ordered lines and payment evidence.
- Each line has a stable occurrence ID, raw text, quantity or null, optional note/productId, status, optional issue, and up to three unique catalogue candidates. Statuses: exact, suggested, ambiguous, unknown, invalid. Candidate fields: productId, score and method.
- Payment evidence has explicit/unspecified/unclear/conflicting status, method or null, and raw fragments. Unspecified payment retains the existing cash default with a visible “not spoken” label; unclear/conflicting payment has no accepted selection.
- Only resolved lines enter the legacy items projection. Unresolved lines and unclear/conflicting payment remain in unknown so older consumers cannot bypass review.
- Validate response shape, unique line IDs, candidate/product availability and quantity bounds before creating an editable draft; conservatively handle older responses without review evidence.

## Segmentation and catalogue matching
- Retain existing separators, aliases and polite prefixes; additionally split repeated quantity-led phrases. Protect exact catalogue names containing numbers.
- Support positive digit and Indonesian word quantities through 999, including existing shorthand. Default to one only when no quantity expression exists.
- Accept postfix quantities only at an unambiguous clause boundary. Flag uncertain boundaries, unknown modifiers, unsupported quantities and invalid numeric forms rather than guessing. Detect decimal/negative forms before punctuation splitting.
- Enforce 2,000-character and 50-line limits without truncating orders.
- Resolve exact names and aliases first, retaining collisions as choices. Exact unavailable products remain unavailable.
- Use dependency-free Damerau–Levenshtein similarity with conservative phonetic normalization on complete phrases. Preserve numeric tokens, require exact short tokens and reject unexplained extra tokens.
- Offer candidates at similarity 0.75 or above. Mark a single leading suggestion only at 0.90 or above with a 0.12 lead; otherwise show alternatives. These are initial tuning values, not accuracy guarantees. Every non-exact match requires user acceptance.
- Parse payment markers separately; repeated identical methods are fine, conflicting or unrecognized methods require selection. Selecting payment never resolves unrelated unknown items.

## Local and cloud integration
- Update `src/lib/laris-data.ts`, `src/lib/ai-fallbacks.ts` and `src/app/api/ai/parse-order/route.ts` to share the review representation.
- For text requests, give Gemini stable source-line IDs and overlay validated proposals onto those lines instead of combining separate carts. Preserve source fragments and deterministic quantities; conflicting quantities and AI-only corrections require review.
- Reject invalid catalogue IDs and duplicate/missing source references. For audio-only requests, require explicit review of proposed lines and payment.
- Preserve authentication, tenant boundaries, rate limiting, source labels, SDK interfaces and request deadlines. Do not add paid services, dependencies or automatic extra model requests.

## Editable confirmation UI
- Add `src/components/voice-order-preview.tsx` and its CSS module; integrate narrowly into `src/components/laris-app.tsx` using existing design tokens.
- Show original wording, candidate choices, catalogue menu selector, editable quantity and note, explicit row removal, current prices and payment selection in Indonesian.
- Disable insertion until all retained lines and payment are resolved, quantities are valid, products remain available, permission is present and no recording/request is active.
- Merge repeated products only when notes agree and total quantity stays at most 999. Differing notes must be edited to agree or rows removed; conflicts with existing cart notes offer an explicit option to reuse those notes rather than silently overwrite them.
- Keep immutable parsing evidence separate from editable draft state; key rows by occurrence ID.
- Invalidate draft/request state on close, new recording, text edits, successful insertion and workspace/identity/mode changes. Stop recognition before manual text changes, ignore stale speech/network callbacks, and prevent double insertion synchronously.
- Preserve the established shared request lifecycle dependencies. Do not redesign general cart identity or add speech-alternative selection in this change.

## Tests and delivery checks
- Extend the existing domain and AI reliability test files; update the offline harness import allowlist for the new shared module.
- Cover the original transcript, corrected comma-free orders, mixed known/unknown lines, close candidates, alias collisions, inactive/custom catalogues, numeric menu names, invalid quantities, unknown modifiers and all payment states.
- Cover duplicate occurrences, note conflicts, aggregation limits, double confirmation, stale results, recording/text edits and close/reopen behavior. Exercise cloud malformed proposals, unavailable provider and existing auth/rate-limit protections using the offline harness.
- Extend `scripts/eval-voice.ts` and `evals/voice.jsonl` with review-state expectations and multiplicity-aware comparisons; new safety fixtures must pass individually.
- Run typecheck, lint, unit tests, the voice evaluation directly with Node’s experimental type stripping, and production build. Run commands separately under PowerShell.
- After static/unit verification, use a Browser agent to exercise the demo at mobile, tablet and desktop sizes: parse, choose suggestions/payment, edit/remove lines, add to cart, reject unresolved cases and verify stale-state handling. Use isolated demo storage and capture evidence; no real checkout or database writes.
- Complete one consolidated review after verification; fix and re-verify any material findings.

## Scope and preservation
- Implement shared parser/API foundations before UI consumers, then verify and review.
- Preserve all pre-existing user changes, existing browser storage and the server already running on port 3000. Stop only task-created processes and remove only task-created temporary artifacts.
- No database migrations, authentication refactors, dependency upgrades, broad formatting changes or commits. Live microphone accuracy remains dependent on the browser speech service; validate text-to-order behavior independently of that service.