# Billing Request Fencing

Requirements: A06, S34 and S42. This is a local implementation boundary, not
payment processing, native PostgreSQL certification or production readiness.

## Task Checklist

| To-do | Progress | Acceptance evidence |
| --- | ---: | --- |
| [x] Capture authority for invoice list/detail reads | 100% | Scoped transport, abortable reads, stale-view guards and context-keyed mount |
| [x] Fence create/manual-payment/void dispatch and completion | 100% | Shared immutable authority, held-session completion and guarded callbacks |
| [x] Match receipts to the exact canonical billing intent | 100% | Kind/request/target and SHA-256 of normalized persisted values; no raw request projection |
| [x] Preserve unchanged recovery and earlier uncertainty | 100% | Scoped saved record, signature checked before overwrite and cleanup; explicit retry only |
| [x] Reject missing/changed context before business side effects | 100% | SQLite and embedded PostgreSQL HTTP tests; ledger/audit snapshots unchanged |
| [x] Preserve native downloads and owner/auditor restrictions | 100% | Native download needs cookie but no custom header; existing role/scope tests pass |
| [x] Full synthetic regression and build checkpoint | 100% | 866 passed, zero failed, four native skips; strict build and preservation pass |
| [ ] Rendered stale-view/Strict Mode/recovery acceptance | 0% | Browser runtime has not produced a current usable verification session |
| [ ] Native PostgreSQL role/TLS/concurrency acceptance | 0% | Embedded tests are not native restricted-role or process-termination proof |

Billing boundary estimate: **75%**. Whole staff-request migration: **60%**.
Overall production estimate remains **about 60%** (55-65% uncertainty). Task rows
describe overlapping narrow milestones and must not be averaged.

## Implemented Contract

- Billing views use the existing captured `StaffRequestAuthority` transport.
  Requests are cookie-authenticated, no-store, bounded and abortable; they never
  adopt a new account's current context into an earlier request.
- Invoice creation, received-payment records and voids retain immutable request
  IDs. Completion requires a valid acknowledgement plus a read-only receipt
  lookup matching the exact kind, request ID, target and normalized intent hash.
  A missing or mismatched receipt cannot clear the saved request.
- The signature sorts canonical field entries, so PostgreSQL JSONB key ordering
  does not change receipt meaning. Existing integer-cent/date/input validation
  and immutable ledger semantics remain unchanged. No schema migration is needed.
- Client cleanup checks the saved signature again, and old view/session callbacks
  cannot clear storage, navigate, reset forms or announce success. Earlier unknown
  outcomes remain retained across later rejected retries.
- Shared middleware requires captured context on billing JSON reads, writes and
  receipts. Native invoice-download links retain ordinary cookie authentication
  without requiring a browser-inaccessible custom header.
- Receipt hashes are owner/requester/site scoped. They do not expose the raw
  request JSON; auditor reads and owner writes retain their existing boundaries.
- These workflows record manual invoices and already-received payments. They do
  not charge cards, transfer money or reconcile a provider invoice.

## Local Evidence

- Focused five-file regression: 17 passed, zero failed/skipped, exit 0,
  6758.8648 ms. An initial outdated SQLite receipt expectation failed; it now
  verifies the full canonical hash without weakening replay/balance assertions.
- TypeScript and production build pass: 2039 modules, 579.70 KB entry.
  Existing large-chunk and mixed static/dynamic offline-import warnings remain.
- All 69 generated offline-shell hashes match. Eight original SQLite table
  fingerprints match; integrity is OK and foreign-key violations are zero.
- Full synthetic suite: 163 files, 870 tests, 866 passed, zero failed, four native
  prerequisite skips, terminal exit 0, 312734.3653 ms. Local log:
  `artifacts/billing-request-suite-2026-10-13.log`. This ran after all source changes.
- Both owned test/build handles (91697 and 65027) are terminal. No owned server
  was launched or original preview restarted.
- Browser documentation reload failed at trusted runtime startup; its requested
  inventory retry failed with `CreateProcessSecurityEnvironment` (0x80070020).
  No browser actions/verdict or external diagnostic upload occurred.
- No original database migration/restart, live provider/mail/cloud operation,
  external diagnostic upload or browser/native acceptance is claimed.

## Remaining Work

Rendered stale-tab/Strict Mode, held verification, request-recovery focus and
actual-device acceptance remain open. Remaining invitation/people/import/access,
workspace/settings/privacy, glossary/templates, reporting/export/notification and
App-owned helpers still need their own captured-context migration. Full reference,
localization/a11y, live AI, native/database, hosted and release gates remain open.
