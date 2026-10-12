# Worker Request Identity

Same-page audio retries now prepare one canonical WAV, then reauthorize and read
the exact receipt before checking a fresh assignment/version/deadline and posting.
Verified acceptance avoids another POST even after publication withdrawal.
Unavailable checks/conflicts preserve the original preview/ID. This does not add
durable audio persistence or offline authentication. See `WORKER_AUDIO_RETRY.md`.

Explicit opt-in tab text snapshots can now save pending receipt IDs and restore
the existing manual GET check after reload. Actual lost-acknowledgement recovery
keeps one POST/one attempt/one GET. This is bounded plaintext tab storage, not a
durable audio outbox or automatic retry; see `WORKER_TEXT_DRAFTS.md`. Statements
below about reload clearing tracking describe the default unsaved path.

## Manual Receipt Reconciliation

GET /api/worker/briefings/:assignmentId/receipts/:kind/:requestId returns an
exact minimal answer/help/audio acknowledgement after current worker, assignment,
grant and session authorization. It permits already accepted historical versions
without reopening them for writes. Audio requires both immutable acceptance
evidence and received_at; failed assessment is not confused with failed delivery.
Unknown IDs, wrong kinds and unreceived staging rows are unavailable. Queries,
non-v4 request IDs and unbounded identifiers are rejected. No original answer,
transcript, help body, private notes, rubric, paths, hashes or token is returned.
Responses are no-store and bind the current verified opaque page context.

The worker page tracks the latest attempted request per answer/help/audio kind in
memory, and offers localized manual Check receipt. This is GET-only, never an
automatic POST. Valid success confirms receipt only, not AI success or safe work.
404 and failed reads remain unknown; no draft or preview is cleared, including
new text edited after the original attempt. Successful verification removes the
obsolete global uncertainty alert. Same-page session expiry/identity fencing
still applies. Navigation/reload clears this in-memory tracking; the identifier
ledger remains bounded but is not a recoverable private outbox.

Verification: 53 focused checks and 12 final focused checks pass. Final full
suite 53474: 390 tests, 387 passed, zero failed, three external PostgreSQL skips
(75.86 sec). Strict final build: main 488.90/132.84 kB gzip, no warning; all 24
public hashes match. Repository/HTTP checks cover pending-to-complete assessment,
resolved help, accepted failed audio, withdrawal, cross-kind/foreign authority,
revoked grants/sessions, disabled workers, privacy and unchanged business rows.

Built disposable browser checks confirm English lost-acknowledgement acceptance
with one POST/one attempt and a GET-only recheck preserving newer text; Arabic
accepted help; Urdu 404; final English 503 with one rejected POST, one GET, zero
attempts/audio. The initial mobile notice layout was corrected and final AR/UR
320px screenshots plus DOM bounds show fit. Evidence:
worker-receipt-readonly-success.jpg, worker-receipt-readonly-ar-final.jpg,
worker-receipt-readonly-ur-unknown.jpg, worker-receipt-readonly-unavailable.jpg.
Fixture public cache/tab cleaned, viewport reset, fixture 54437 stopped. Main
67581 loads the endpoint after intentional verified-live restart; eight selected
saved-table hashes/integrity/FKs match. No saved business submission, microphone,
live provider, cloud provisioning or deployment. Approximately 65%, not readiness.

Durable opt-in private storage, reload recovery, reconnect/version/deadline
conflicts and actual browser audio interruption remain unfinished. Earlier
statements that server receipt lookup is absent are historical and superseded.

## Audio Identity Follow-Up

Audio upload acknowledgements now carry the same exact request, assignment and
verified page-context identity on both HTTP backends. The client also requires a
strict server receipt timestamp and accepted recording status before resolving
the recorder send promise. Failed assessment may still be an accepted upload;
an unreceived staging row is not a receipt. Invalid acknowledgements preserve the
existing preview/retry path instead of confirming delivery. Context is computed
before SQLite audio acceptance. Deploy client and API together.

Latest full suite 53852: 387 tests, 384 passed, zero failed, three external
PostgreSQL skips (87.65 sec). Eleven final focused checks pass; the earlier full
run's legacy route-only session fixture failure was corrected and superseded.
Strict build passes: main 485.84/131.99 kB gzip, all 24 public hashes match.
Main intentionally restarted as 96186; eight selected saved-table hashes and
integrity/FKs match. Refreshed synthetic staff overview is unchanged.

HTTP tests use synthetic WAV bytes and disposable databases/private directories.
Real microphone capture, browser preview retention under an actual interrupted
upload, server receipt lookup and durable private offline storage are not proven
or completed by this checkpoint. No live provider or cloud service was used.

## Exact Identity Follow-Up

Both HTTP backends now add the verified opaque clientContext, original requestId
and exact assignmentId to successful answer/help receipts, including replays.
The client requires all three to match before clearing text or claiming receipt;
complete/pending outcome and help-ID checks still apply. A page that locks/expires
while the POST is in flight treats delivery as uncertain, not as definitely unsent.
No database migration or immutable evidence rewrite is needed. Deploy the client
and API contract together; older/missing-field responses intentionally fail closed.
This is response correlation, not a signed receipt or offline reconciliation API.

Verification: 55 focused SQLite/embedded-PostgreSQL/client checks pass. Full suite
31195 terminal: 386 tests, 383 passed, zero failed, three external PostgreSQL skips
(104.41 seconds). Strict build: main 485.45/131.90 kB gzip, all 24 public build
hashes match. These full-suite/build results precede only the final post-POST
expiry error-code wording correction; follow-up checks are recorded in build status.
Built wrong-assignment 201 responses preserve both texts with zero stored attempts
or recordings. Actual in-memory English answer success and Arabic help success
confirm the new receipt contract, clearing help only after acceptance. These are
disposable synthetic writes, not changes to the saved application database.
Screenshots: worker-request-wrong-assignment.jpg,
worker-request-exact-receipt-success.jpg, worker-help-exact-receipt-ar.jpg.

Fixture public cache removed and tab closed. Fixture 52038 and main 85860 handles
were missing at continuation; all four app/fixture ports had no listeners. Main
restored as 62312 on 3020/3021. Eight selected saved-table hashes match across the
receipt API restart/recovery; integrity ok, zero foreign-key violations. Sessions
are excluded from that claim. No live provider, storage or database account used.

The structural-only receipt limit described below is historical and superseded
by this exact response-correlation contract. Private offline/outbox, server-side
receipt lookup after reload/unknown delivery, reauthorization/conflicts and other
production gates still remain. Estimate stays approximately 64%.

## Earlier Checkpoint

Typed answers/help use one bounded, tab-local sessionStorage ledger: opaque page
context, session expiry, SHA-256 fingerprints and UUIDs. No plaintext worker name,
assignment ID, answer/help text or audio is stored. Fingerprints are derived
metadata, not encryption. This is not an outbox and cannot restore closed-tab drafts.

Fingerprints bind context, exact assignment, request kind and trimmed text. Exact
retries reuse their UUID. Validity is checked before/after hashing; a new verified
context cannot reuse another context's IDs. Reads, writes and exact readback must
succeed before sending a new ID. Malformed records are not silently replaced.
Bounds are 100 entries/20,000 stored characters; existing retries work at capacity,
but new requests are blocked instead of evicting IDs.

Answer acknowledgements require a valid receipt UUID, duplicate flag and consistent
complete/pending outcome. Help receipts also match the original request UUID and
supported status. Unexpected fields/malformed success remain uncertain and retain
text without received/saved confirmation. Typed receipts validate structure, not
the exact assignment/submission identity. That stronger contract remains required
before a durable private outbox. Server repositories/migrations are unchanged.

Request failures have EN/AR/UR focused alerts. Existing navigation/session guards
apply; no automatic retry, private cache, microphone permission or provider call.

## Verification, 2026-10-07

- Six request tests cover retries, session/expiry races, storage failure/readback,
  malformed/full ledgers, input bounds, localization and acknowledgement contracts.
  Eleven focused worker checks pass. Full suite 90937 terminal: 385 tests, 382 pass,
  zero fail, three external PostgreSQL skips; 106.01 seconds.
- Strict TypeScript/Vite build passes without warning: main 485.10/131.81 kB gzip,
  Billing 19.92/5.82, recorder 13.80/5.41, device 5.78/2.39. All 24 public build
  hashes independently match the generated shell manifest.
- Disposable built EN/AR/UR corrupt-ledger checks retain exact answer/help text,
  zero worker POSTs/attempts/recordings. Final AR/UR 320px checks: 305px document,
  no overflow and focused alerts. EN corruption predates only final focus/receipt
  validation. Two rejected English answer sends are byte-identical, no writes.
- Two malformed-201 answer receipts preserve the same request and text; malformed
  help also retains its message. Fixture POST counters are cumulative, not accepted
  submissions. No real recording/provider operation occurred.
- Lazy Billing rejection displays Invoices unavailable with working Overview;
  fresh unblocked load shows the actual empty invoice list. No invoice/payment write.
  The observed console error is the deliberate chunk rejection.
- Screenshots in artifacts/deletion-ui: worker-request-corrupt-en/ar/ur.jpg,
  worker-request-exact-retry.jpg, worker-request-invalid-receipt-en.jpg,
  billing-chunk-failure.jpg and billing-built-success.jpg.
- Fixtures 58586/59524/66915 stopped, public cache/QA tabs cleaned, viewport reset.
  Main 28667 stays live on 3020/3021; Maya's saved 30/25/22/3/5 overview restored.
  No saved business write in these checks; synthetic authentication sessions changed.

Estimate remains approximately 64%, not readiness. Private opt-in cache/outbox,
exact receipt reconciliation, shared-device/reconnect/conflicts, hardware, complete
reference/accessibility and live PostgreSQL/storage/provider/deployment gates remain.
Reticle is unconnected; no verdict is claimed.
