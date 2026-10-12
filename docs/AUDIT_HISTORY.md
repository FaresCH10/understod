# Activity history

Local staff route: `http://127.0.0.1:3020/#reports/activity`, reached from Reports. This displays actual persisted audit metadata, not synthetic invented timeline rows. Available actions reflect what the implemented workflows have recorded; missing workflows do not gain fabricated events.

## Implemented contract

- `GET /api/audit`: owner, supervisor or read-only auditor at the current active site only; workers and revoked staff are denied. Scope is rechecked in the repository as well as session middleware.
- Search actors' current display names/codes, action names or object identifiers. Filter by site civil date, actor category and exact recorded action; page size is 20 in the UI, at most 50 in the API.
- Civil-date filtering uses the site's IANA time zone through `Intl`, not a fixed offset. A bounded UTC candidate window handles midnight/timezone transitions.
- Reads are bounded to 5,000 candidate events; larger selections fail with an instruction to narrow filters, never silently truncate. Action choices contain up to 100 distinct scoped actions.
- `GET /api/audit/:id`: exact-site read-only event details, with next/previous navigation within the visible page. Unknown/foreign-site IDs return unavailable.
- `GET /api/audit.csv`: the same filtered set, all its pages, at most 2 MB. Authenticated/no-store metadata CSV, spreadsheet formula neutralization and an `audit.exported` event. This small bounded export is synchronous; it is not a durable export job.
- No answer text, supervisor notes, rubric, email, session token, credential or audio bytes are returned. The screen does not invent historical actor roles, publication versions or artifact hashes that were not recorded.
- Actor display names are current directory labels, not an immutable historical name snapshot. Stable recorded actor ID/type, action, object ID and time remain visible.
- SQLite triggers and additive PostgreSQL migration 004 reject event updates/deletes. No edit/delete API is exposed. This is append-only for normal application use, **not tamper-proof against database administrators**.

Retention/pseudonymization and the least-privilege production DB role remain unfinished. An authorized retention migration/job needs a separate lifecycle and must not bypass these guards casually. The running UI/API uses SQLite; the PostgreSQL audit repository is connected to isolated credential HTTP rehearsal with scoped civil-date, paging, CSV and rollback checks, not the default browser.

## Evidence

`tests/audit.test.mjs`: paging, site civil date, actor/action/search, owner/auditor allow, worker/anonymous/revoked/foreign-site deny, invalid filters, CSV privacy/formula/size bounds, recorded downloads and update/delete rejection. Embedded PostgreSQL tests execute migration 004 and reject audit updates/deletes.

In-app browser on 2026-10-04: date/action filters, the persisted worker-import event detail, filtered download to Downloads, and the resulting `audit.exported` detail. Desktop/tablet/phone screenshots inspected at 1440/768/390/320 CSS pixels; document widths 1425/753/375/305 with no horizontal document overflow after the shared mobile-header fix. Screenshot: `evidence/activity-history-2026-10-04.jpg`. Paging beyond one page was tested in the isolated test, not the 13-event persistent browser fixture.

Reticle is unconnected; no Reticle verdict. No real device, complete keyboard/screen-reader audit, all-reference pixel comparison or production access was verified.
