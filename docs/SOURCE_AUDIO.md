# Supervisor source audio

## Persisted Quota Follow-Up, 2026-10-09

The PostgreSQL allowlisted source handle now reserves four global/tenant request
slots before network dispatch (migration 051). Both quotas default closed.
Every non-cleanup request rechecks pause, tenant and current lease/authority;
reserved provider-file cleanup may still finish after a pause. Partial/uncertain
attempts keep their reservation. Normal Gemini fetch now requires the journal,
so standalone SQLite opt-in cannot make unmetered provider calls. Synthetic
allowlisting and all existing privacy gates remain. Focused mocked checks pass;
no live source/provider or real audio was used. See PLATFORM_OPERATIONS.md.

## Provider Privacy Checkpoint, 2026-10-09 15:20 UTC

- `UNDERSTOOD_SOURCE_TRANSCRIPTION=disabled` is the default. A key alone never
  enables processing. Local synthetic credential runtimes may explicitly select
  `gemini-free`, set `UNDERSTOOD_DATA_CLASS=synthetic`, and provide
  `UNDERSTOOD_SYNTHETIC_AUDIO_HASHES` as a nonempty JSON array of at most 100
  distinct lowercase SHA-256 hashes of operator-verified synthetic canonical WAVs.
  Never add hashes of real worker/supervisor recordings. Browser input cannot
  modify this configuration. The development demo launcher cannot opt in.
- The shared SQLite/PostgreSQL worker denies unknown hashes before reading either
  private audio object. The adapter independently validates canonical WAV bytes,
  checks their digest and snapshots them before asynchronous upload. Global
  synthetic mode or journal metadata alone is insufficient. Only a transcription
  handle is exposed, not arbitrary text preparation or response assessment.
- Configuration performs no provider call. Unknown sources remain blocked and
  require the existing explicit retry after an operator correction; there is no
  automatic fabricated transcript or fallback. Real source processing stays off
  Gemini Free and needs a separately approved provider/privacy arrangement.
- Google's [Gemini API terms](https://ai.google.dev/gemini-api/terms), checked
  2026-10-09, say unpaid-service content may improve products and may receive human
  review, and warn against submitting sensitive/confidential/personal content.
  Protocol documentation: [transcription](https://ai.google.dev/gemini-api/docs/transcribe).
  No live account eligibility, quota or provider behavior has been verified.
- Full suite: 539 tests, 536 passed, zero failed, three external PostgreSQL skips
  (96.584 sec). Focused privacy/configuration/storage tests: 53 passed. Tests prove
  unknown audio causes zero object reads/HTTP calls, malformed configuration fails
  closed, and permitted mocked audio creates one exact transcript draft. Strict
  build and all 48 shell hashes pass. Main 72990 was restarted synthetic with
  email disabled; original overview/business hashes/integrity/FKs are unchanged.
  No API key was retrieved, no external request sent and no microphone used.

## Explicit Retry Checkpoint, 2026-10-09 15:09 UTC

- Owner/supervisor retry accepts only their exact accepted blocked/failed source,
  original request hash, unchanged frozen authority and a confirmed fresh command
  ID. Pending/processing/completed/cleanup-expired sources cannot start another
  command. The same accepted command replays its original receipt without
  queueing again, even after transcription has completed.
- SQLite and PostgreSQL migration 045 preserve immutable retry receipts and
  transactional audit evidence. The existing worker still requires a permitted
  adapter and never fabricates transcription when unavailable. Retry does not
  upload bytes, enable a provider, create a published version or certify a draft.
- Shared receipt/history controls store only exact-session command metadata in
  tab storage before sending. Reload performs read-only lookup. After an uncertain
  POST, resend is unavailable until lookup verifies a missing receipt; resend
  requires another explicit confirmation and keeps the same command ID.
- Backup/restore and PostgreSQL cutover preserve populated retry history even
  after source objects have been removed. Cleanup and authority changes fence new
  writes; original accepted retry evidence remains readable within current scope.
- Full suite 16208: 533 tests, 530 passed, zero failed, three external PostgreSQL
  skips (95.727 sec), before final receipt-copy/status-refresh refinements. Final
  build, 12 focused passes and all 48 shell hashes pass. Native built lost-ack
  recovery/reload produced one POST/one receipt; dev before-save failure plus
  explicit resend produced two POSTs/one receipt. Cancellation, unavailable
  provider, exact synthetic transcript draft and mobile/desktop layouts verified.
  No external provider, real microphone or main data mutation was used.
- Provider integration remains open. Real source audio must never be sent on
  Gemini Free. A safe per-source provenance/policy boundary is required before
  connecting the permitted adapter; the synthetic fixture is not that policy.


## Cleanup Checkpoint, 2026-10-09 14:45 UTC

- Abandoned, unaccepted uploads expire after 24 hours when no upload lease is
  active. Accepted audio expires only under an explicit site audio retention
  policy. No policy means no automatic accepted-source expiry.
- SQLite and PostgreSQL migration 044 keep scoped cleanup tombstones. Claiming
  cleanup fences upload acceptance/replay, private reads and transcription finish.
  Original and canonical objects are removed idempotently; both must be absent
  before completion and the first completion audit commit. Partial storage,
  absence-verification and audit failures retry without falsely reporting removal.
- Cleanup leases recover after expiry; completed jobs reverify hourly to remove
  late objects. The first completion date/audit stays unchanged. Receipts and
  history expose only cleanup pending/removed, never private object references.
  Original transcript, saved draft, publication and response history are not
  removed by audio cleanup and require separate retention work.
- Local backups omit objects under cleanup and preserve tombstones. Restore and
  PostgreSQL cutover retain removed receipts without requiring or reviving files.
- Full suite 65563: 524 tests, 521 passed, zero failed, three external PostgreSQL
  skips (92.596 sec). Final responsive history fix follows the full suite; strict
  rebuild and all 47 shell hashes pass. Built synthetic QA verifies removed
  receipt, stopped pending history, preserved completed draft and two completed
  cleanup jobs. The 320px history wraps metadata and stacks its draft button.
  Evidence: artifacts/source-audio-cleanup-receipt-desktop.jpg,
  artifacts/source-audio-cleanup-history-mobile.jpg,
  artifacts/source-audio-cleanup-retention-desktop.jpg.
- Final focused regression after the layout fix: 36 passed, zero failed
  (19.927 sec). The first sandboxed run could not open loopback sockets; rerunning
  with local sockets enabled passed. No external PostgreSQL/provider was contacted.
- Main 93436 runs synthetic/email-disabled; original business hashes, 30/25/22/3/5
  overview and empty source/cleanup tables remain unchanged, integrity/FKs clean.
  No real microphone, live provider, cloud storage or Neon account was used.
  Permitted provider integration and explicit blocked/failed retry remain next.

## Client Checkpoint, 2026-10-09 05:40 UTC

This supersedes the disabled-upload statements in the earlier checkpoints.

- New briefing Audio now explicitly uploads the prepared canonical WAV and
  original bytes. Before POST, a bounded metadata-only sessionStorage reference
  retains exact title, request ID, languages, hashes/sizes and page context/expiry.
  Storage failures stop the first upload. Audio bytes remain in memory, not in
  the reference; this is not a durable offline audio outbox or secure vault.
- Recovery checks only the saved receipt. It never retries POST automatically.
  An explicit retry verifies identical original/canonical bytes, MIME and intent.
  With no accepted receipt, reload requires selecting the exact original file.
  A transient receipt error exposes no retry action until a successful lookup.
  Navigation protects unsent memory; accepted receipts do not block leaving.
- `GET /api/source-audio?page=N` returns at most 20 accepted uploads for the
  current active owner/supervisor actor/org/site, ordered by receipt time and ID.
  Strict filters, no-store headers, scoped DB queries and minimal DTOs omit raw
  transcript, original filenames, object IDs, authority and provider errors.
  The briefing library's My audio uploads view shows pending/blocked/failed and
  completed status; completed rows open the exact draft. After a verified
  accepted receipt, Continue with a new briefing clears only the local reference,
  not private audio or server history. Missing providers stay honestly blocked.
- Built native synthetic fixtures verified acceptance with English/Arabic
  selection, one transcription draft, a lost acknowledgement plus receipt outage
  with one POST, interruption before acceptance followed by identical-body retry,
  navigation/discard/reload reference recovery, disabled retry without bytes,
  blocked-upload history, continued creation and text-save navigation. Actual
  320px viewport checks showed no page overflow; desktop history opens its draft.
  Fixtures were isolated in-memory with temporary private storage and injected
  synthetic transcript only. No microphone, live provider, email or R2 was used.
- Full suite `11123`: 515 tests, 512 passed, zero failed, three external
  PostgreSQL skips, 94129.5305 ms. Twenty-seven focused checks preceded the final
  HTTP history assertions/full suite. Strict build passes; all 47 public shell
  hashes match. Evidence: `source-audio-receipt-outage-mobile.jpg`,
  `source-audio-receipt-mobile.jpg`, `source-audio-history-mobile.jpg`,
  `source-audio-history-desktop.jpg`, `source-audio-transcribed-desktop.jpg` and
  `source-audio-ui-overview.jpg` in artifacts. Main synthetic/email-disabled
  session 1065 retains original business hashes/counts; source journal is empty,
  integrity is OK and FK violations are zero. Disposable fixture sessions
  71828/87826/18747 stopped; test tabs closed and viewport reset.

Still open: unaccepted staged-object cleanup, source-audio retention, configured
permitted transcription adapter and explicit authorized retry of blocked/failed
processing, actual microphone/hardware and external PostgreSQL/R2/live/cloud
gates. Accepted upload is not transcript completion or publication. Approximate
implementation remains 70%, not a production-readiness verdict.

## Backend Checkpoint, 2026-10-09 05:10 UTC

This supersedes the missing-backend statements in the earlier preview section.
The browser form still has Audio Save disabled. No live provider/hardware
readiness is claimed.

- SQLite and PostgreSQL migration 043 retain immutable org/site/actor, title,
  selected generation languages, original and canonical hashes/sizes/object
  references and authority snapshot. New POST requests require the exact page
  session as well as ordinary cookie/origin/active-role checks.
- `POST /api/source-audio` accepts a bounded octet-stream envelope: two little
  endian uint32 lengths (metadata JSON, canonical WAV), then UTF-8 JSON, WAV
  bytes and the original bytes. Metadata is capped at 2048 bytes, original at
  10 MiB and canonical audio at 0.25-90 seconds. No audio/metadata goes into
  query strings or public URLs. Original bytes are opaque evidence, not a
  server-verified assertion that the two formats have identical audio content.
- Both private objects use exclusive creation and verified read-back before
  receipt acceptance. R2 originals use octet-stream/no-store, not browser
  rendering. Local originals have a distinct `.source-original` suffix.
  Conflicting IDs/bodies reject; active leases fence concurrent storage.
  Lost object/SQL acknowledgements reconcile the same references. Uncertain
  objects are never deleted as a guessed compensation.
- GET `/api/source-audio/:requestId` reads an actor-bound no-store receipt.
  `/audio` and `/original` authorize again after storage I/O. Original files
  download as octet-stream attachments. Receipt DTOs omit source text, object
  IDs and raw database/provider errors.
- Asynchronous processing checks current issuer/account/access revision before
  storage/provider work and before commit. Reclaimed/expired leases fence late
  results. A valid bounded transcript, creation receipt, draft relationship
  and audit commit atomically, preserving selected generation targets.
  Missing transcription provider becomes `blocked`, never invented text.
  Failed transcription retries are bounded to three. An accepted upload is
  not a prepared or published briefing.
- Verified local backups include both accepted files and reject corrupt
  originals. Restore and SQLite-to-PostgreSQL synthetic cutover preserve
  receipts/references and reset interrupted processing leases. Staged unreceived
  objects are not asserted as accepted evidence or included as accepted files.

Evidence: `tests/source-audio-storage.test.mjs`: 22 passes. Full suite 70733:
510 tests, 507 passed, zero failed, three external PostgreSQL skips,
87430.2145 ms (`artifacts/source-audio-backend-tests.log`). Strict build passes:
index-CYmkGeOc.js 482.83/131.36 kB gzip; all 46 public shell hashes verified.
Tests use synthetic bytes and injected local adapters, never a real voice or
external provider. PGlite is not real wire/TLS/concurrency evidence.

Main 44758 runs synthetic/email-disabled on 3020/3021 after an intentional
restart. Native overview retains original 30/25/22/3/5; selected business table
hashes are unchanged, source journal empty, integrity OK/FKs zero. Proof:
`artifacts/source-audio-backend-overview.jpg`. A Reticle status call unexpectedly
added dev-only instrumentation; its timestamp-confirmed files/dependencies
were removed and strict build/native overview reverified. No Reticle gate pass.

Next: client exact upload/receipt recovery and status handling, then native
end-to-end checks; staged-object reconciliation/cleanup, original/canonical
retention and its backup implications; explicit provider retry controls and
configured runtime integration. Audio preview below remains memory-only.
Gemini Free remains synthetic-only. Approximately 70% implementation, not
production readiness.

## Earlier Local Preview Checkpoint

2026-10-09 04:46 UTC, S09/A10. This workflow is **in progress**. The new
record/upload controls prepare a local preview; audio-draft submission remains
disabled because original-audio storage, receipts and transcription jobs are
not connected. This is not a substitute for completing that required workflow.

## Current Implementation

- Explicit file selection or microphone action, native preview and discard.
  No automatic upload, provider call, draft creation or invented transcript.
- Before decoding, inputs must be nonempty Blobs no larger than 10 MiB.
  Decoded channels are bounded to eight; the existing encoder enforces
  0.25-90 seconds, audible PCM and canonical mono 16 kHz WAV.
- The original immutable Blob and one retry-stable canonical payload/ID remain
  in memory. Callers receive copies; failed replacements retain a valid preview.
  Cancellation fences late decodes and microphone permission results.
- Capture chunks are size-bounded; streams, timers, handlers and object URLs
  are released on cancellation/unmount. Automatic stop leaves final-frame
  headroom below the strict encoder maximum; delayed/overlong captures reject,
  never silently truncate. Browser permission/device/interruption errors show
  honestly. Hardware recording has not been exercised.
- In-page leave confirmation protects source mode, sidebar/back navigation,
  sign-out and site switching. Cancel retains audio; confirmed discard releases
  it. Browser unload has its own warning. Existing text draft creation remains
  unchanged and is the only enabled submission path.

## Evidence

`node --test tests/source-audio.test.mjs tests/audio.test.mjs
tests/worker-unsent.test.mjs`: ten passes, zero failures. Tests include original
retention, canonical byte copies, invalid IDs, size/duration/channel/silence,
corrupt decoding and cancellation before/after delayed decode.

Full suite 85969: 488 tests, 485 passed, zero failed, three external PostgreSQL
skips, 90577.8255 ms. This run precedes final in-page leave/style/fixture-port
changes. Subsequent strict build, focused checks and final built browser QA
pass. Final automatic-stop headroom adjustment requires the final rebuild
recorded in the root checkpoint. That final rebuild now passes:
index-CYmkGeOc.js 482.83 / 131.36 kB gzip, ten focused passes,
all 46 public shell hashes verified. It is not real-microphone evidence.

Memory-only credential fixture, fresh origins on 3178 and 3188: native file
chooser prepared a synthetic one-second tone; DOM audio duration 1, readyState
4. Corrupt replacement preserved that preview. Canceling leave/mode/sign-out
preserved it; confirmed leave returned to overview; confirmed mode switch
restored text and enabled text Save. Actual 320px preview stayed within the
viewport (document width 305, viewport 320; audio x36-269). Final mobile and
desktop screenshots inspected. Earlier cached build/native-confirmation stalls
were not counted as final evidence; an accessible in-page dialog replaces that
confirmation. Fixture ports are now configurable, still loopback/memory-only.

Proof: `artifacts/source-audio-mobile.jpg`,
`artifacts/source-audio-leave-mobile.jpg`, `artifacts/source-audio-desktop.jpg`.
Synthetic tone/corrupt files are under `artifacts/`; no actual voices were used.
All disposable fixtures stopped, their tabs closed, viewport reset. Main
preview's earlier process handle and listening sockets were gone; restart
12006 is synthetic/email-disabled on 3020/3021 and browser-verified at original
30/25/22/3/5 counts. Selected database hashes/integrity/FKs are unchanged.

## Next Required Work

Persist original source audio privately with scoped immutable request metadata
and verified readback/recovery, then queue fenced transcription and create a
text-backed draft exactly once from the accepted source. Implement equivalent
SQLite/PostgreSQL contracts, cleanup/retention/import and authorized private
playback. Connect explicit UI submission/recovery only after those boundaries
are verified. Gemini Free remains synthetic-only; live/hardware/cloud/privacy
and full reference/accessibility gates remain open. Estimate remains about
70% planned implementation, not readiness.
