# Report Scopes

S16/A15 implementation checkpoint, 2026-10-11. This is scoped application evidence, not production activation.

`GET /api/reports` accepts `publicationId`, `crewId`, `responseFrom` and `responseThrough`. Unknown keys, malformed crew identities, impossible dates and reversed ranges are rejected. Existing owner/supervisor/auditor site authorization remains required. Publication-date history filters are separate from latest-response filters.

## Frozen Audience

New publication transactions capture each assignment's crew ID/name or explicit no-crew membership in `publication_report_audience`. SQLite capture and PostgreSQL migration 075 enforce scoped immutable rows. Later worker moves and crew renames/archives do not change this reporting audience. Scheduled publication captures membership when it actually publishes. Older publications are not backfilled using current membership: all-worker/date reports remain available, while a requested historical crew filter fails explicitly. `@unassigned` selects the publication's no-crew audience.

## Civil Dates And Counts

Inclusive response dates use the site's time zone and each assignment's latest accepted receipt, including audio awaiting assessment. They do not find a convenient older answer within the window. Crew selection freezes the assigned denominator; a date window changes received/matched/clarification counts but does not remove assigned workers from that denominator. A latest answer outside the window therefore counts as no response in the window. Assignment languages remain frozen. Response completion is not a comprehension score or safety certification.

Existing limits remain explicit: at most 5,000 assignment candidates and 2 MB export content. Larger-history/performance work remains open.

## Export Contract

`POST /api/reports/exports` accepts `{requestId,publicationId,filters}`; omitted filters mean all assigned workers without a date window. A single request transaction freezes rows, normalized filters and the selection time zone. Exact same-owner/site replay returns the original request; changed filters conflict even if the rows happen to match. Database guards forbid updating filters. Later answers, directory edits and site time-zone edits cannot change the snapshot or retry output.

CSV still contains only worker reference, assignment language, response status, assessment, received timestamp and briefing version. It excludes raw answers, rubrics, reasons and audio, escapes formula cells, and remains private and expiry-bound. History exposes filter/time-zone metadata. SQLite-to-PostgreSQL cutover preserves captured audience, new filters and output; legacy exports receive the normalized empty-filter default, without invented crew provenance.

## Verification

- Seven focused SQLite/embedded PostgreSQL scope checks pass, including Beirut spring/fall daylight-saving boundaries, later latest-receipt replacement, no-crew membership, immutable SQL guards, strict inputs, exact export replay, frozen output and time zone.
- Explicit historical-version HTTP checks cover malformed/foreign overrides, no-store reads and unavailable historical crew responses; ordinary credential/revocation checks remain.
- The new cutover test passes with populated publication audience and a ready filtered export, including original crew-name preservation after a directory rename/move.
- Built-browser fixture `scripts/report-scopes-browser-fixture.mjs` uses only in-memory synthetic PostgreSQL-compatible data, real publication/credential routes and the real export worker. Desktop selection produced one assigned/one received/100% response completion and one ready frozen export; final fixture evidence contains exactly one POST, one selected row and zero external requests.
- At 320px, no-crew selection produced one assigned/zero responses; Clear restored three assigned/two responses/67%. Document width was 320px, then 305px with the scrollbar. Desktop width was 1425px at a 1440px viewport. Screenshots: `artifacts/report-scopes-desktop-2026-10-11.jpg` and `artifacts/report-scopes-mobile-2026-10-11.jpg`.
- Native date input automation initially cleared entered values. Keyboard entry into the native date segments retained the actual date and the server received both date fields. No page-state injection was used.
- A browser download wait stalled for 2542 seconds and reset the tool. Browser download completion is NOT proved by that call; repository and existing HTTP download tests cover the server output separately. The fixture ended at its normal 15-minute cutoff. A second fixture completed mobile checks and stopped cleanly. Initial sandbox fixture was explicitly stopped after loopback browser failure.
- Reticle had no connected session; no Reticle verdict is claimed. This is not a full accessibility, reference-fidelity, phone, native PostgreSQL concurrency, hosted or live-provider gate.

The optimized build and all 63 public-shell hashes pass. Existing bundle-size and ineffective offline dynamic-import warnings remain. Eight saved SQLite business fingerprints match, integrity is OK and foreign-key violations are zero. No original database migration or preview restart occurred. Gemini Free remains synthetic-only; no real worker data, external provider, mail or deployment operation was performed.

Final combined regression: 79 passed, zero failed/skipped, 293.825 seconds, terminal exit 0. Results and failed intermediate runs are recorded in `artifacts/report-scopes-checkpoint-2026-10-11.json`.
