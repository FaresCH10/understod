# Staff access checkpoint

Verified 2026-10-05. This is a partial S30/A14 implementation, not production-ready staff onboarding.

## Authority

- Every repository operation rechecks an active staff record with matching principal, organization, site and current role.
- Owners can list staff, change roles and revoke/restore access at their assigned site. A change cannot demote or revoke the last active owner at that site; an owner in another site does not satisfy this guard.
- Administrators can list staff and manage supervisors/auditors at their assigned site. They cannot modify owners/administrators or grant either role. They can edit the assigned site's settings but cannot change organization settings or read worker responses, recordings, briefings, reports, billing or internal processing jobs.
- Auditors can read the staff directory and existing briefing/result/activity/billing metadata without mutation. Private worker recording playback is denied in both repositories, including when storage is unavailable. Supervisors cannot manage the staff directory.
- Role changes, revocation and restoration end all existing target staff sessions. Restoration never reactivates old sessions. Credentials and earlier content/evidence remain stored.

## Storage and replay

Both SQLite and PostgreSQL provide bounded literal search, role/status filters, stable paging, complete scoped counts and private row DTOs. Initial access revision is 1; actual role/access changes increment it automatically. Staff identity and site/organization bindings are immutable.

Each confirmed mutation has a validated UUID, expected revision, action and optional role. The access change, session revocation, immutable receipt and audit event commit atomically. Exact original requests replay their accepted result without reapplying it, even after a later access change. Different payloads or actors cannot reuse the request ID. Receipt reads are limited to their creator and current authorized scope.

SQLite uses `BEGIN IMMEDIATE`. PostgreSQL acquires a site advisory transaction lock before authority/target row locks, so reciprocal owner changes do not reverse the lock order. Last-owner protection is a service transaction invariant, not a guarantee against privileged direct database maintenance. The real-server concurrency drill is written but remains skipped without an external test database.

PostgreSQL migration 019 widens the role constraint and adds scoped revision/receipt tables and triggers. The synthetic SQLite importer preserves these ledgers when present; legacy backups without them still import.

## Browser recovery

Before sending, the browser validates and persists the original request in principal/organization/site-scoped tab storage and verifies its readback. It refuses to overwrite an unresolved request. Invalid success responses cannot erase pending evidence. After an uncertain response, navigation/reload checks the receipt with GET; an accepted exact receipt clears pending state without another POST. Only an explicit user retry can resend an absent receipt, using the original ID/body.

The detail panel focuses its heading, confirmation focuses its first input, Cancel returns to the detail heading, and Close returns to the selected row. Confirmation resets when role changes or a known denial occurs.

## Verification

- `node --test tests/*.test.mjs`: 203 tests, 201 pass, zero fail, two external PostgreSQL skips. Fifty focused staff/recovery/domain checks pass. These include current-role/site/actor denials, administrator content boundaries, last-owner protection, audit rollback, old-session revocation, lost PostgreSQL COMMIT acknowledgements, immutable replay, paging and migration failure rollback.
- Strict TypeScript/Vite build passes after the final keyboard focus changes.
- Disposable in-memory browser fixture: 13 staff, real second-page navigation, role change followed by lost acknowledgement and failed receipt GET, reload GET-only recovery, revoke/restore and rejected last-owner revoke. Three accepted receipts remain; the original published snapshot remains unchanged.
- Final browser checks cover active/revoked/search filters, Cancel/Close focus return and 320/390/768/1440 document overflow. Inspected screenshots: `evidence/staff-access-320-2026-10-05.jpg`, `evidence/staff-access-1440-2026-10-05.jpg`, plus the earlier last-owner denial. Administrator/auditor credential boundaries are HTTP tests, not browser-persona journeys. No Reticle verdict, native-language review or complete accessibility/reference audit is claimed.
- Saved local schema upgrade created `data/understood.sqlite.staff-roles-740a533e-eb2a-49f2-a7df-6580e58be486.sqlite` before rebuilding the legacy six-column staff table. Native backup, dependent schema preservation, rollback and foreign-key restoration are automated-tested. Saved database integrity is `ok`; foreign-key check is empty. All nine pre/post hashes for publications, assignments, attempts, submission receipts, clarifications, crews, memberships, audit and staff match. Both new saved access ledgers are empty; no saved role/access mutation occurred.

## Remaining gates

Invitation creation, delivery, acceptance, expiry, resend/cancellation and password recovery are not implemented. Neither are multi-site account/grant management, wider site lifecycle, conflicted/closed-tab/cross-device recovery, protected final credential-capable owner recovery, production database grants or independent security review. An active demo owner is still counted by last-owner protection; this does not prove that the last owner can recover credentials. No real account changes, messages, provider calls or deployment occurred. Gemini free tier stays synthetic-only.
