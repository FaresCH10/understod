# Current organization and site settings

2026-10-09 update: credential owners can create additional sites with their current
account, immutable receipts and tab-durable GET-only recovery. Current session is
unchanged; use the existing site switcher. See `SITE_CREATION.md`. Credential
owners can also pause/resume worker server admission with revisioned receipts;
resume requires new links. See `SITE_WORKER_ACCESS.md`. Site archive/restore now
checks dependencies and freezes operational work while preserving staff reads
and privacy controls; restore keeps worker access paused. See `SITE_LIFECYCLE.md`.
Historical missing-feature lists below are not current.

2026-10-08 update: confirmed owner/administrator site saves now persist English-required/optional Arabic/Urdu generation defaults. New runs capture them; exact regeneration and historical artifacts retain their languages. Legacy omission/receipts and backup/import are preserved. Readiness exposes selection separately from unverified provider evidence. See `GENERATION_LANGUAGES.md` for current verification and limitations. Earlier test counts and remaining-feature lists below are historical.

Local synthetic S26 foundation, not complete site administration or production readiness.

## Contract

GET `/api/settings` returns the active scoped staff member's organization/current site only, revisions and `canWrite`. Owners edit; supervisors/auditors read. Workers, inactive staff and forged scopes are denied.

POST `/api/settings/organization` accepts `requestId`, current `revision`, `name`, optional `supportEmail` (blank clears), and `confirmed: true`. POST `/api/settings/site` accepts `requestId`, current `revision`, `name`, valid IANA `timezone` and confirmation. Unknown fields and caller-supplied scopes are rejected. Organization metadata is shared across its sites; contact saves send no email.

Both repositories enforce optimistic revisions, unchanged-request rejection, immutable exact replay and atomic audit. Audit failures roll back changes. A lost COMMIT acknowledgement replays without incrementing revision again; an old request cannot overwrite later edits. SQLite sidecars preserve seed/table shapes; PostgreSQL migration 015/importer preserve settings evidence. No credential or access expansion occurs.

Issued invoice labels stay frozen. Existing publication, audience, answer, UTC deadline and received timestamps are not rewritten. Timezone changes affect subsequent civil-date views/report filtering, not historical instants.

## UI and checks

Settings navigation exposes names/contact/timezone and authorized invoices. One form edits at a time; edits reset confirmation. Unknown save results lock editing/cancellation and offer unchanged original-ID retry. Accepted changes refresh the header. Ordinary cancellation discards unsaved fields.

`tests/settings.test.mjs` covers SQLite/embedded PostgreSQL, private HTTP/role boundaries, invalid inputs/forged fields, stale revisions, replay after later edits, audit rollback, immutable receipts, frozen invoices and lost COMMIT acknowledgement. Backup import retains organization settings/replay. Full suite: 174 tests, 172 pass, zero failures, two external PostgreSQL skips. Strict frontend build passes.

Memory-only browser fixture: organization save deliberately lost its acknowledgement, explicit retry recovered revision 1; site save reached revision 1 and refreshed header. Prior invoice retained original issuer/site labels. Mobile cancel/reload retained saved values. At 320px document width was 305/305, fields 233px, action labels fit. Desktop/mobile screenshots `evidence/workspace-settings-1440-2026-10-05.jpg` and `evidence/workspace-settings-320-2026-10-05.jpg` inspected. Fixture stopped; saved evidence hashes match and settings/billing ledgers remain empty.

## Remaining

Site lifecycle/switching, contacts/deputies/languages, staff administration and full reference/native-language/accessibility checks remain. Settings retry IDs live only in the open form: navigation/reload can discard unsaved/pending state. Durable revisions/receipts prevent stale overwrite but broader recovery UI is required. Real PostgreSQL wire/contention/TLS, cloud deployment, approved real-data processing and release checks are unverified. Reticle is unconnected; no verdict claimed.
