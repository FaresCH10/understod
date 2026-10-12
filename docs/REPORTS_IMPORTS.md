# Reports and worker imports

SQLite and PostgreSQL repositories execute through scoped credential HTTP tests. The default local app still uses SQLite. These operations do not enable live AI, issue worker access links, send messages, or change an existing publication's frozen audience.

## Reports

- `GET /api/reports?publicationId=...` reads a scoped publication and its latest evidence. Counts distinguish a received answer from an assessment. Completion is received / assigned, not proof of understanding.
- Language breakdown and CSV use the immutable assignment language, not the worker's current preference. Legacy synthetic migration cannot establish unknown real historical language. Dates render in the site's time zone.
- `GET /api/reports/publications` accepts only `search`, `from`, `through`, `page` and `pageSize`. Search is a bounded literal title substring, dates are inclusive valid civil publication dates in the site's current time zone, and stable pages contain metadata only. Role/site/session authority is revalidated. The picker is no longer limited to the old 100-version dropdown; the old report payload remains compatible.
- Publication-history dates select a version, not a response window. Report dates separately filter latest accepted responses with a preserved assigned denominator. New publications retain immutable crew membership; old versions explicitly lack that provenance. See `REPORT_SCOPES.md`.
- Native civil-date filtering has a 5,000-candidate ceiling after coarse SQL date/title filtering; oversized history returns an explicit narrowing error instead of silent truncation. The UI uses 20-row pages, native date inputs and submitted form values, aborts obsolete reads, and has loading/error/empty/manual-refresh states. No request automatically creates an export or marks a notification read.
- `POST /api/reports/exports` takes `{ requestId, publicationId, filters? }`. The UUID is an idempotency key; changed input/filters or another requester cannot reuse it. The request transaction freezes evidence, filters and time zone.
- Owner, supervisor and auditor can request/read exports for their own site. Downloads require a currently active staff session; there is no public or signed download URL.
- The local worker generates CSV with a 30-second lease and at most three attempts. History exposes metadata only, up to 50 entries. Failed jobs can be explicitly retried while eligible.
- Exports contain worker ID, assignment language, response status, assessment, received time and version. Raw answers, private rubrics and audio are excluded. Cells are quoted and formula-prefixed values escaped. UTF-8 BOM is included.
- Bounds: 5,000 assignment rows and 2 MB snapshot/output. Expiry is 24 hours from request, not from download. Server expiry purges snapshot/output/checksum and denies further download; audit metadata remains. Already downloaded copies cannot be revoked.
- `GET /api/reports/exports`, `POST /api/reports/exports/:id/retry`, and `GET /api/reports/exports/:id/download` drive history. Requests, readiness, failures, retries, downloads and expiry are audited.
- Legacy `/api/reports.csv` remains a scoped, audited immediate download for compatibility; it is not an asynchronous history entry.

## Worker CSV

Use UTF-8 CSV with exactly one of these headers:

```csv
worker_id,language
Worker 031,ar
Worker 032,ur
```

```csv
worker_id,language,crew
Worker 031,ar,Beirut Morning
```

- Languages are `en`, `ar`, `ur`. Worker IDs use the same validation as manual entry and are organization-unique. Crews must already be active at the current site; imports never create crews implicitly.
- The installed [csv-parse synchronous parser](https://csv.js.org/parse/api/sync/) handles quoting, BOM and strict record widths. Bounds: 256 KiB, 1,000 worker rows, 4,096-character record size. Invalid UTF-8, unsupported headers/languages, duplicates, missing crews and malformed records cannot be imported.
- `POST /api/people/imports/preview?requestId=UUID&filename=FILE.csv` accepts raw `text/csv`. Validation saves a scoped preview, not workers. Owner/supervisor authorization is checked before reading the body.
- `GET /api/people/imports/:id` refreshes the preview and revalidates current directory conflicts. `GET /api/people/imports/:id/errors.csv` returns formula-safe errors. Nothing is silently skipped.
- `POST /api/people/imports/:id/confirm` explicitly commits all rows in one transaction after revalidation. A failed row rolls back the entire import. Retry after success returns the original imported count without duplication.
- Imported workers have no access grants/sessions and no retroactive assignments. Issuing access and publishing a new audience are separate authorized actions.
- Preview bytes are hashed for retry comparison, not retained as an uploaded file. Staged rows/errors expire after 24 hours; directory entries remain. Expiry is enforced on reads and by the local worker. Audit metadata and the successful count remain, but the full preview is purged.

## Evidence

`node --test tests/exports.test.mjs tests/reports.test.mjs tests/worker-import.test.mjs` covers scope, retry, expiry, quoting, parser failures, changed-directory conflicts and atomic rollback. The in-app browser exercised invalid preview, replacement, explicit successful confirmation, refresh and queued-to-ready CSV download on synthetic data. See `evidence/browser-check.md`.

2026-10-08 publication-history checkpoint: `tests/report-publications.test.mjs` covers SQLite/embedded PostgreSQL scope/private metadata/revocation, literal search, stable pages over 125 archived versions, valid/leap/reversed dates, Beirut spring/fall daylight-saving boundaries, and sanitized HTTP failures. Full suite 52756 is terminal: 428 tests, 425 passed, zero failures, three external PostgreSQL skips (76.713 sec). Only final field-height CSS and singular label copy follow this suite; strict builds and browser checks follow those edits.

Optimized disposable `--built --report-history` fixture 41019 verifies all seven pages, keyboard selection of the oldest version and its original two-person audience, retained native submitted dates, empty future range, actual 320px field containment, explicit failed history GET/manual retry, failed lazy report download and working alternative navigation. Normal reload restores 126 versions. Screenshots are in `artifacts/report-history`; viewport screenshots are used for the failed-download proof because an initial full-page capture distorted its rendering. Fixture cache/tab/viewport are cleaned and its 3168/3169 ports are closed. No fixture export was created. Main 8700 was intentionally stopped after a live check; updated synthetic/email-disabled main 4576 runs on 3020/3021, preserving its actual 30/25/22/3/5 report counts. Existing publication/worker/assignment/recording/deletion/notice hashes and notification read count are rechecked separately.

Historical 67% estimate is superseded by later status checkpoints, not a readiness proof. Response-window/crew reporting and synthetic import preservation are implemented in `REPORT_SCOPES.md`. Native concurrency/TLS, full hosted cutover, larger-history performance, worker crash drills, live quotas, policy approval and full reference/accessibility gates remain. No cloud/provider/email actions or real worker transmission occurred.
