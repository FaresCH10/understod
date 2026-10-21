# Reports and Export Recovery

Date: 2026-10-13. Boundary progress: **85%**. Whole staff request fencing: **94%**.
Overall production scope remains **about 60%** (55-65% uncertainty); no release or
real-data approval is implied by this boundary. Requirements: S16, S43, A05, A15.

## Task Checklist

| To-do | Progress | Remaining acceptance |
| --- | ---: | --- |
| [ ] Captured report and publication-history reads | 85% | Wider authority-loss, malformed DTO, keyboard and native acceptance |
| [ ] Captured bounded export history polling | 85% | Wider authority/device/native acceptance |
| [ ] Exact filtered export creation recovery | 85% | Wider authority/device/native acceptance |
| [ ] Immutable export retry receipt recovery | 85% | Wider authority/device/native acceptance |
| [ ] Native CSV download continuity | 85% | Wider browser/device/native acceptance |
| [ ] Retry journal migration, permissions and import | 85% | Native database/concurrency/full restore proof |

## Implemented Contract

- Reports and publication history capture the full staff session; timeout,
  no-store, abort and mount-generation guards fence reads and completion.
- Export polling uses the same captured authority, validates bounded metadata,
  and never clears a pending request just because a job progressed.
- Tab recovery retains exact publication, crew and civil-date filters or the
  original export ID and failed attempt. Changed intent cannot replace or clear
  an unresolved request. Actor/site storage scope is independently validated.
- An exact saved receipt is required before acknowledging acceptance or clearing
  recovery. The frozen acceptance fields are compared; mutable queue status is
  deliberately not mistaken for another request or technical readiness.
- An earlier unknown outcome survives a later known rejection. Retry is explicit
  and unchanged after a verified missing lookup. A first known rejection checks
  its receipt before discarding the original intent.
- Existing owner/supervisor/auditor report permissions remain. Auditor export
  authority is explicit and does not expand default template/glossary writer roles.
- JSON report, export, receipt and retry routes require the captured context on
  both backends. Native cookie-authenticated CSV URLs remain unchanged.
- New immutable `report_export_retries` journal binds original actor/site/export,
  request ID and attempt. Queue updates, receipt insertion and audit are atomic;
  exact replay remains valid after worker progress without queuing another job.
- PostgreSQL migration 084 adds scoped foreign keys and immutable evidence.
  Runtime-role allowlist and SQLite import include the new journal. Original local
  database/previews were not migrated or restarted.

## Current Evidence

- Pure export recovery: four passing tests cover scoped storage, malformed input,
  exact metadata/filters, queue progress, changed storage and held/lost authority.
- Focused actual backend tests prove original-actor receipts, conflict denial,
  audit rollback, lost PostgreSQL commit acknowledgement, unchanged retry receipt
  after queue progress, formula-safe native download and frozen report filters.
- A 72-pass regression included neighboring domain workflows, artifact recovery,
  runtime-role privileges and source cutoffs; it preceded final HTTP/import additions.
- Later 34-pass regression included exact HTTP receipts and SQLite-to-PostgreSQL
  import of a populated retry receipt. The first HTTP fixture correctly failed
  rehearsal safety because its schema lacked the isolated test prefix; the fixture
  was corrected without weakening the server's check.
- Initial full synthetic run: 919 tests, 912 passes, three failures, four native
  skips, exit 1. All three failures were explicit migration-83 expectations; they
  now include 084. Final six-file 31-pass regression checks full migration order,
  checksum drift and read-only verification. Corrected full rerun: **169 files,
  919 tests, 915 passes, zero failures, four native skips, terminal exit 0,
  220951.1115 ms**. Log: `artifacts/report-controls-final-suite-2026-10-13.log`.
- Strict build passes: 2050 modules, 634.60 KB entry. Existing chunk-size and mixed
  offline-import warnings remain.
- Built primary browser fixture: five explicit POSTs, one filtered owner export,
  one durable retry and one auditor export; two later explicit repeats rejected.
  Both unknown requests survive reload, a receipt outage and false missing result,
  then reconcile exact receipts. No automatic POST replay; publications unchanged.
- Actual native filtered CSV download parsed successfully: 25 rows including
  header, six columns, October window respected and private answer/rubric content
  absent. File is synthetic local QA output in the user's Downloads directory.
- Final built mobile retry fixture: two explicit POSTs, one accepted retry receipt,
  one rejected repeat. Original failed attempt stays 1 while CSV reaches ready at
  attempt 2. At 390/320px the page widths are 375/305px and recovery scroll widths
  equal client widths (339/269px). Label distinguishes export from publication.
- All owned browser fixtures stopped, temporary tabs closed and viewport reset.
  No Reticle verdict, live provider/mail/cloud calls or external diagnostics.
- Final 55 public-shell hashes match; eight protected original SQLite fingerprints
  match, integrity OK, no foreign-key violations. New retry table is absent from
  the protected original database. All owned command sessions are terminal.

## Still Open

Broader stale-view/authority,
Strict Mode, malformed report DTO and accessibility/device acceptance; native
PostgreSQL/TLS/concurrency/full restore; live synthetic quality and authorized
hosting. Notifications, onboarding/usage and App-owned request helpers are next.
Real worker content must remain off Gemini Free.
