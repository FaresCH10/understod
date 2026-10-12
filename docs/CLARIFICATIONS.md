# Clarification checkpoint

2026-10-10 update: new help/assessment cases now have scoped contact routing,
independent 24-hour deadlines and one-time deputy escalation. Legacy cases are
not backfilled. The browser shows deadline/escalation and uses the deadline in
overdue filters. Ninety final focused regression checks pass, including populated
cutover. See CASE_ROUTING.md for boundaries and native evidence. The earlier
evidence below is historical; translated conversation/disagreement remain open.

Both local SQLite and isolated PostgreSQL HTTP use one paged queue/detail/owner/resolution contract. The default browser is still SQLite. This completes selected behavior, not S14/S15 or production readiness.

- Scoped staff/auditor reads; active owner/supervisor writes. Worker and foreign-site reads/writes are denied.
- Server-backed search, status, owner (`mine`/`unassigned`), assignment-overdue filters and 20-row browser paging. Maximum 50 rows/page, 5,000 matching cases before requiring narrower filters.
- Topics come from frozen publication content. PostgreSQL language is frozen at assignment; SQLite still uses current preference. No real historical language is inferred.
- Details preserve the original assessment/attempt even when it falls outside the latest 100 attempts. Recording playback uses that original submission's private recording ID, not the newest recording. Full history pagination remains open.
- Help is independent of an answer: immutable separately stored worker text, exact request/body replay, no attempt/receipt or report response increase. New help requires available published content but may occur after the answer deadline. Accepted retries can replay after withdrawal.
- Case ownership and explicit resolution audit atomically. Audit failure rolls back the change. Resolved notes/status/owner cannot be overwritten; resolution does not change the assessment or certify understanding.
- Worker status DTOs expose only own case status/help text/owner/time, not private notes, rubrics, reasons or other workers. The status endpoint exists; worker history UI is not yet wired.
- Startup copies known original text from still-open legacy independent help cases into `help_requests` without rewriting case notes. Already-overwritten resolved legacy text cannot be recovered. Older seeded help-like attempts remain unchanged rather than being reclassified.
- Synthetic backup import supports the new optional help table and preserves resolved help text when it was separately retained.

`tests/clarifications.test.mjs` has four scoped evidence/replay/filter/HTTP/rollback checks. PostgreSQL domain/import tests check the corresponding repositories and cutover. Full suite: 101 tests, 100 pass, one external-PostgreSQL skip. Browser read/filter/detail inspection preserved four open cases and 30/25/22/3/5 report metrics; no existing case was resolved for testing.

Remaining: translated follow-up conversation/audio, supervisor disagreement/escalation, case-specific deadlines, runnable PostgreSQL/default-browser cutover, real-server concurrency, full reference/accessibility and physical audio checks. Reticle is unconnected and provided no verdict.
