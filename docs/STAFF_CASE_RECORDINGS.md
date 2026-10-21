# Private Staff Case Recordings

Latest S15 delta: new generated staff drafts500, ordinary/captured commands1000,
preserved over-limit text and localized errors. Existing adjacent recording action,
form ownership, history focus and draft interlocks remain. See
[current scoped evidence](CONVERSATION_COMPOSER_LIMITS.md). Earlier notes below
describe the prior1000-only UI and remain historical, not the current policy.

## Current Action And Focus Follow-up

21 October 2026: inspected selected S15 JPEG#15 again. Generate/send and private
record now share the action row; the explicit uniquely owned submit form leaves
recorder dialogs outside the form. Existing draft/write interlocks remain.
The actual1000-character limit has a linked counter. Paging/manual refresh
focuses a persistent history heading before clearing controls/private rows;
a stable status announces loading/current page. Passive refresh does not force
focus. Three initial source regressions and the inherited16px action margin
failed before repair; focused18 checks pass afterward.

Final built checks retain13 real locale-width measurements (EN five including
1585x992; AR/UR four), adjacent desktop actions and safe mobile wrapping. Held,
failed and recovered history reads keep focus and hide unverified rows; EN/AR/UR
10/2-row keyboard paging, next Tab, modal return and cross-language draft/counter
continuity pass. Actual external-submit Enter queues one follow-up; a separate
private save preserves that job, original attempt/receipt, zero chat messages
and open status. The shared worker control saves one reply, no answer/audio.
Both final fixtures explicitly stop and their parents exit0. Only fixed tones,
memory private storage and a queue-only synthetic adapter are used; no generation
worker, external provider, real mic/data, cloud, mail, billing or deployment.

Preliminary viewport commands targeted the control tab, so app widths stayed1280;
those measurements and the incorrectly named1585 image are retained but rejected.
Clean5285225b exits1 for source drift despite1,328 passing tests/zero failures/
four skips. Corrected clean4b338be1 parent9027 exits0:1,333 tests/1,329 pass/
zero fail/four native skips, offline build/evaluations,913 stable source files.
Overall81% unchanged, staff recording90%, case detail/recovery92%. Current proof:
artifacts/staff-actions-aligned-browser-final-2026-10-21.json and
staff-actions-aligned-en-1585-2026-10-21.png / staff-actions-aligned-ur-390-2026-10-21.png.
This is qualitative action-layout acceptance, not full matched-reference,
independent language/AT/phone/native95/hosted/real-worker privacy acceptance.

## Scope

Local backend and user-facing S15 in-person clarification audio, with explicit
capture/preview/save, staff-purpose notice, independently declared language and
metadata-only browser receipt recovery. This is not full S15, physical-device
acceptance or a production-readiness verdict. Current native/hosted, complete
reference, independent language and assistive-technology acceptance remain.
Gemini Free remains synthetic-only. This work makes no provider or mail calls.

The audio is authored by an authorized owner or supervisor, not by the worker.
It is not a worker answer, case chat message, assessment or automatic resolution.
The existing worker response, outcome and submission receipt remain unchanged.

## Local Contract

Both SQLite and PostgreSQL expose authenticated routes under
`/api/clarifications/:caseId/in-person-recordings`:

- `GET ?page=1&pageSize=10`: scoped metadata, exact pagination and current
  recording capability. No bytes, digests, storage keys or signed public URLs.
- `GET /:requestId`: exact original-author and original-role receipt.
- `POST /:requestId`: explicit `audio/wav`, declared `x-recording-language`
  (`en`, `ar`, `ur`), lowercase UUIDv4, 16 kHz mono PCM16, nonempty 0.25-90s.
- `GET /:requestId/audio`: private authenticated native-media stream with
  no-store and single-range support, integrity and authorization rechecked after
  reading storage. Native media does not require a custom page-context header.

JSON reads and uploads require the captured session-context header. Owners and
supervisors can review their site's audio. Workers, auditors, administrators,
operators and foreign sites cannot use these private routes. Exact receipt
recovery is additionally bound to the original staff identity and role.

Audio language is declared, not inferred, and independent of the worker's
assignment language. No translation or semantic quality claim is made.

## Persistence And Failure

Migration095 extends `case_voice` with immutable staff-purpose and author-role
metadata. Its `worker_id` remains the subject for privacy cleanup, not the author.
Existing help/reply records stay explicitly worker-authored. Worker voice reads
and conversation projection exclude the new staff records.

Uploads stage under a 120-second lease, use a generated private object identity,
verify exact bytes after conditional save, then accept the receipt and audit in
one transaction. A lost storage acknowledgement can reconcile by exact readback.
An uncertain database outcome is checked before retirement; no automatic repeat
upload or new request identity is created. Role revocation fences acceptance.
New uploads cannot be accepted on closed or unavailable cases; an exact older
receipt remains recoverable. Received, storing and failed are distinct states.

Only accepted staff-recording audit events appear in the case timeline. They use
the actual audit timestamp, do not include private audio/text and do not
reconstruct identities after audit expiry.

## Privacy And Operations

- Existing private-storage and PostgreSQL inventory/retirement paths cover this
  journal purpose. SQLite now runs the audio purge in its background loop.
- Worker deletion cannot complete until all associated voice journals are cleaned
  and physical object absence is checked. Interrupted removals retry; cleaned
  journals recheck late objects. A delete acknowledgement alone is insufficient.
- Current application retention and deletion do not prove erasure from backups,
  provider history, disconnected devices or Neon soft-deletion history.
- Local backup/restore includes retained staff WAVs with exact hashes. Cleanup
  tombstones and received author metadata survive restore. Historical synthetic
  SQLite-to-PostgreSQL cutover validates scope, purpose and original authorship;
  it never fabricates current staff authorization or resumes an uncertain upload.
- That cutover is an empty-target, locked maintenance transaction. Only its
  existing voice staging trigger is temporarily disabled for validated historical
  rows, restored before commit and restored by rollback on failure. Runtime
  roles cannot ALTER the trigger. No target outside a synthetic isolated schema
  is admitted by the import command.
- Privacy ledger v8 binds original audio author type, identity and role. It does
  not export audio or staff names. Old v7 ledgers are not silently upgraded;
  retain them and re-export matching-schema evidence from the stopped source.
- The PostgreSQL cleanup worker has SELECT and only lifecycle/cleanup UPDATE
  columns on `case_voice`; no INSERT, DELETE, authorship, acceptance identity or
  receipt clock writes. Exact guard-body and ACL drift checks fail closed.

## Local Interface And Evidence

The actual application uses the shared browser MediaRecorder/WAV engine, with
staff-purpose text and private history. Site notices load through the captured
staff session and strict DTO validation before capture is enabled. Recording
language freezes while an unsent preview or pending request exists; changing
EN/AR/UR interface language does not translate or replace the recording.

Only request identity, declared language, digest and byte count are retained in
scope/role-bound session storage. Preview bytes stay in memory. Clearing a local
preview is Cancel-first and does not cancel an uncertain upload, delete server
audio or remove its recoverable receipt. Pending metadata prevents a new capture.
Save is explicit; exact original receipts are checked manually, not auto-replayed.
Other case drafts/actions and navigation are interlocked with unsaved capture.

Fresh clean f4dfba7f-0f7e-44a1-83c7-b4428e49b897, parent3879 observed exit0,
finished2026-10-21T05:53:54.547Z:1,316 tests/1,312 passed/zero failed/four
native-only skips, offline install/build and mocked/scripted evaluations pass.
All909 selected source files remained unchanged. UI assets are checked against
that clean build by the checkpoint report. See BUILD_STATUS.md.

Final built-browser evidence: twelve EN/AR/UR x320/390/768/1440 containment
checks; identical preview across interface languages; explicit private save;
one-click restart; Cancel/clear/save focus; unknown acknowledgement, actual page
reload and GET-only receipt recovery; authenticated native playback; integrity-
rejected save; unavailable/malformed history without private diagnostics;
context lock and manual verified return; real10/5-row private history pages.
Original attempt, submission receipt, case messages and open status are unchanged.
The preliminary candidate separately exercised denied, empty and interrupted
synthetic capture, a held save/storing receipt and competing resolution notes.

All browser audio is a clearly labelled fixed synthetic tone. Native microphone
access is denied in the fixture; the production recorder is not replaced by the
simulator. These checks do not validate spoken language, real capture hardware,
codecs or phones. Fixture data/storage are isolated in memory; no cloud object,
Gemini, mail or original application database is used.

## Remaining Work

Paging focus and side-by-side follow-up controls are implemented in the current
checkpoint above. Complete wider EN/AR/UR states, matched-reference fixtures,
independent language and AT review.
Actual microphone/phone quality, native migration095 permission/backup tests,
hosted services and privacy-approved real-worker AI remain separate release gates.

Focused local checks cover both engines, real loopback HTTP/private ranges,
received-versus-failed receipts, exact retries, revocation, unchanged worker
evidence, cleanup/late objects, restore, historical import and actual separate
API/worker roles. The current clean-run result is recorded in BUILD_STATUS.md;
none of these tests are evidence of a live cloud deployment or microphone use.
