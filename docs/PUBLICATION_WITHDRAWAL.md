# Publication withdrawal checkpoint

Implemented locally and in isolated PostgreSQL rehearsal, not deployed.

- Active owner/supervisor authority is rechecked against actual site-scoped staff records.
- Exact publication ID/version, 3-500 character reason and UUID are required. Unknown fields are rejected; stale versions cannot become new withdrawals.
- State, immutable reason record and audit commit together. Matching retries return the original result after lost commit acknowledgements or newer publication; changed reason/version/target conflicts. Old retries never close newer versions.
- PostgreSQL locks briefing before publication, matching replacement order. Prepared real-server duplicate-withdrawal/replacement-race checks have not executed locally.
- New answer/help acceptance closes. Accepted retries and pending assessments continue against frozen evidence. Existing clarifications, snapshots, assignments, receipts and outcomes remain preserved.
- Staff details show reason/time; worker DTOs omit private reasons. Closed assigned versions remain in history and reports.
- Ninth migration adds the ledger without editing prior checksums. Synthetic SQLite cutover preserves it and supports old backups lacking the table.

Browser checked open/cancel only on persistent v3. Reason + checkbox gate confirmation; reason edits clear confirmation. Modal starts on Close; Escape cancels and restores trigger focus. At 320x740: dialog width 281, scroll/client width 264, document scroll width 305; vertical scrolling expected. Captures: `evidence/withdrawal-confirmation-2026-10-04.jpg`, `evidence/withdrawal-confirmation-320-2026-10-04.jpg`.

123 tests: 121 pass, two external PostgreSQL skips. Build passes. Before/after restart hashes match for publication 1, assignments 30, attempts/receipts 26 each, cases 4, audit 15; withdrawal ledger empty. Session 82737 replaces stopped 99357, URL http://127.0.0.1:3020/.

Still missing archive policy, library pagination/lifecycle filters, response drilldown, schedules/reminders, live artifacts, production deployment, real database/TLS/concurrency and full accessibility/reference audit. Not production readiness.
