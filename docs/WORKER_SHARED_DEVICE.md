# Worker Shared-Device Controls

Checkpoint: 2026-10-10. Partial S25/S41/S42/A07/M4 coverage, not a
production-readiness or physical-device verification claim.

## Contract

- Each tab defaults to shared-phone mode. Explicit confirmation permits private
  saving only for that tab's exact worker session/context and expiry. Each text,
  recording or briefing save still requires its separate explicit consent.
- A device-wide noncredential random barrier invalidates all older tab choices
  before shared-mode cleanup starts. Browser text writes and audio/briefing
  IndexedDB transaction writes check the policy, not just disabled UI controls.
- Turning shared mode on warns that saved unsent work will be lost. Cancel
  preserves the mode and existing saves. Confirm independently attempts verified
  tab metadata, text, audio outbox and briefing-cache removal. Failure never
  claims a completed reset or that the device is ready to share.
- Other tabs observe the barrier through storage events. An open offline reader
  locks on policy change; reopening also checks the private choice. Older
  asynchronous private writes cannot bypass the current barrier checks.
- Shared mode blocks new private saves, not authorized online answers, recording
  capture, server receipts or assistance. Existing saved work remains recoverable
  to its freshly authorized owner until explicit removal, expiry or session
  cleanup. A default shared setting is not a claim that old device data is gone.
- This is browser privacy policy, not authentication, encryption replacement,
  remote wipe or operating-system isolation. The worker must still end the server
  session before giving the device to another person. No automatic upload,
  background purge or closed-tab private reopening is introduced.
- Mode and warning copy is available in EN/AR/UR. The confirmation is an in-app
  native HTML dialog with cancel-first focus, Escape dismissal, focus containment
  and trigger restoration; the stalled browser-native confirm was replaced.

## Executed Evidence

- Final focused regression: 51 passed, zero failed/skipped (2.952 seconds),
  covering policy, text/audio/cache, local cleanup, retry/session and shell.
  Policy checks include default denial, exact tab/context/expiry, barrier
  invalidation before asynchronous cleanup, malformed/storage failures, and
  actual browser text-store rejection without overwriting the prior snapshot.
- Strict TypeScript/optimized build passes. Entry 558.42 kB / 150.26 kB gzip;
  existing 500 kB and ineffective dynamic-import warnings remain.
- Disposable loopback fixture 3196 uses in-memory business data and generated
  tones only. Native harness proves explicit private choice, encrypted exact
  briefing/body/question/outbox saves and nonextractable keys. No hardware mic.
- Built Urdu UI verifies cancel preserves shared mode, explicit private choice
  survives reload, confirmed shared reset shows zero cached briefings/no saved
  recording, and shared mode disables text, briefing and recording consent/save
  controls. Sign-out returns to the public Sign in state. Screenshot:
  `artifacts/worker-shared-device-reset.jpg`.
- Restricted fixture 84923 was intentionally stopped after local network access
  failed: zero API reads/writes. Local-socket-enabled fixture 70424 then completed
  the journey and stopped cleanly: 30 API reads, zero worker mutation POSTs,
  recordings or answer receipts. Successful QA tab closed. Earlier error tabs
  are not claimed cleaned; no main database/cloud/provider/mail/real-data write.
- Reticle remained unconnected and supplied no verdict; native UI evidence is
  not represented as a Reticle pass.

## Open Gates

Native cross-tab in-flight-save races, cleanup failure UI, phone/installed-PWA,
physical disconnect, real microphone, full accessibility/reference/security and
release checks remain. Session expiry/read cleanup is not a promise to erase a
closed browser. PostgreSQL/runtime/cloud/backup/live-provider gates remain;
Gemini Free stays synthetic-only. Do not count this checkpoint as completion of
the whole worker-device or production milestone.
