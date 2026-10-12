# Worker Audio Outbox

Checkpoint: 2026-10-10. S25/S41/A07 partial coverage, not full offline or release
readiness.

## Contract

- Reuses the canonical WAV encryption/validation and receipt-aware retry path.
  Saving is opt-in on a device the worker controls. No automatic upload.
- At most 10 recordings and 25 MiB encrypted payload, atomically checked inside
  the IndexedDB write transaction. One slot per assignment; another recording or
  version cannot overwrite it. Legacy single-slot recordings remain readable in
  device inventory without silent migration or replacement.
- Assignment keys are SHA-256 digests. Payload, worker/session/scope, capture
  time, expiry and original submission ID remain AES-256-GCM encrypted with a
  nonextractable browser-held key. Browser storage is not a secure vault.
- Expiry is the earlier of session expiry and capture plus 24 hours. Inventory
  checks identity/context/mode/language/expiry and exact slot binding before
  exposing bytes; corruption fails closed. Foreground recheck handles changes.
- Device controls preview, check receipt, explicitly send, remove one or remove
  all current-session recordings. Sending reauthenticates, reads the original
  receipt and rechecks assignment/publication/version/language/deadline before
  any POST. Accepted historical receipts recover even after withdrawal.
- Receipt verification is separate from AI assessment. Missing/unavailable
  receipts and conflicting assignments retain the saved copy. Session cleanup
  purges and verifies every matching slot, not just the legacy slot.

## Executed Evidence

- 20 focused audio draft/outbox/retry/local-cleanup tests passed, no failures or
  skips (0.168 seconds). The first new expiry test used an incorrect clock and
  was corrected to test the independent 24-hour cap within a valid session.
- Strict TypeScript/optimized build passes. Entry 545.19 kB; existing 500 kB
  warning remains open for the final performance pass.
- Disposable synthetic native IndexedDB harness: count and byte caps reject the
  extra save while preserving existing entries; individual removal preserves
  other entries. Lost acknowledgement followed by withdrawal recovers identical
  bytes and original receipt with one decode, one POST, one server recording and
  one receipt. No microphone or provider request.
- Actual dev worker device UI restores both entries after full page reload,
  verifies accepted historical receipt, keeps the other unavailable-assignment
  recording with an explicit conflict, and retains its frozen Urdu scope when
  interface language changes to English. Desktop screenshot inspected inline;
  no saved screenshot artifact or phone/RTL visual verdict.
- Disposable worker signed out, successful QA tab closed and fixture stopped.
  Reticle verify has no connected session and supplies no pass. Browser direct
  JSON evidence navigation was blocked and not bypassed; final post-UI wire
  counters were not separately collected. Main preview/business data unchanged.

## Remaining

Private briefing cache/offline reopening and offline bootstrap, explicit shared
device policy, full disconnect/reconnect and cross-tab journeys, installed phone
behavior, real microphone capture, mobile/accessibility/reference verification,
approved live processing and hosted deployment/security/restore/release gates.
Saved conversation voice messages are not yet included in this answer outbox.
