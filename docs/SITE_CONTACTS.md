# Site contacts

2026-10-10 update: configured eligible contacts now route newly created cases
and support one-time overdue deputy escalation. Existing cases/contact history
are not rewritten. See CASE_ROUTING.md. Site lifecycle is implemented separately
in SITE_LIFECYCLE.md; full live/cloud/release acceptance remains open. Earlier
checkpoint descriptions below are historical.

2026-10-08 local synthetic checkpoint, S26. Primary and deputy contacts are
persisted site metadata, not automatic help routing, escalation, permissions
or delivery. Neither field is configured in the existing main database.

## Contract

- Active owners and assigned-site administrators can configure contacts.
- Candidates are active owners/supervisors of the current organization/site.
  The private bounded catalog supports literal name/ID search and pagination.
- A deputy requires a distinct primary. Explicit nulls clear the pair. Legacy
  settings requests omitting the pair preserve the current contacts and hashes.
- Revision fences, confirmation, immutable exact replay and audit rollback apply
  to the atomic site settings update. Original replay cannot revive or replace
  a later selection. Newly selected contacts are revalidated inside the write.
- SQLite additive columns/triggers and PostgreSQL migration 042 preserve scope.
  PostgreSQL locks selected staff during validation. A later revoked contact is
  shown as unavailable, never silently changed or treated as active authority.
- Existing native backup/import preserves contact IDs and settings receipts;
  old backups import with null contacts. No grants or case owners are changed.
- Catalog errors/loading block confirmation/save. Explicit refresh and Cancel
  remain available. Selections survive search/paging; full mixed-direction names
  wrap beneath stable accessible native selectors.

## Evidence

`npm test` with loopback access: 485 tests, 482 passed, zero failed, three
external PostgreSQL skips, 105172.9361 ms. SQLite and embedded PostgreSQL cover
scope, invalid filters/input, paging, unavailable targets, rollback, lost commit
acknowledgement, exact replay, legacy omission, HTTP and populated cutover.
Initial full runs exposed stale migration expectations; all three inventories
and the read-only migration count now include migration 042. A restricted
loopback run was stopped and replaced, not counted as a passing test run.

Final `npm run build` passes after selector labeling: index-cclzHtlj.js,
482.62 kB / 131.27 kB gzip; CSS 53.39 / 10.72 kB. All 45 generated public
shell hashes verified against disk. The full suite precedes only the final
selector label and test-fixture administrator credential adjustment; the final
build and native checks include both.

Built credential-mode memory-only browser fixture verifies owner save/reload,
paging/search retention, canceled changes, failed-read explicit refresh/cancel,
administrator save/reload, actual 320px containment and 1440px desktop wrapping.
Proof: `artifacts/site-contacts-mobile.jpg`, `artifacts/site-contacts-desktop.jpg`.
The fixture and its tab are stopped/closed and the viewport override reset.

Main synthetic/email-disabled preview restarted as 55666 on 3020/3021 and
browser-verified at original 30 assigned / 25 responses / 22 matches /
3 clarification outcomes / 5 pending. Existing workers, assignments,
publications and five selected empty evidence tables retain their hashes.
Site settings and settings requests remain empty; integrity is ok, FK errors 0.

## Still Open

Automatic contact-based help routing/escalation, site lifecycle/onboarding,
durable settings tab recovery, full reference/accessibility acceptance, actual
Neon runtime/TLS/concurrency and live privacy-approved provider/delivery gates.
No production or real-worker-data readiness is claimed. Approximately 70%
planned implementation remains the conservative estimate.
