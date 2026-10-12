# Worker Tab Text Recovery

## Implemented

Saving is explicit and off by default. The worker confirms this is a device they
control and chooses Save text in this tab. One bounded snapshot contains at most
2,000 answer characters, 500 help characters and three latest request IDs. It
excludes audio, briefing content, rubrics, credentials and server tokens. It is
bound to the verified worker/context/language/mode/session expiry and exact
assignment/publication/version. No automatic save, restore or POST. Later edits
require another explicit save.

Native sessionStorage retains the snapshot over a same-tab reload. Restore is
available only after the authenticated app and exact briefing detail load. A
different live worker/context/expiry cannot restore it; its snapshot is removed
without rendering plaintext. Another assignment/version cannot overwrite or
restore it. Expired, malformed, oversized, denied or unacknowledged storage fails
closed. Future capture timestamps cannot be restored. Restore cannot replace
current text, pending request tracking or an unsent recording. Restored text is
also visible read-only when the assignment no longer accepts a new answer.

Optional saved request metadata restores the existing GET-only receipt check.
Receipt confirmation does not send another answer or clear restored text. It
does not establish AI accuracy or safe work. A snapshot is not an immutable
pending-upload payload, automatic retry authority or a durable audio outbox.

Remove saved text is available on the briefing and device screen, checks removal
and leaves current page text intact. Existing successful logout/access-switch
cleanup removes Understood tab keys. Leaving warnings now distinguish discarded
page memory from explicitly saved snapshots. Device privacy copy distinguishes
uncached private briefings/audio from optional tab text storage.

## Privacy And Limits

This is plaintext browser storage, NOT an encrypted vault. Same-origin scripts,
XSS or a person controlling the browser can access it. Do not enable on a shared
device. Closing the tab normally ends this page storage session; browser session
restore/opener copies may preserve or copy browser-managed state. Server session
expiry and identity are rechecked before app restoration. A disconnected device
cannot be remotely erased. Session-verification failure locks the app; it does
not constitute a durable offline authentication mode. No closed-tab recovery,
storage-retention, private offline briefings, audio recovery, background-upload
or reconnect-conflict guarantee.

Platform reference: [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).

## Evidence

- Seven focused snapshot checks cover consent, bounds, exact scope, identities,
  expiry, malformed data, storage failures, pending IDs and audio overwrite guard.
- SQLite detail now includes the immutable publication ID already present in
  PostgreSQL. Regression checks preserve private-field exclusion and no-store.
- Latest full suite 61949: 397 tests, 394 passed, zero failed, three external
  PostgreSQL skips, 94.16 seconds. This precedes only final leave/privacy copy and
  the device removal control. Final related subset: 26 passed, zero failed.
- Strict final build passes without warning: main 490.80 kB / 133.27 kB gzip.
  All 27 public build hashes independently match. No protected responses cached.
- Disposable optimized-build EN/AR/UR save/reload/restore recover exact text
  without adding worker POST. AR/UR 320px screenshot/DOM bounds fit. Removal keeps current text.
  Switching AR to UR exposes no AR snapshot.
- Lost real synthetic acceptance acknowledgement: explicitly save, reload,
  restore original pending ID, manual GET confirms. Counters: one POST, one
  attempt, one receipt GET, zero audio. No repeat submission.
- Final optimized Urdu device removal succeeds at 320px. Its public shell is
  available; fixture-owned public cache removed successfully through the UI.
  Installation is not offered. Reticle is unconnected; no verdict.
- Screenshots in artifacts/deletion-ui: worker-text-reload-en.jpg,
  worker-text-reload-ar-320.jpg, worker-text-reload-ur-320.jpg,
  worker-text-reload-receipt.jpg and worker-text-device-ur-320.jpg.
- Those first screenshots/checks were development mode, not optimized-build
  evidence. This was caught before closing the checkpoint. Repeated final-build
  checks use --built fixture 49562: worker-text-built-receipt-en.jpg,
  worker-text-built-ar-320.jpg, worker-text-built-ur-320.jpg and
  worker-text-built-device-ur-320.jpg. Original receipt remains one POST/one
  attempt/one GET; later AR/UR save/reload/restore adds no POST or audio. Snapshot
  and fixture public cache removed, final QA tab closed, viewport reset, fixture
  49562 stopped. The updated leave warning was observed in the built dialog.

Main preview was intentionally restarted from verified-live 67581 to 98032 to
load the SQLite detail contract. Eight selected saved business-table hashes,
integrity and foreign keys match across that restart. Sessions excluded. Fixture
70084 stopped/replaced by 58695 after the detail correction; 58695 now stopped,
QA tab closed and viewport reset. No saved business submission, microphone, real
data, provider, cloud or deployment. Approximately 65%, not production readiness.
