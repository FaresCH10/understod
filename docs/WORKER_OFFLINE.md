# Private Worker Offline Briefings

Checkpoint: 2026-10-10. Partial S25/S41/A07/M4 coverage, not a production or
full offline-readiness claim.

## Implemented Contract

- Explicit private-device consent saves only the worker's exact published
  assignment, title, instructions, question, available canonical WAVs, recording
  notice and minimal session/scope metadata. No cookies, access tokens, rubrics,
  staff notes, coworkers or assessment outcomes are cached.
- Separate IndexedDB storage uses AES-256-GCM, a nonextractable local key,
  context-bound authenticated data and revision compare-and-set writes. Exact
  readback is required before claiming success. The key remains on the device;
  this is not a secure vault or remote-wipe mechanism.
- At most five briefings and 10 MiB of serialized encrypted text/audio payload.
  Expiry is the earlier of session expiry and save plus 24 hours. Limits reject
  without evicting another briefing; explicit refresh replaces only that exact
  assignment's saved snapshot. Each WAV is bounded to canonical mono PCM16 at
  16 kHz, at most 90 seconds.
- Online saves recheck the session and exact assignment after reading the
  authorized text, audio and notice. Changed version, publication, language,
  deadline/response state or repeat request prevents the commit.
- Bootstrap exposes an explicit local-only reader only on transport failure or
  HTTP 5xx. Denied authority, other HTTP errors, malformed successful sessions
  and cancellation never become offline authentication. Cached session metadata
  never opens the online workspace.
- Reopening requires the same tab's bound session lease, identity, context and
  expiry. The local-only view warns that access may have been revoked or a newer
  publication may exist. Session signals lock the reader. Expired items are
  hidden and pruned on storage reads; no background/closed-browser purge claim.
- Saved body/question audio plays from local Blob URLs. The cached recording
  notice allows local-only answer capture without fetching a new notice. No
  upload control exists there. Explicit local save reuses the bounded encrypted
  answer outbox and original submission ID; reconnect sending remains a separate
  operation with fresh session/receipt/assignment checks.
- Device controls remove saved briefings independently from answer recordings.
  Session cleanup attempts tab metadata, audio and briefing stores independently,
  reports failure and verifies deletion. Local clearing does not end server
  access while disconnected. Unsent-work warnings remain explicit.
- Controls, warnings and local-only states are translated into EN/AR/UR. Saving
  no longer unnecessarily refreshes and unmounts its own success confirmation.
- Shared-device follow-up now defaults each tab to blocking new private saves.
  Explicit exact-session private choice and individual save consent are required;
  shared reset invalidates older tab choices before cleanup. Offline entry locks
  on policy change. See `WORKER_SHARED_DEVICE.md` for executed evidence/limits.

## Executed Evidence

- 37 focused offline, local cleanup, outbox, retry, session and public-shell
  tests pass, zero failed/skipped (2.894 seconds). Includes opt-in, strict
  whitelist, exact readback, count/byte bounds, tampering, expiry, same-tab lease,
  stale asynchronous authority, snapshot rechecks and bootstrap status handling.
- Strict TypeScript and optimized build pass. Entry 557.29 kB / 149.82 kB gzip;
  the existing 500 kB warning and ineffective dynamic-import warning remain.
- Disposable loopback fixture uses native browser IndexedDB and generated tones,
  never microphone hardware or a provider. Harness verifies nonextractable key,
  exact saved body/question WAVs, same-tab lease and separate exact answer WAV.
- Built Urdu reader opens when the fixture returns 503 for every non-QA origin
  path. Exact instructions/question and saved answer survive same-tab reload.
  Body/question playback uses Blob URLs, duration two seconds, readyState 4,
  no media error and advancing playback time. Local recorder/notice controls
  load without an upload button. Actual microphone capture was not requested.
- Final built save control retains its visible Urdu success message. Independent
  device removal shows zero briefings while retaining the answer; removing all
  answers then shows no saved recording. Cleanup screenshot:
  `artifacts/worker-offline-cleanup.jpg` (normal desktop viewport, not phone QA).
- Fixture signed out and stopped cleanly: zero worker mutation POSTs, zero
  recordings, zero assignment-30 answer receipts, 62 API GETs. No real worker
  data, provider, mail, cloud or main-business mutation. Seven selected main
  business/settings hashes and integrity/FKs remain unchanged after preview
  restoration; synthetic API 59159 and Vite 66436 serve ports 3021/3020.
- Reticle has no connected browser and supplied no verdict; it was not wired or
  installed. Native browser evidence is separate, not a Reticle pass.

## Open Gates

- Follow-up repair: readiness requires exact bounded worker acknowledgement and
  hashes of every cached manifest entry. Explicit Retry repairs missing cache;
  updates never skipWaiting or force a reload. 19 focused checks pass (2.938 sec),
  strict build passes at 557.91 kB / 150.08 kB gzip. Native fresh fixture 3195,
  with an older tab open, proves removal reports Unavailable, repair reports
  Available, then origin-wide 503 opens Urdu text/question/audio/outbox. A fresh
  unbound tab is locked with no identity, instructions or audio. Screenshot:
  `artifacts/worker-offline-repaired-shell.jpg`. Fixture stopped cleanly: 19 API
  reads, zero worker writes/recordings/answer receipts. No external operation.
- Different-build waiting update and offline clear/reconnect/expiry journeys
  remain incomplete. The browser disconnected after an uncertain offline-clear
  action; neither clearing nor temporary-tab cleanup is claimed. Same-tab-only
  reopening deliberately does not yet cover reopening
  a closed tab or installed-phone offline behavior. Shared-device policy UI is
  now implemented; full cross-tab failure and physical journeys remain open.
- Physical disconnection, actual microphone capture/save/retry, independent
  conversation-voice outbox, all responsive/accessibility/reference checks and
  final performance/security/release verification remain open.
- Production PostgreSQL/cloud/runtime/live-provider/backup-restore gates remain
  open. Gemini Free stays synthetic-only; no real worker material is permitted.
