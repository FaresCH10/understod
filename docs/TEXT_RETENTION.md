# Response Text Retention

Checkpoint: 2026-10-11 05:09 UTC. S36/A16 partial; not a production or legal verdict.

## Implemented Backend

PostgreSQL migration 070 adds a separate site-scoped response-text policy. It is
disabled by default. Active owners/administrators must confirm 7/30/90/365 days or
explicitly disable it with null. Revision checks and immutable exact request
receipts support replay without duplicating changes. Changed payload/scope/actor
conflicts; supervisors/auditors can read, workers cannot access it.

Routes: GET/POST `/api/retention/text` and scoped owner/admin receipt reads at
`/api/retention/text/requests/:requestId`. Common credential, origin, validation,
tenant and role enforcement apply. PostgreSQL privacy settings now expose the
separate policy, confirmation, exact scoped tab recovery and receipt-only reload
reconciliation. An unknown save or failed receipt read blocks another write;
an explicit retry reuses the original request only after a successful absent
receipt check. SQLite preview does not advertise this PostgreSQL-only capability.

The worker's responseTextRetention and recordingTextRetention stages each process
one expired record per cycle, using server receipt time, policy locking and atomic
database transactions. No browser timer or provider call performs cleanup. The
transaction records a scoped immutable purge, redacts answer/reason/evidence text
or transcript, clears pending processing leases, expires related stored report
snapshots/CSV and writes the audit event. Failure rolls everything back so normal
worker repetition is a truthful retry, not a fabricated completed cleanup.

Original outcome/assessment status/receipt IDs/times and provider operation hashes
remain unchanged. A pending answer remains unassessed, not converted to a match.
Worker identity and unrelated/fresh/other-tenant records are preserved. Existing
worker deletion continues to use [Deleted]; retention uses [Expired]. Completed
purges cannot be deleted or content restored by extending/disabling the policy.
Late provider completion and even manual job requeue cannot assess retained markers.

Recording retention also disables subsequent processing/playback by marking the
recording failed and clearing its claim; it does not physically erase its audio.
The separate audio cleanup policy still controls object deletion. Old original
transcription and assessment links remain immutable after clearing the transcript.

Export requests and text redaction use the same publication-scoped transaction lock
so a new export snapshot cannot race a retained pre-redaction copy into storage.
Already downloaded copies, already-returned responses, backups and disconnected
devices cannot be remotely erased by this policy.

## Executed Checks

```powershell
node --test tests/text-retention.test.mjs tests/postgres.test.mjs tests/retention.test.mjs tests/audio-provenance.test.mjs tests/pipeline-rehearsal.test.mjs tests/deletion-redactions.test.mjs tests/deletion-pseudonyms.test.mjs tests/exports.test.mjs tests/postgres-runtime.test.mjs tests/recording-worker.test.mjs
npm run build
```

Final focused run: 42 passed, zero failed/skipped, 10.741 seconds. Disposable
in-memory PGlite/SQLite and loopback HTTP only; no existing database, private cloud,
provider transport or real worker data. Includes exact policy replay, role/scope
denial, future receipt/scope guard, separate fresh/foreign rows, preserved outcomes,
pending claim fences, late result/requeue rejection, immutable linked-transcript
hashes, stored export expiry and audit-failure rollback. A historical-link unit
fixture is explicitly seeded to isolate database guards; it is not live inference
or normal-workflow evidence. Earlier fixture errors were corrected; an earlier
sandbox HTTP EACCES failure was not counted as a pass.

Strict build passes with existing bundle/import warnings. All 62 shell hashes
match. Read-only checks confirm original eight SQLite business fingerprints,
integrity OK and zero foreign-key violations. No policy was applied to that data.

## Remaining Scope

Broader clarification notes/messages/
follow-up text/activity/briefing text retention, generated briefing audio policy,
holds and full relational/object restore/real PostgreSQL concurrency still need
implementation or verification. Minimal outcome/audit/provenance metadata remains
retained; this is not a blanket activity-deletion policy. SQLite preview parity is
not claimed. Live cloud, legal customer decisions and real-data approval remain
separate. Free Gemini remains synthetic-only. Full production goal remains active.

## Settings Verification

2026-10-11: eight text/recovery checks passed, zero failed/skipped (7.365 seconds),
strict build passed with existing warnings, and all 63 built shell hashes match.
The disposable credential-authenticated built app recovered one lost save response
and a one-time failed receipt lookup by reload, then confirmed an explicit disable.
Unknown outcomes kept save/select/confirmation blocked. Desktop and 320px mobile
screenshots were inspected; the text section had no horizontal overflow (947/947
desktop and 267/267 mobile client/scroll widths). Screenshots are saved under
artifacts/text-retention-{desktop,mobile}-2026-10-11.jpg. This is synthetic local
browser evidence, not Reticle, native microphone, real PostgreSQL or cloud proof.
The fixture stopped with two POSTs, two receipts and final revision 2/disabled;
reload used receipt reads, not a repeated save. The original eight SQLite fingerprints match, integrity OK,
foreign-key violations zero. No existing policy was changed.
