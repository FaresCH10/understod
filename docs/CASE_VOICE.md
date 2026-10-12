# Private Voice Conversations

Checkpoint: 2026-10-10. S15/S24/A13, PostgreSQL migration 062. Partial production
coverage, not a release-readiness claim.

## Contract

- Workers can send an independent help recording or reply to their own open case.
  An answer deadline does not close help; withdrawn content does.
- Canonical WAV validation, private save and exact hash/length readback precede
  acceptance. Authority, deletion, publication, case and storage lease are checked
  again after I/O. Lost save acknowledgements recover only by verified readback.
- `case_voice` journals storage identity separately from answer recordings. Atomic
  acceptance creates a localized Voice message, optional help case/routing and
  audit/notification, never an answer receipt, attempt or assessment job.
- Exact request replay binds actor/site/assignment/kind/case/audio hash. Received
  historical receipts survive case closure without reopening it.
- No transcript is fabricated and no voice data is sent to AI. Playback rechecks
  current authority, worker ownership, retention and deletion after reading bytes.
- Provider-independent cleanup leases failed/abandoned/expired/deleted audio,
  verifies absence and periodically rechecks cleaned references for late writes.
  Deletion redaction/completion waits for this cleanup and checks actual objects.
- UI uses the existing microphone/preview recorder and fail-closed site notice.
  Help/reply notices explicitly distinguish voice messages from assessed answers.
  Session storage retains only scoped request ID/hash, never audio. An uncertain
  preview allows exact retry/read-only receipt checking, not replacement.

## Evidence

- `tests/case-voice.test.mjs`: independent post-deadline help, no answer metrics,
  exact replay/privacy, same-case reply/closure, corrupt readback/audit rollback,
  authority change during I/O, cleanup absence and deletion/late-write fences;
  credential HTTP checks page context, WAV-only input, scoped playback and receipts.
- `tests/case-voice-recovery.test.mjs`: scoped metadata-only retention, exact byte
  hash/request identity and receipt validation; localized non-AI voice notice.
- Focused voice/recovery/session/notice run: 11 passed, zero failed/skipped,
  13.837 seconds. Earlier overlapping backend/follow-up/review/migration run:
  25 passed, zero failed/skipped, 13.560 seconds. Runtime/state rerun: eight passed,
  zero failed/skipped, 2.328 seconds. Sandbox loopback denials were rerun with
  local socket permission, not hidden as application failures.
- Strict TypeScript/optimized build passes; entry 544.80 kB, existing size warning
  remains for the final performance pass.
- Built disposable credential browser shows help after original answer expiry,
  initial/reply recording controls, private voice message and 0:02/0:02 native
  synthetic tone playback. Original answer remains distinct. Inline screenshot
  inspected, no saved screenshot artifact, microphone or phone capture claimed.
- Graceful fixture shutdown: one assignment, one case, one answer receipt, one
  separate received voice reply; original attempt hash unchanged. Temporary tab
  closed; fixture stopped. No provider/cloud/mail/deployment/real data operation.

## Remaining Gates

SQLite voice/repeat/review/generated-follow-up parity, private offline outbox,
explicit recovery/cancellation when an uncertain preview was lost, complete
concurrent PostgreSQL/R2 interruption/retention drills, hardware recording,
mobile/RTL/accessibility/reference review, approved live processing and deployed
privacy/security/restore/release gates. Reticle has no connected verdict. The
main local SQLite preview does not expose PostgreSQL-only voice controls.
