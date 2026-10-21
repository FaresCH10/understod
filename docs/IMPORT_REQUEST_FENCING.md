# CSV Import Request Fencing

Current scope: bounded CSV preview upload, exact import reads/confirmation,
private tab recovery and captured-authority completion. This is not browser,
native PostgreSQL, live provider or production-release certification.

## Task Checklist

| To-do | Progress | Acceptance evidence |
| --- | ---: | --- |
| [x] Capture raw CSV and JSON authority through the actual import caller | 100% | Shared transport and context/route-keyed view; all direct import fetches removed |
| [x] Bound raw CSV to the preview endpoint and original bytes | 100% | POST-only Blob, 1 byte-256 KiB, exact query fields, 15-second timeout and lifecycle abort |
| [x] Preserve scoped recoverable intent without saving CSV content | 100% | Only request ID, content/name fingerprints, phase and byte count retained in this tab |
| [x] Verify exact preview and confirmation outcomes before cleanup | 100% | Matching IDs/fingerprints, bounded consistent rows/counts, guarded async completion |
| [x] Separate status lookup from explicit unchanged retry | 100% | Recovery mounts with GET only; original-file retry or same-import confirmation requires explicit action |
| [x] Fence server import routes and preserve native error downloads | 100% | Both HTTP backends deny missing/changed context before side effects; cookie-only errors.csv still works |
| [x] Preserve parser, atomicity, exact replay and deletion metadata behavior | 100% | Focused 36-pass regression, no new grants and no schema migration |
| [x] Full synthetic regression checkpoint | 100% | 164 files, 874 passed, zero failed/four native skips, terminal exit 0 |
| [ ] Rendered stale-view/reload/Strict Mode/keyboard/mobile acceptance | 0% | Browser inventory and requested retry both failed at trusted runtime startup |
| [ ] Native/database/device/hosted release acceptance | 0% | Embedded local tests are not native-role/TLS/concurrency or device proof |

The task rows overlap and must not be averaged. CSV import request boundary:
**75%**. Whole staff request fencing: **75%**. Overall production: **about 60%**
(55-65% uncertainty), not readiness.

## Recovery Contract

- Raw CSV is supported only by the existing import-preview POST endpoint, with
  strict byte/path/query bounds. JSON remains the default shared request format.
  Transport retains original staff context, credentials, no-store/redirect policy,
  timeout, mount abort and pre/post authority checks.
- SHA-256 of original CSV bytes and the original filename identifies the saved
  intent. Both import backends share a private projection containing those
  fingerprints; the original filename hash survives deletion pseudonymization.
  There is no database migration and no new public or anonymous receipt route.
- Recovery storage is scoped to the original organization/site/staff identity.
  It stores no CSV text, worker labels, filenames or bearer credentials. Records
  cannot be overwritten or cleared under another ID, phase or fingerprint.
  Existing session cleanup covers the new `understood:imports:` prefix.
- A new preview needs exact evidence before it can clear its saved record.
  Successful confirmation also checks acknowledgement counts and fetches the
  exact import status. Malformed, missing, changed, held or stale completion
  preserves recovery and cannot install data, navigate or announce success.
- Recovery issues a GET status lookup automatically, never an automatic POST.
  A validated preview is NOT evidence that an uncertain confirmation completed.
  A missing upload may be explicitly retried only after the unchanged original
  file's fingerprints match. Confirmation retry uses the same immutable import.
- Known first-attempt rejection can return to the validated preview after a
  matching status lookup. An earlier uncertain request remains retained across
  rejected recovery retries. Imported/expired exact state resolves the saved
  intent. Invalid or unavailable evidence stays unconfirmed.
- Existing GET behavior still applies scheduled expiry/deletion purge where
  needed. Calling the client lookup read-only means it sends no fresh business
  POST, not that the server's pre-existing lifecycle maintenance is suppressed.
- The existing csv-parse engine, row revalidation, atomic worker/crew creation,
  immutable preview/replay and no-access-grant semantics remain unchanged.
  Native error CSV links use cookie authentication without custom headers.

## Evidence

- Test-first CSV transport failed because raw bytes were JSON-serialized before
  the explicit format path was added. The original JSON transport tests remain.
- Test-first missing import-context reads failed on both backends (404 instead
  of expected 409). The shared policy now rejects before input/side effects.
- Seven-file focused regression: 36 passed, zero failed/skipped, exit 0,
  20988.8561 ms. Includes exact intent/replay/counts, private metadata, changed/held
  async completion, parser/confirmation rollback, cutover and deletion redaction.
- Strict production build: 2040 modules, 589.68 KB entry. Existing large-chunk
  and mixed static/dynamic offline-import warnings remain. All 69 shell hashes
  match; eight original SQLite fingerprints match, integrity OK, zero FK violations.
- Final combined full suite after all source changes: 164 files, 878 tests,
  874 passed, zero failed, four native prerequisite skips, terminal exit 0,
  313102.0361 ms. Log: `artifacts/import-request-suite-2026-10-13.log`.
  Test handle 37127 is terminal; all owned required commands are terminal and
  no owned server was launched.
- Two current browser inventory calls exited at trusted Node runtime startup.
  No browser actions/verdict, original preview restart/migration, provider/mail/
  cloud operation or external diagnostic upload occurred.

## Remaining

Rendered recovery/reload/original-file retry, Strict Mode, keyboard, RTL and real
phones remain unverified. An uncertain saved confirmation whose rows become
invalid remains retained until exact outcome/expiry can be resolved; there is no
automatic abandonment or new-intent replacement. Private worker links, deletion
completion, assignment response reads and remaining workspace/settings/privacy,
glossary/templates/reports/export/notification helpers still need their boundaries.
Full reference/language/a11y, native, live AI, hosted and release gates remain open.
Real worker content must never go to Gemini Free.
