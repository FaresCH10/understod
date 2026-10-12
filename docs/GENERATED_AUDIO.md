# Durable generated audio

Checkpoint: 2026-10-06. Migration 023 and the internal PostgreSQL artifact repository
extend the tested generation boundary. Automatic preparation attachment, publication
verification and private worker/staff playback now execute in the isolated PostgreSQL
rehearsal. This is not a completed live/production pipeline. Default SQLite
preparation and its saved evidence are unchanged.

Optional translated-edit checkpoint: accepted scoped review edits invalidate old
draft audio and regenerate automatically checked exact-text speech through this
journal/attachment pipeline. Published snapshots/audio remain unchanged. Full suite
314/311 pass/zero fail/three external skips and strict build pass. Selective artifact
regeneration now has a durable selected-target API/worker path and compatible-byte
reuse; its screen controls/recovery are still open. See `TRANSLATION_EDITS.md` and
`TARGET_REGENERATION.md` for current evidence/limits. Targeted worker guards recheck
the original requester role/session in addition to source/review/glossary/lease.

## Storage and recovery contract

- Bundle manifests and references are validated again before any database or object
  write. Exact text, source/dependency hashes, private asked-fact rubric, provider,
  language, canonical WAV size/duration and byte hash must agree. Canonical hashing
  survives PostgreSQL jsonb object-key reordering. Audio buffers are privately copied.
- A transaction locks the draft before the job, checks the current scoped revision,
  source, review/glossary dependencies, unexpired prepare lease and archive state,
  then records the manifest and every audio identity before writing objects.
- Bundle job/organization/site/briefing/revision and audio bundle/organization/site
  references have composite foreign keys. Manifests, byte/text hashes, audio metadata
  and accepted storage timestamp are immutable; accidental row deletion is denied.
- Each object is read back and independently checked. Exact existing bytes can be
  reused after an interrupted write. Conditional storage creation does not overwrite
  a corrupt existing object. Unknown object acknowledgements are resolved by readback.
- Current dependency and job ownership checks fence final storage acceptance; the
  lease is renewed only for an already current owner. Readback/audit failures leave
  `storing` evidence, not technical readiness. Exact same-lease/same-manifest retry
  can complete without rewriting saved objects or adding a second acceptance audit.
- An uncertain database acceptance is checked before returning. Objects are never
  destructively compensated after an unknown commit. A lost initial reservation
  acknowledgement leaves the journal recoverable before any object write starts.
- One expired unattached bundle is claimed per cleanup cycle. Active matching job
  leases are excluded; cleanup ownership is renewed/fenced per object and completion.
  Failed removals leave a reclaimable lease. Stored/failed staging expires after
  24 hours; `attached` bundles are excluded. Immutable metadata tombstones remain.
- The isolated PostgreSQL rehearsal scheduler awaits this cleanup alongside existing
  recording/import/export/recovery tasks. SQLite backup import locks the new target
  tables and requires them empty; no synthetic cutover discards existing artifacts.

## Evidence and limits

Twenty-one generated-audio tests exercise actual temporary private WAV files, embedded
PostgreSQL migration/repositories, jsonb ordering, immutable metadata, direct forged
scope FK denial, stale claims/dependencies, changed draft during storage, readback
corruption, audit rollback, lost reservation/object/commit acknowledgements, exact
retry and leased cleanup/old-worker fencing. Synthetic tone files validate storage
integrity only; they are not generated spoken-language or alignment evidence.

`attachPreparedBundle` reads back bytes outside row-lock transactions, then rechecks
the scoped job lease, revision, source, review, glossary and archive state. Attachment,
draft readiness, job completion and audit commit together. Audit failure rolls back
all four; lost commit acknowledgement reconciles without rewriting objects or
restoring an obsolete draft. Accepted receipts replay after publication/later edits.

The automatic worker and rehearsal scheduler accept an explicitly injected synthetic
generation adapter/private store/language configuration. Capability/provider failure
stays failed, never falls back to device synthesis. Default rehearsal still uses the
canonical demo preparer; no environment switch enables Gemini or production startup.

Publication preflight verifies frozen journal references and private WAV bytes outside
long database locks. The commit rechecks exact snapshot hash, attached journal,
source/review/glossary/revision, current staff/recipients and every recipient language.
Publication/audio and assignment language stay frozen across edits/preference changes.
Accepted request replay works during storage outages. Generated snapshots are
synthetic-only; the shared SQLite demo validator was not weakened to accept them.

`GET /api/worker/briefings/:assignmentId/speech/body` and `/speech/question` derive
identities from the scoped assignment/frozen language, never a client object ID.
Active worker/grant/session authority is rechecked after verified private-object reads.
Other workers/sites/staff and revoked access are denied. Historical publication audio
remains readable while valid worker site access exists, like assignment text/history;
this does not reopen submission rights. WAV responses are no-store/nosniff/no-referrer.
DTOs expose same-origin assignment URLs, never rubric, journal IDs, paths or hashes.

Worker native media controls provide seek/play/pause with no preload; starting one
player pauses the other. Missing/corrupt playback shows localized alert/reload, no
silent device-speech fallback. Disposable in-memory browser checks: 320px EN/AR/UR,
1440px Urdu geometry, body/question tone duration/playback, mutual exclusion and
failed playback/reload. Actual language quality/full reference/a11y remain open.

Staff briefing/question playback is owner/supervisor-only and bound to exact ready
draft revision or immutable publication ID and EN/AR/UR language. Journal evidence
determines same-origin URLs; draft source/review/glossary dependencies must be current.
Private bytes are independently checked, then staff role/session and selected version
are rechecked after the read. Auditor/worker/foreign scope, query overrides, stale
revision/dependencies, corrupt bytes and revoked access are denied. Historical
published audio stays frozen/readable without reopening mutations. The client rejects
wrong briefing/version/revision/language URLs and uses native controls, mutual exclusion,
truthful failure/reload and no device fallback. Isolated owner/auditor browser checks
cover ready/published/draft selection, 320px Urdu and 1440px English, playback and
storage failure. Test tones are not actual synthesized-language evidence.

Full regression: 307 tests, 304 pass, zero fail, three external PostgreSQL skips
(final session 39343, 65.4 seconds; earlier 4963 also passed). Strict TS/Vite build
passes (main 498.25 kB / 133.91 kB gzip). Ten saved hashes match, SQLite integrity OK,
zero FK violations, existing dev 40872/web/API live. Fixture processes/tabs stopped
and closed. No default-data mutation or live provider call.

The caller is an internal service/job owner, not a public upload API. The repository
does not independently establish provider accuracy, account eligibility, requester
access epochs, tenant suspension or privacy approval. Real-data Gemini remains
forbidden. No live call, cloud bucket/database, customer message or deployment occurred.

Next: revision-fenced artifact regeneration/edits. Add speech consistency, enabled
language/actor/tenant fences, quota/cost reservations and process-termination recovery.
Restarting generation after lost in-memory bytes can require regeneration; provider
charge uncertainty is not solved. Actual parallel pg/TLS/Neon/R2, late external-write
reconciliation, metadata/content retention, object+database backup/restore and full
production runtime gates remain unverified. Do not infer readiness from `stored`.
