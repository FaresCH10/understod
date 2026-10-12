# Staff metadata search

Checkpoint: 2026-10-12. The shared staff header now opens a real read-only site
search. It searches briefing titles, current worker references and crew names,
not worker answers, transcripts, source content, private rubrics, notes, billing
or provider/operator secrets. No external search service is used.

## Contract

`GET /api/search?query=...&kind=all&page=1` is implemented in SQLite and PostgreSQL.
Actual active scoped owner/supervisor/auditor authority is rechecked. Auditors and
archived-site reads are briefing-only; administrators and worker sessions cannot
use the shared search. PostgreSQL also enforces current tenant admission.

Queries are trimmed, 1-80 characters, with no ASCII controls. Duplicate/unknown
parameters are rejected; `%` and `_` are literal characters, not SQL wildcards.
Results and complete category counts are scoped to the current organization/site,
stably ordered and bounded to 20 rows per page. SQLite uses a read transaction;
PostgreSQL uses repeatable-read. HTTP requires the current client session context
and returns no-store. Result validation rejects malformed responses/destinations.

Briefing results open the existing detail. Worker results use an exact scoped
worker ID filter (including disabled workers); crew results use a new scoped
read-only crew GET and existing membership/directory controls. IDs never supply
SQL identifiers. The query survives reload in the hash route; category and page
selection reset on reload, rather than claiming durable paging state.

## Evidence And Limits

- Seven-file synthetic regression: 36 passed, zero failed/skipped, 11.272 seconds,
  terminal exit 0. The first run had six sandbox loopback EACCES failures; the
  authorized local-only rerun passed without weakening assertions.
- Strict TypeScript/Vite build: 2022 modules. Existing large-entry and mixed
  worker-offline import warnings remain. All 65 service-worker file hashes match.
- Eight original SQLite business table fingerprints match; integrity is ok and
  foreign-key violations are zero. Original previews were not migrated/restarted.
- Built isolated PGlite browser: owner search/20-row paging/page two, disabled
  Worker 014 detail/reload, Arabic crew membership, briefing detail/reload, empty
  results, category filtering, mobile search button and auditor briefing-only view.
  Search layout checked at 320/390/768/1440 pixels. The 320px screenshot exposed a
  shared ellipsis style; search titles now wrap fully and were rechecked.
- Two accounted fixtures stopped cleanly: seven and four search requests,
  respectively; zero business writes, unchanged business fingerprints, zero
  external calls. The earlier unprovisioned fixture was explicitly stopped but
  had no graceful accounting result, so it is not counted as passing evidence.
- Screenshots: `artifacts/staff-search-desktop-2026-10-12.jpg`,
  `artifacts/staff-search-mobile-2026-10-12.jpg`, and
  `artifacts/staff-search-auditor-2026-10-12.jpg`.
- Reticle had no connected session, so no Reticle verdict is claimed. External
  diagnostic reporting was blocked and the user chose to keep diagnostics local.

No native PostgreSQL/Neon Free, live service, real worker data, cloud deployment,
full 44-reference comparison or complete accessibility/security/release pass is
certified by this checkpoint. The original preview process may still hold older
backend modules; the isolated built fixture was the tested endpoint.
