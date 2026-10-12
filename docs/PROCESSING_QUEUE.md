# Processing queue checkpoint

Local synthetic implementation, not live AI or production readiness.

## Contract

- Scoped active owner/supervisor/auditor reads at GET `/api/processing` and `/api/processing/:id`. Workers and foreign sites cannot read jobs. Responses are authenticated and no-store.
- Shared literal title search, status (all/queued/processing/ready/failed), newest/oldest order with ID tie-break, page 1-5000 and page size 1-100. Unknown filters are rejected. One SQL statement returns filtered totals and bounded items, including empty/out-of-range pages.
- Details expose current draft revision/state, attempts, created time and archive marker. Explicit DTOs omit provider errors, lease tokens, private artifacts, source and rubric. Unknown failures have a generic message. When available, details include bounded immutable stage events grouped by attempt: validated starts, completions, reuse, and safe failure codes; current and previous runs remain distinguishable after retry.
- Retry uses the existing scoped revision-checked preparation endpoint. UI offers it only for the current failed preparation of an active failed draft; pending duplicates reuse the existing job. Stale source revisions and archived drafts reject on the server. Published content and worker answers are unaffected.
- UI prevents simultaneous submissions, refreshes after success/failure, polls queued/processing detail, focuses the heading after navigation/retry, and wraps long titles/IDs on mobile. Completed/obsolete/archived jobs remain readable. Processing detail renders current and previous attempt stage history without percentages or internal lease/provider data.

## Verification

2026-10-06: `node --test`: 326 tests, 323 pass, zero fail, three external PostgreSQL skips (70.87 sec). Strict TypeScript/Vite build passes. SQLite and embedded PostgreSQL checks cover >100 jobs, stable pages, literal filters, explicit DTO redaction, authority, closed/obsolete/current retries, private HTTP responses, immutable migration 025 stage events, and a failed-attempt/retry ledger regression. Test fixture due-date setup was corrected after an initial PostgreSQL not-null failure; the final full run is green.

Memory-only `node scripts/processing-browser-fixture.mjs` served 46 jobs at 3030/3031. Browser verified page 2 of 3, failed filter resetting to page 1, search, actual retry queued-to-ready with unchanged job ID, removed retry affordance and reload. Phone/desktop widths 305/1440 have no document overflow; final phone detail stacks fields to keep IDs legible. Evidence: `evidence/processing-queue-320-2026-10-05.jpg`, `processing-retry-result-320-2026-10-05.jpg`, `processing-retry-result-1440-2026-10-05.jpg`.

Fixture stopped; saved supervisor and normal viewport restored. Seven business-evidence hashes remain unchanged. Before this checkpoint baseline was taken, two expected `workers.import_expired` events expired old staged CSV previews; audit is now 18 rows, hash `f7bee1a0152c1f66a894f271588223cf716fc27cc469fd3fd29801366183abb3`, unchanged before/after processing browser checks. No saved retry/publication/answer/help/directory mutation occurred.

## Remaining

Reference S17's live audio/transcription/translation/speech operation, provider provenance and enabled-target configuration are not production-connected. The synthetic pipeline now records real validated stage transitions and errors; it does not fabricate percentages or claim live quality. Operator controls, automated cost-aware retry limits, full reference/a11y audit, native-language validation, real PostgreSQL wire/TLS/concurrency and production deployment remain gates. No Reticle verdict is claimed.
