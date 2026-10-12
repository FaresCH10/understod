# Supervisor-Requested Repeat Answers

2026-10-10 checkpoint, migration 060. PostgreSQL implementation; SQLite parity
remains pending. This is not a production-readiness declaration.

## Behavior

An owner/supervisor can explicitly request another assessed answer on an open
case with an earlier accepted submission. Worker and published assignment must
remain available. The new deadline is explicit UTC within 30 days. There is one
pending request per assignment, not per case; expired or closed-case requests
can be superseded without reopening their cases. Identity, deadline and accepted
receipt links are immutable. There is no new assignment or audience member.

A still-open, unexpired request admits typed or recorded answers after the
original assignment deadline. Existing admission before that deadline remains
unchanged. Receipt acceptance consumes the request atomically; exact retries
recover that receipt without consuming a second request. Recording admission
is checked before private storage and again at final receipt acceptance.
Closure, withdrawal, revocation, deletion and expiry can prevent acceptance.
Interrupted storage follows the existing private cleanup path.

The existing frozen-publication assessment job checks the new attempt. Linked
repeats do not create a duplicate clarification or replace its original attempt
reference. A match does not automatically resolve the case or certify
understanding. Audio uses the existing transcription/assessment pipeline; live
transcription is not proven here. Metrics still use the latest monotonic receipt
per assignment. Pending repeat requests do not reset recorded outcomes; an
accepted repeat can change the current outcome after assessment. Earlier
attempts, original assessment and original assignment deadline remain intact.

Worker To do and Follow-up include pending repeats independently of earlier
receipt/original deadline. Worker DTOs expose repeat/case identity and deadline,
not staff notes, rubric or private reasons. Resolution closes effective repeat
admission immediately. Stored pending status is not proof of actionability; a
later request marks prior closed-case pending records cancelled under the
assignment lock. Deletion also cancels pending records, retaining audit metadata.

## Recovery And UI

Staff use a native date/time control showing the device timezone. An explicit
click sends the request. The tab retains only UUID/deadline metadata under the
exact session and case. Lost acknowledgements remain unknown; GET-only receipt
checks and reload never resend. Changed payload/actor/site/case cannot replay
another request. Typed answer fingerprints include deliberate repeat identity,
so identical answer text gets a new receipt while exact retries remain stable.

The case screen retains original response and frozen facts first. Rebrief
content can use the existing conversation; generated translated speech remains
synthetic-only and default-disabled. The repeat request itself sends neither a
translated instruction nor a new question.

## Evidence

- Six new embedded PostgreSQL repeat checks cover receipt/reassessment,
  scope/role/deadline fences, closure, audit rollback, recording and deletion.
  Client checks cover response state and distinct stable identical-text IDs.
- Relevant PostgreSQL domain, repeat, worker receipt/state/audio-retry and
  migration regression: **75 passed, zero failed/skipped**, 52.254 seconds.
  Sandbox HTTP connections initially failed EACCES; loopback-enabled rerun passes.
- Conversation/follow-up/deletion/populated cutover/embedded compatibility:
  **27 passed, zero failed/skipped**, 14.012 seconds. Runs overlap; do not sum
  them as unique coverage.
- Strict TypeScript/optimized build pass. Entry 531.82 kB, 143.20 kB gzip;
  the existing size warning remains for the final performance pass.
- Built in-memory credential browser fixture on 3193 verifies lost
  acknowledgement, failed receipt read, reload/exact GET recovery, To do(1) and
  Follow-up(1) after original expiry, typed receipt, two separate submitted
  answers, original case/assessment and submitted repeat visible to supervisor.
  The synthetic adapter deliberately returns clarification, not a language
  quality or live-AI evaluation. Desktop screenshot inspected inline only.
- Fixture tab closed and process 59695 terminated. Shutdown diagnostic counters
  were not returned: no browser wire-count proof. Reticle tools unavailable in
  this continuation; no verdict. No mobile/reference/hardware/concurrency/cloud
  proof, live provider, real data, mail, deployment or paid operation.

## Remaining

Explicit disagreement, editable case follow-up deadlines, voice help/replies,
SQLite repeat/generated parity, privacy-approved live AI and complete
release/Neon/R2/TLS/backup/restore/reference checks remain. Goal active;
percentage unaudited.
