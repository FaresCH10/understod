# PostgreSQL publication and submissions

Status: repositories and worker functions execute in embedded PostgreSQL and through an isolated credential-authenticated HTTP rehearsal. The default browser application still uses SQLite; no automatic cutover occurred. No external database concurrency, cloud audio, live AI or deployment was tested. Production startup remains blocked.

## Publication

`server/postgres/domain.mjs` checks active owner/supervisor scope, the expected draft revision, readiness, future deadline and every explicitly selected active recipient. It freezes the prepared JSON and exact audience in one transaction, supersedes the previous publication and writes audit evidence. A UUID request is replayable after a lost response; changing its revision, deadline or audience is a conflict. Later workers are not added to that audience.

The present publication readiness check accepts only the explicitly selected synthetic integration mode and validated synthetic language content. Live publication is refused until durable generated audio/artifact validation is integrated. Shared HTTP/UI supports explicit active recipients, optional zoned deadlines, confirmation and exact replay. Crew-wide selection, schedules and quotas remain incomplete.

## Receipt and assessment

Migration `005_typed_assessment.sql` adds pending typed attempts, durable assessment jobs and immutable publication requests. Historical imported attempts default to completed; accepted answer identity/content/timestamp and completed outcomes/reasons/evidence cannot be rewritten.

Typed acceptance locks the worker and assignment before inserting its monotonic receipt, pending attempt, assessment job and audit evidence atomically. New answers are refused on unavailable publications or elapsed deadlines. Exact retries retain their original receipt even after withdrawal; changed text with the same submission ID conflicts.

`assessment-worker.mjs` claims with a lease token and bounded three attempts. It reads the exact frozen question/rubric, validates bounded structured results and requires literal answer evidence for each fact before a match. A stale lease cannot complete. Failure leaves a received but unassessed response, not an invented clarification or match. Completed original assessments survive later attempts; reports choose the latest receipt rather than completion time.

## Private voice

`recordings.mjs` stages an upload without a receipt, commits private storage, then locks the assignment and rechecks authorization/publication/deadline before inserting a receipt. Failed acceptance compensates the private object. A lost COMMIT acknowledgment triggers a fresh database check; an already committed receipt preserves its object. If that check itself fails, no deletion is attempted.

An interrupted/failed cleanup remains unreceived and private. The staged-recording sweeper uses reclaimable cleanup leases; it does not issue receipts. Production needs an orphan-object reconciliation policy and bounded operational cleanup/dead-letter controls before this can be called a complete recovery system.

`recording-worker.mjs` verifies the stored WAV, checkpoints a bounded transcript, assesses the exact publication and atomically saves the outcome, optional clarification and audit. Three attempts, expired-lease fencing and active-worker completion checks are enforced. A newer typed receipt remains current even when older audio finishes later. Private playback/status queries recheck active scoped staff or the assigned worker and never expose rubric, answers from coworkers, storage keys or lease tokens.

Initial voice checkpoint: ten focused embedded PostgreSQL tests covered scope/readiness/revision/deadline denial, publication replay/immutability, injected transaction rollback, pending reports, typed retries, exact-version assessment, invalid evidence, stale leases, voice/typed order, private playback, storage compensation, interrupted cleanup, lost receipt acknowledgment and bounded redacted voice failures. The latest suite is recorded below. PGlite does not prove real-server parallel transactions, TLS, provider accuracy, process-kill recovery or a deployed runtime.

## Preparation, read models and HTTP rehearsal

`preparation.mjs` implements scoped draft creation/replay, revision-checked edits, readiness invalidation and durable preparation queue/retry. Migration `006_preparation_leases.sql` adds token fencing and requeues old processing jobs instead of adopting unknown workers. Obsolete draft jobs, expired leases and audit-failure rollback cannot save readiness. Preparation remains explicitly synthetic; generated live text/audio dependencies are not integrated.

`read-models.mjs` returns explicit worker DTOs with translated content and own response status, never private rubrics, reasons, staff notes, coworker answers or storage/lease references. Staff reads are scoped; a guessed other tenant/site/assignment is unavailable. List bounds exist, but complete library/worker-history pagination remains open.

`createPostgresRehearsalServer` in `server/postgres/http.mjs` connects authentication, draft/preparation/publication, worker reads, typed/voice receipt, private playback, reports and people/crew repositories. It accepts only local synthetic credential mode and an explicit `understood_test_` schema. It has no default credentials, seeded login or production bypass. Actual loopback HTTP tests exercise these paths and origin checks. Some remaining application routes are not yet ported; this factory is not the default app runtime or a full frontend cutover.

Shared JSON body handling is byte-bounded, assembles chunks before decoding, requires an object and avoids multibyte-boundary corruption. Safe HTTP error categories are exposed; database/provider errors are redacted.

## Directory and frozen language

`people.mjs` implements scoped page/count/search/language/status, create/edit/disable and crew creation/membership movement. Count and page use one database statement snapshot. Worker locking serializes disable with grants and answer acceptance; disable revokes sessions/grants without deleting original publications/attempts. Audit failure rolls back the whole operation. Crew edit/archive and worker reenable are still missing.

Migration `007_assignment_language.sql` freezes each new assignment's recipient language. Worker playback, question selection and language reports use that snapshot, not later preferences. Legacy synthetic/imported assignments lacked original language evidence and use cutover preference; this is not proof of original language for real historical data. A real legacy rollout requires a separate evidence/migration decision.

## Activity and clarification evidence

`audit.mjs` implements scoped active staff/auditor history/detail and bounded metadata CSV. Shared filter/CSV validation is reused; PostgreSQL applies the site's civil date, including timezone transitions, inside the query. Literal search, page/date/actor/action bounds, formula protection, atomic export audit and normal-role append-only guards are tested. Historical actor names and authorized retention are still missing.

Migration `008_clarification_evidence.sql` preserves original help requests and case identity/reason/attempt references; completed resolution notes/status/owner cannot be overwritten. `clarifications.mjs` implements scoped paging/search/status/owner/overdue, original assessment and recent attempt reads, ownership, explicit audited resolution and worker-safe status. Help is independent of an answer, valid after a deadline while the publication is available, and exactly replayed after receipt without manufacturing attempts. A different body with the same request ID conflicts. Resolution does not rewrite the assessment or remove its report outcome. Translated follow-up conversation/audio, editable case deadlines/escalation and supervisor disagreement records remain missing.

## Import and export jobs

`worker-import.mjs` reuses the maintained UTF-8/quoted CSV parser and worker validation. Preview remains staged; confirmation locks the import, rechecks organization-wide worker ID conflicts and site-active crews, inserts the whole batch and audit in one transaction, and replays without grants or historical assignments. Database uniqueness rejects a concurrent conflicting create without a partial import. Expired denials commit the staged payload purge before returning an error. Private error CSV is scoped and audited. The bounded expiry worker is not scheduled in a runnable PostgreSQL service yet.

`exports.mjs` snapshots latest receipt metadata in one statement at request time; later assessments do not change that snapshot. UUID replay, scoped authenticated history/download, three attempts, thirty-second reclaimable leases, stale-completion fencing, active requester checks, checksum validation, formula protection and twenty-four-hour content expiry are tested. Downloads explicitly decode stored UTF-8 bytes: PGlite's text decoder was observed stripping an initial BOM while PostgreSQL retained those bytes; the checksum is not weakened to accommodate it. Real parallel workers/process-kill recovery remain unverified.

Overview/current metrics and preparation queue reads are scoped and use actual civil dates/frozen publication titles. Briefing detail now adds independent metrics to every returned publication (up to the existing 100-version read bound), under repeatable-read isolation. Existing bounded report reads are reused; batched aggregation and a paged historical-version endpoint remain performance work. An isolated test publishes different audiences, assesses only the old answer, verifies independent pending/matched counts, then checks new clarification counts without changing the older version. Auditor/worker/foreign-scope and private HTTP behavior pass. The default app remains SQLite; this is not a PostgreSQL browser cutover. The JSON boundary rejects invalid UTF-8 instead of silently replacing it.

Current 2026-10-05 full verification: 161 tests, 159 passed, zero fail, two external PostgreSQL skips. Current processing contract/evidence is in `PROCESSING_QUEUE.md`; earlier counts below are historical.

Latest verification: twenty-seven focused PostgreSQL domain/HTTP checks; full suite 101 tests, 100 passed, one external PostgreSQL test skipped. Four additional SQLite clarification checks cover shared browser contracts, immutable help/notes, exact replay, scope and audit rollback; the importer preserves separately saved resolved-help evidence. Strict TypeScript/build and 19/19 deterministic evaluation pass. Default SQLite browser report remains 30/25/22/3/5; clarification filters/detail are also inspected. This is not PostgreSQL browser verification. There is still no real-server concurrency, physical device, live provider, cloud recovery or deployment evidence.
