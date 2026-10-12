# Generated Audio Retention

Checkpoint: 2026-10-11 05:50 UTC. S36/A16 remain partial, not production-ready.

Migration 072 adds a separate default-disabled PostgreSQL policy, immutable exact
actor/site request receipts, retirement records and physical-removal records.
GET/POST `/api/retention/generated` and receipt GET
`/api/retention/generated/requests/:id` require credentials. Reads allow scoped
staff; writes/receipts require owner or administrator. The confirmed policy accepts
7, 30, 90, 365 days or disabled, independently of raw audio, response text and cases.

Generated body/question audio expires from its verified storage timestamp,
including current published or draft versions. The UI explicitly confirms this
impact. The retirement transaction locks the policy/bundle, journals the exact
revision and audits before changing availability. Audit failure rolls everything
back. Published snapshots, text, assignments, manifest hashes and provider links
are never edited. Expired bundles cannot be played, published or revived; worker
detail omits dead speech URLs. Old publication request replay remains readable.

Physical cleanup is separately leased and retryable, even after policy disable.
Every object must be removed AND verified absent by the storage adapter before
the current lease can mark the bundle cleaned and insert an immutable completion
record plus audit. A successful delete acknowledgement alone is not completion.
Missing absence capability fails closed. Audit failure after object deletion
retains an incomplete journal for idempotent retry. Orphan cleanup now uses the
same absence/completion checks; older completion records are not fabricated.

## Evidence

49 focused generated audio/runtime/migration/provenance/pipeline checks passed,
zero failed/skipped, 55.856 seconds. Later cutover/runtime/case/text/recovery run:
24 passed, zero failed/skipped, 13.972 seconds. The initial cutover fixture lacked
its current recording schema and failed before reaching the new guard; that run
was not counted as passing. Historical storage dates in an authored fixture
isolate expiry; they are not evidence of real elapsed time or live inference.

Strict optimized build/typecheck pass; 63 shell hashes match. Entry remains
558.53 kB/150.29 kB gzip with existing size/offline dynamic-import warnings.
Original eight SQLite business fingerprints match, integrity OK, FKs zero.
No existing policy/database migration or worker loop was started.

The first disposable built-browser fixture exercised enable 30 days, lost save
acknowledgement, failed receipt lookup, blocked controls, GET-only reload recovery
and explicit disable. Final counters: two POSTs/two receipts, revision 2/disabled,
one lost acknowledgement, one failed receipt read, zero external requests.

The 320px screenshot exposed long-command overflow (267/309 section widths);
scoped wrapping fixed it. Rebuilt normal-save/disable verification ended with
two POSTs/two receipts, revision 2/disabled and zero external requests. Corrected
mobile section widths are 267/267; page 305 at viewport 320. Desktop widths are
947/947. Screenshots were inspected, both fixtures stopped, temporary owners
signed out, QA tabs closed and viewport override reset. Reticle has no connected
session; no verdict is claimed. See the preserved JSON artifact and screenshots.

## Remaining Scope

Broader briefing/activity metadata retention, holds and full DB/private-object
backup/restore/rollback remain open. Actual PostgreSQL concurrency, cloud object
semantics, hardware, full reference/accessibility and release gates remain
unverified. Backup and disconnected-device copies are not erased by this policy.
Free Gemini is synthetic-only. The full production goal remains active.
