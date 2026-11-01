# Forgiving voice orders: delivery verification

## Starting point

Git HEAD was `952941b` (`wip: state before switching to Codex`). Only `plans/` was untracked; there were no pre-existing tracked-file modifications.

That commit already implemented the shared parser/review/draft contract, conservative spelling and phonetic suggestions, quantities and payment evidence, local/cloud source-ID integration, editable Indonesian preview, offline route harness, and multiplicity-aware voice evaluation.

## Remaining work completed

- Fixed a stale confirmation race: an old React handler could insert a preview after a text edit, new recording, replacement parse, or close/reopen, before state updates committed. Confirmation now checks the identity of the current validated preview synchronously.
- Workspace/account/mode changes now clear the recording flag, transcript, and source notice alongside the preview and pending requests. Late speech callbacks and network responses stay invalidated.
- Extended the existing source-coupled lifecycle harness to execute the actual voice handlers with fake recognition and deferred requests. Added seven behavioral tests for confirmation consumption, invalidation before commit, stale responses, speech replacement, and workspace/account/mode cleanup.

## Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 175/175 passed, including offline cloud malformed-proposal, auth, tenant, rate-limit, cancellation, and deadline coverage.
- `node --experimental-strip-types scripts/eval-voice.ts`: 77/77 fixtures passed, including all 27 required safety fixtures.
- `npm run build`: passed, with all 11 static pages generated and no compilation/type/lint errors. Ran against a temporary copy of the current source using the installed dependencies; only the copy's Turbopack root was adjusted to resolve those dependencies. The original production server and `.next` build were preserved. An initial copy inside `node_modules` crashed the native build worker; moving the copy to the system temporary directory resolved this verification-layout issue.
- Headless Chrome against that production build on temporary port 3001: mobile 390×844, tablet 768×1024, desktop 1440×1000. Separate temporary browser profile; demo storage only; no checkout, cloud calls, or database writes.

Each viewport passed the original 2/1/1 transcript, unresolved insertion rejection, payment selection independent of menu acceptance, Croissant suggestion acceptance, quantity/note editing, insertion into the cart, explicit unknown-line removal, text-edit invalidation, close/reopen invalidation, and absence of horizontal modal overflow. No uncaught browser exceptions. See `browser-results.json` and the viewport screenshots.

## Consolidated review

Reviewed the parser, response/draft validators, source-ID overlays, preview controls, stock/note/quantity merge checks, request lifecycle, and final diff. The two lifecycle findings above were fixed and verified. No further material findings.

Live microphone transcription quality still depends on the browser's speech service. Recognition lifecycle was tested with fake callbacks; text-to-order behavior was tested independently in the browser. The existing port 3000 process is an older production server and was not restarted, so it does not serve this updated workspace code yet.
