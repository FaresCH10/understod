# Publication Schedules

Checkpoint: 2026-10-08 09:43 UTC. Local implementation evidence, not a
production deployment or external PostgreSQL concurrency verdict.

## Contract

Owner/supervisor staff can save one pending schedule per briefing. The request
contains a UUID, exact draft revision/next version, sorted unique explicit worker
IDs, an explicit-offset publication instant and an optional later deadline.
Acceptance freezes prepared content hash, recipient IDs/languages and issuing
staff/account access revisions. It creates neither a publication nor assignments.
Exact replay returns the original receipt before current draft validation;
conflicting reuse, scope/authority changes and unsupported recipients fail.

History is scoped, minimal and paged (20). Cancellation requires confirmed intent,
is repeat-safe, retains the original record and cannot undo a published version.
Terminal history and scheduling intent are database-immutable. Migration 037
implements the PostgreSQL equivalent; synthetic SQLite import preserves receipts.

The database worker invokes the same publication path as immediate publication.
At execution it rechecks current role/access revisions, publication version,
revision, content/glossary/language readiness, recipient activity/language and
deadline. Cancellation and publication are serialized with briefing/schedule
locks in PostgreSQL and an immediate transaction in SQLite. Publication,
assignments, replay receipt, audit and schedule completion commit together.
Known invalidated intent fails safely. Other internal failures have durable
5/10-second backoff and at most three attempts, then a redacted terminal error.
This is internal database atomicity, not exactly-once external delivery.

## Browser Verification

Optimized synthetic fixture 73295, email disabled, isolated in-memory database:

- A first accepted schedule deliberately lost its acknowledgement. The native
  date and selection remained; history refresh and reload recovered the saved
  schedule without sending it again.
- Confirmed cancellation left a permanent cancelled entry and no publication.
- A second schedule reached its real UTC due time. Two worker runs left exactly
  one publication and one assignment; history and immutable version timeline
  agreed. Counters: two schedule POSTs, one cancel POST, zero immediate publish
  POSTs, one cancelled schedule, one published schedule.
- Final browser build uses native FormData for datetime-local fields. Removed a
  stale cancellation toast; uncertain schedule save directs to saved history.
- Saved proof: `artifacts/publication-schedules/published-desktop.jpg`.
- The viewport override did not apply (actual 1186x884, scroll width 1171).
  A new 320px/mobile proof is not claimed. Temporary tabs/override were cleaned
  and fixture process is terminal.

Nine focused tests pass, including SQLite/embedded PostgreSQL authority and
immutability, stale intent, HTTP origin/query/session/scope, cancellation/replay,
frozen audience, failed execution and durable bounded retry. Latest full suite
64138: 442 tests, 439 pass, zero fail, three external PostgreSQL skips (83.402 sec).
Only final frontend native-field/error/toast changes follow the suite. Strict
TypeScript/Vite rebuild and final optimized browser checks follow these changes.
Entry `index-D8cbHYBn.js`: 497.67 kB / 134.95 kB gzip; 32 public-shell hashes pass.

Main synthetic/email-disabled development service 70063 is intentionally running
on 3020/3021. Browser overview retains 30 assigned / 25 responses / 22 matches /
3 clarifications / 5 pending. All eight selected business hashes match the prior
checkpoint, integrity/FKs pass, notification reads remain zero and main schedules
remain empty. An initial sandboxed restart was inaccessible to the browser and
was stopped; the approved outside-sandbox restart is verified live.

## Remaining Work

Opt-in in-app reminders now have a separate checkpoint in `ASSIGNMENT_REMINDERS.md`.
Scheduled library filters and populated cutover verification now have a separate
checkpoint in `SCHEDULED_LIBRARY.md`. Site-civil-time/DST selection and actual
320px saved-history proof are implemented in `SITE_CIVIL_TIME.md`. Reminder operations, translated
staff controls, durable closed-tab mutation recovery and broader accessibility
proof remain. Real Neon TLS/concurrency, cloud worker/object-storage restore,
privacy-approved real speech and full production gates are unverified. Scheduling
an unchanged authority snapshot after logout is intentional; expiry of the
original browser cookie does not cancel an accepted server-side schedule.
