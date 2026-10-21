# Response Processing Retry

Checkpoint: 2026-10-14 15:35 UTC. S17 customer recovery is locally verified, about 85%.
The full production goal remains active. No human approval queue is introduced.

## Persisted Contract

- Failed/blocked accepted voice jobs and pending durable typed checks use confirmed
  exact job/publication/assignment/generation intent. Fresh active scoped owner or
  supervisor authority is required. SQLite completed inline checks are not requeued.
- `processing_retries` is immutable, actor/scoped and unique per kind/job/generation.
  PostgreSQL migration086 has frozen JSON/foreign-scope guards. SQLite equivalent
  references accepted recordings and frozen assignment publication. Permissions and
  optional SQLite import inventory include this table; original data was not migrated.
- Generation counts customer receipts plus actual operator assessment retry receipts,
  never a reset attempt counter. Worker/job locks serialize new admission. A stale
  generation cannot queue after a later customer or operator retry. Original exact
  replay reads the original receipt before mutable state checks and does no new work.
- Queuing resets only the failed job's attempts/lease/error/due state. It never edits
  answer, publication, assignment, transcript or completed assessment. Pending-only
  assessment completion and exact original voice/submission checks remain in workers.
- Disabled/deleting workers, expired published content, audio/text purge records and
  elapsed enabled audio/text policies close fresh retries. Historical acceptance
  remains readable by its original currently authorized actor. No expired body is
  restored, completed outcome reevaluated, operator access delegated, provider
  activated or dispatch/quotas/pause gates disabled.
- JSON context/write/receipt endpoints under `/api/processing/:typedId/retries`
  require exact captured cookie context. Invalid scope, body, encoding and unexpected
  query rejected. Private errors hidden. Native audio URLs are unchanged.

## Client Recovery

- `ProcessingRetry` reuses current-authority artifact transport and mutation helpers.
  Strict context/ACK/receipt validation binds exact job, publication, assignment,
  generation and acceptance timestamp. Tab storage keeps only this intent, not audio,
  answer, title, rubric, names, tokens, hashes or keys. Scope and readback are verified.
- Reload/check performs receipt GET only. Missing receipt does not mean successful
  processing and exposes explicit original-request retry, never automatic POST.
  Only matching ACK plus exact receipt and current unheld completion clears intent.
  Changed/unmounted/held views or malformed/absent evidence retain recovery.
- Same-job/session verified metadata stays mounted during refresh so recovery state
  and acceptance message survive. Retry controls are disabled while loading; cache
  cleared on error/changed authority. Polling pauses while recovery/history is active.
- Accepted receipt means queued only, not a successful check or understanding. Auditor
  gets job metadata but no retry controls or private owner/supervisor retry context.

## Verification

- Focused 26 tests pass/zero fail/zero skip, 17596.4944 ms, 80318 terminal exit 0:
  retry, privacy, client and populated SQLite backup/import suites. Earlier17-pass
  migration/mixed queue/preparation run. Initial fixture errors were a PostgreSQL
  rehearsal schema, invalid extra operator field, SQLite repeated-placeholder setup
  and missing synthetic reasons JSON, corrected without weakening assertions.
- Both voice backends and native-shaped typed jobs preserve accepted evidence;
  old replay leaves later failure and completed outcome untouched. Role/worker/
  changed-cookie/foreign scope, immutable mutation, audit rollback, audio expiry before
  and after real purge, text expiry/redaction, deletion, operator generation and
  enforced dispatch pause tested. Real SQLite private backup/import retains the
  populated receipt and replays it without another queued action.
- Full suite: 990 tests/986 pass/zero fail/four native skips, 297041.3484 ms,
  44465 terminal exit 0, `artifacts/response-retry-suite-2026-10-14.log`.
  Final frontend build 2065 modules/660.49 KB entry passes; existing warnings remain.
  Final 55 shell hashes match and `git diff --check` passes.
- Built in-memory PostgreSQL browser fixture on separate port 3236: voice/typed lost
  acknowledgement followed by receipt outage and reload, exact read-only recovery,
  later failed status unchanged, precommit outage/missing receipt and explicit same
  original request accepted. Original typed answer and pending outcome remain visible.
  Keyboard Enter/Tab, 320px controls/document 305px and settled auditor view verified.
  Fixed accepted-message loss during refresh. Screenshots:`artifacts/response-retry-*`.
- Final 63254 fixture terminal: four POSTs, two lost ACKs, one precommit outage,
  two failed receipt reads, one missing receipt, three receipts (voice 0, typed 0/1),
  seven inventories unchanged, zero external calls. Earlier 60016 terminal:
  one POST/one voice receipt.
  Temporary tab closed and viewport reset. No test microphone permission needed.
- Read-only original eight fingerprints/counts equal 11 October baseline, integrity OK/
  FK 0. Key absent from 1383 nonignored source/evidence files and public assets;
  example blank. Original 3020/3021 previews not restarted/migrated. No real worker data,
  live API dispatch, diagnostic upload, paid service, cloud account or deployment.

## Open Gates

- Native PostgreSQL role/TLS/concurrency/process termination and wider held/unmounted/
  account transition/device acceptance. Embedded PostgreSQL is not native proof.
- Run-level provider provenance in voice/check detail and follow-up queue coverage.
- All44 reference comparisons, full localization/a11y/real-phone/PWA/codec tests,
  complete live voice pipeline/Urdu speech and independent quality review.
- Approved real-data AI path, authorized Neon Free/private storage/mail/monitoring
  rollout, clean CI/fresh setup and final release/pilot audit. Reticle has no verdict.

After an actual 30.0322-second pause, resumed the provider-provenance audit. Existing
operation/request journals and immutable audio completion links distinguish quota
reservation, HTTP acceptance and validated completion. Historical nullable links
must stay honestly unattributed. No new provenance view is claimed in this checkpoint.
