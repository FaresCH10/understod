# Staff Clarification Creation

Local implementation on schema 94. This does not authorize a hosted migration,
real-worker AI, cloud tests or deployment. Native schema 91 evidence is historical
and does not verify this migration.

## Workflow

`#clarifications/new` is a real owner/supervisor form, not a fixture action. It
selects a current active worker's published assignment in the current site. The
assignment search is scoped and paged in SQL, with ten rows per page and a
5,000-result safety limit. The title, version and assignment language are frozen
publication/assignment metadata, not the worker's current language preference.

Staff supply a private reason and explicitly choose either an independent
follow-up or the latest completed response. Pending assessments cannot be linked.
An already-linked answer opens its existing case instead of making a duplicate.
A newer answer at commit time rejects the old linked selection. Independent
follow-up remains possible without manufacturing an answer or worker request.

Creation adds an open case, normal routing/deadline, immutable creation receipt
and audit event atomically. It does not create a help request, conversation
message, submission receipt, answer, assessment, repeat, provider job or email.
Original responses and outcomes remain unchanged. Case details identify the
actual staff origin; an independent staff case is not labelled worker help.

## Recovery

- POST `/api/clarification-creations` accepts an exact UUID request ID,
  assignment ID, publication ID/version, nullable original attempt ID and reason.
- GET `/api/clarification-creations/subjects` accepts only search, page and fixed
  pageSize=10. GET `/subjects/:assignmentId` returns the latest response metadata.
- GET `/api/clarification-creations/:requestId` recovers the original receipt for
  the same organization, site, actor and role. Current captured session context
  is required on reads and writes. Other actors cannot recover its receipt.
- Exact retries return the original receipt before mutable target eligibility
  checks. Changed intent conflicts; there is no automatic POST retry.
- Browser recovery stores only `{id,hash,selectionHash}` under the captured
  context. No reason, answer text or plaintext assignment/publication ID is
  stored there. After reload the user can check the receipt without reentering
  the reason. Resending requires the exact original selection and reason.
- Receipt checks validate exact shapes, context, actor/role, UUID identity, full
  intent hash and independently recomputed selection hash. A verified old receipt
  does not clear a different or newer draft.
- Only a known rejection of a newly retained first attempt may release its local
  recovery. Uncertain outcomes and older pending requests remain retained.
- Navigation/unload guards protect unsent drafts. Cancel-first local clearing
  does not cancel server work or delete pending receipt metadata.

## Privacy And Permissions

Private text is stored once in the existing case reason, prefixed
`Staff follow-up:`. Existing case deletion/retention redacts that field; the new
journal contains metadata and hashes only. Worker case projections omit the
private reason and do not pretend that the worker requested help. Metadata
retention is not a claim of complete personal-data erasure.

The worker and operator SQL profiles cannot read or write the new journal.
The application role retains its normal guarded DML authority. Schema 94 adds
one table: 139 catalog tables total; application120 writable/12 read-only/7 hidden,
worker94 write-capable/34 read-only/11 hidden, operator19 writable/19 read-only/
101 hidden. Worker write-capable includes the existing nine column-restricted
tables; it does not mean unrestricted DML on those tables.

Both engines enforce immutable scoped journal rows. SQLite backup import knows
the optional table and preserves populated receipts and truthful provenance
after staff-role changes. Existing historic backups without this table remain
supported. No original local database or cloud schema is migrated by these tests.

## Acceptance

Focused synthetic tests cover both engines, pagination, pending assessment,
exact replay, duplicate/stale answer linkage, tenant/actor/role denial, immutable
metadata, atomic audit rollback, hash-only browser recovery, strict DTOs,
captured-context HTTP and populated SQLite-to-PGlite backup import.

Built browser and full clean verification evidence is recorded separately at
the checkpoint: clean8be48ec7, observed parent exit0,1,284 tests/1,280 passed/
zero failed/four native-only skips, offline build/evaluations and886 unchanged
source files. Final built CUA verifies two actual cases, exact linked matched
assessment, independent case recovery after malformed reply/local clear/full
reload, existing-case navigation, enabled-editor focus, context lock and four
widths. Original attempt hash unchanged; no extra messages/help/answers and zero
external calls. Initial migration-list failures and focused/full rechecks are
preserved. See `artifacts/production-staff-clarification-creation-2026-10-20.json`.
English UI only: full S14/S15 reference comparison, EN/AR/UR
localization, independent language review, assistive technology, real phones,
native PostgreSQL concurrency/permissions and hosted acceptance remain open.
