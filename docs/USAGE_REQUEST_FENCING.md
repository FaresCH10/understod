# Usage Request Fencing

Estimated task progress: **85%**. Overall production estimate remains **60%**.
This is local request/receipt and customer allowance verification, not release
readiness, billing authority or proof of provider connection.

## Task Checklist

- [x] 100%: captured bounded plan/allowance/inbox/request/receipt transport and
  server context enforcement for staff, with native byte boundaries unchanged.
- [x] 100%: exact confirmed original intent and immutable personal recorded-at
  timestamp; acknowledgement plus receipt required before saved-work cleanup.
- [x] 100%: existing expiring session-scoped records remain readable; corrupted,
  replaced or held-authority records cannot be cleared as successful work.
- [x] 100%: earlier uncertainty survives later rejection; reload checks read-only
  status, then an explicitly confirmed unchanged retry. No automatic repeat.
- [x] 100%: strict metadata DTOs, bounded role-scoped inbox and truthful unknown
  spend/read-only UTC organization allowance. Global/private operation details
  are not projected to customers or treated as entitlements.
- [x] 100%: synthetic local regression/build and built-browser interruption,
  pagination and owner/supervisor/administrator/auditor/foreign-site evidence.
- [ ] 40%: wider expiry/revocation/cross-tab, keyboard and assistive acceptance.
- [ ] 30%: actual devices and native PostgreSQL role/TLS/concurrency acceptance.

## Evidence

- Initial nine-file regression: 47 passes, zero failures/skips, 5429.1024 ms.
  Final six-file regression after extending real backend model/snapshot coverage:
  25 passes, zero failures/skips, 5147.0326 ms. Full suite: 936 tests, 932 passes,
  zero failures, four native prerequisite skips, terminal exit 0, 217110.3725 ms.
  Local full log: `artifacts/usage-controls-suite-2026-10-14.log`.
- Strict TypeScript/build pass: 2056 modules, 631.18 KB entry. Existing chunk-size
  and mixed offline-import warnings remain. All 56 public-shell hashes match;
  eight original SQLite fingerprints match, integrity OK and zero FK violations.
- Built memory-only PGlite fixture on 3214: first owner request commits but loses
  ACK; reload hits a receipt outage; fresh lookup reports missing; explicit retry
  rejects; another lookup recovers the original personal timestamp. Second request
  fails before commit, survives reload and explicitly retries to exact acceptance.
- Owner inbox starts with 12 scoped rows: page two contains two and disables next.
  Supervisor sees only its seed request and then its new request; administrator
  starts empty and records its own request. Auditor sees plan/allowance without
  request controls. Foreign owner sees only its own one-row inbox and no old intent.
- Recovery fits: at 390px client/scroll widths both 303px; at 320px both 233px
  and page width 305px. Local screenshots:
  `artifacts/usage-rejected-recovery-mobile-2026-10-14.jpg` and
  `artifacts/usage-recorded-administrator-2026-10-14.jpg`.
- Fixture terminal: six explicit POSTs, four new recorded requests and four new
  audit events. Final row counts: owner 13, supervisor 2, administrator 1, foreign
  owner 1; 17 matching usage audit events including 13 seeds. Eleven protected
  tables unchanged: briefing/response content, provider policies/operations/requests,
  invoices/payments and invitation mail. Zero external calls.
- Temporary tab closed, viewport reset and all owned commands terminal. No
  original preview restart/migration, real worker data, provider/mail/cloud
  operation or diagnostic upload occurred. SQLite's existing usage-request
  unavailability is unchanged; the production PostgreSQL backend exposes the inbox.

No native-device, Reticle, live-provider or hosted-release verdict is claimed.
