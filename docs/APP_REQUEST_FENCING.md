# App Request Fencing

Estimated task progress: **75%**. This is a captured-transport checkpoint, not
full App acceptance or complete durable processing-request recovery.

## Task Checklist

- [x] 100%: original staff authority on overview, briefing list/detail, processing
  list/detail, activity list/detail and readiness read transport; bounded no-store
  requests, mount abort and server header enforcement. Worker legacy reads unchanged.
- [x] 100%: polling/navigation and mutation completion guarded against original
  view loss; root staff actions restricted to validated process/sign-out intents.
- [x] 100%: processing retry's missing-header defect repaired; exact expected-job
  acknowledgement required before its completion callback. No unsupported success
  toast after malformed, lost, held, expired or changed-identity acknowledgement.
- [x] 100%: role-correct read-only auditor readiness; inspection reads configuration
  and stored evidence, never implies a provider test or sends a model request.
- [x] 100%: local regression/build and built retry, outage, read, CSV and sign-out.
- [ ] 30%: stricter complete DTO validation in older overview/detail/readiness views.
- [ ] 20%: durable per-request processing retry receipts and account-transition audit.
- [ ] 30%: wider expiry/revocation/cross-tab/Strict Mode, keyboard and actual-device
  acceptance, native PostgreSQL roles/TLS/concurrency and full reference acceptance.

## Evidence

- Initial ten-file regression: 48 passes, zero failures/skips, 4973.1235 ms.
  Final four-file regression: 27 passes, zero failures/skips, 5706.0658 ms.
- Initial full run: 940 tests, 934 passes, two failures, four skips, exit 1,
  232628.0726 ms. An added normal-client wrapper hid intentional missing-header
  inputs in `staff-access.test.mjs`; removed that wrapper, not the denial assertions.
  Final full rerun: 940 tests, 936 passes, zero failures, four native prerequisite
  skips, exit 0, 219756.7999 ms; log `artifacts/app-controls-final-suite-2026-10-14.log`.
- Strict TypeScript/build pass: 2057 modules, 632.76 KB entry. Existing chunk-size
  and mixed offline-import warnings remain. All 56 shell hashes match; post-suite
  eight protected original SQLite fingerprints match, integrity OK, zero FK violations.
- Built memory-only fixture on 3216: failure before retry commit remains repairable;
  next explicit retry queues the original job. Root draft process commits with a
  withheld ACK; no success message appears, and reload shows actual processing
  without another POST. Both jobs remain at original revision one; publications,
  assignments, attempts and clarification evidence unchanged.
- Overview and briefing navigation work under required headers. Activity detail
  opens read-only and an actual native CSV downloads five event rows/seven metadata
  fields. Download path: `C:/Users/Fares/Downloads/activity-history (1).csv`.
- Readiness inspection reports stored/configuration checks only. Auditor has no
  inspect control. Captured staff sign-out succeeds; a fresh tab opens the public
  signed-out screen with a Sign in link. Screenshot:
  `artifacts/app-processing-accepted-2026-10-14.jpg`.
- Fixture terminal: three process POSTs, one before-commit failure, one lost ACK,
  two accepted processing requests plus one seeded processing event; seven protected
  fixture tables unchanged; zero external calls. Temporary tabs closed, no viewport
  override. No original DB migration/restart or real data/provider/mail/cloud action.

The direct processing acknowledgement is not an immutable request receipt and
does not prove eventual preparation success. Full replay/recovery is still open.
No Reticle, native-device, live-provider or hosted-release verdict is claimed.
