# Briefing archive

Locally verified on 2026-10-05, synthetic data only. S08/S13 remain partial overall.

## Contract

- Active scoped owner/supervisor only. POST `/api/briefings/:id/archive` requires a UUID request ID, explicit confirmation, expected draft revision, expected next publication version, and a 3-500-character reason. Unknown fields are rejected.
- One transaction closes currently published versions as archived, cancels queued/in-flight preparation, records an immutable scoped receipt and appends an audit event. Source, prepared artifacts, published snapshots, audiences, accepted receipts, outcomes and existing clarifications are retained.
- Edit, preparation and new publication reject archived briefings. New worker answer/help acceptance rejects closed publications; previously accepted exact retries and worker/staff history remain readable. Already received assessments can finish against their frozen version.
- Exact archive retry returns the original receipt without another mutation/audit. Changed reason, revision, publication generation or target conflicts. A later publication cannot be silently archived by a stale dialog. A separate unpublished source-only draft copy remains available; there is no restore action.
- Library default is active briefings. Independent active/archived/all filters combine with title, draft state, latest publication, sort and bounded pagination. Detail exposes the archive reason/time and removes mutation affordances.
- SQLite scoped/immutable triggers and PostgreSQL migration `012_briefing_archives.sql` protect receipts. Synthetic cutover imports and replays archive receipts without restoring archived work.

## Verification

`node --test --test-concurrency=1`: 156 tests, 154 pass, zero fail, two external PostgreSQL skips. Strict TypeScript/Vite build passes. Tests include invalid/forged scope, inactive authority, stale source/publication generation, audit/receipt rollback, lost COMMIT acknowledgment, replay conflict, preparation cancellation/stale completion, preserved artifacts, pending accepted assessment, publication/answer/help retry, archived-source copy, scoped HTTP filters and cutover replay.

Saved shelf confirmation was cancelled only. At 320/1440 CSS pixels, dialog widths are 279/558 and document widths 305/1425 without horizontal overflow. Mandatory confirmation, reason-change reset, reopen reset, forward/reverse focus wrapping, Escape/Cancel focus return and unsaved-editor disable were observed. A separate memory-only fixture submitted archive, reloaded the retained result, showed active-library exclusion/archived inclusion and read retained responses. Existing Arabic worker profile showed a closed task with original answer/case and no new answer/help form. Successful archive focuses the heading after its initiating button disappears.

Evidence: `evidence/briefing-archive-dialog-320-2026-10-05.jpg`, `briefing-archive-dialog-1440-2026-10-05.jpg`, `briefing-archive-result-1440-2026-10-05.jpg`, `briefing-archive-library-320-2026-10-05.jpg`, `briefing-archive-worker-320-2026-10-05.jpg`.

Disposable fixture stopped; original supervisor and viewport restored. Eight saved hashes, including the 16-row audit baseline after expected export expiry, match before/after this archive checkpoint. Saved archive ledger remains empty; saved v3 is still published, 30/25/22/3/5. No production/archive business write was made in the saved fixture. No external PostgreSQL concurrency/TLS, live AI, native-language correctness, full accessibility or Reticle verdict is claimed.
