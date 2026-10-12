# Scheduled Briefing Library

## Contract

The existing library now accepts `scheduleStatus` of all (default), none, queued,
published, cancelled or failed. Publication and draft status remain independent.
Within each scoped briefing, a queued schedule takes priority over previous
terminal schedules; otherwise the latest created schedule wins, with ID as the
stable tie-breaker. The DTO adds only schedule state and planned UTC time, never
frozen authority, private facts or recipient details. Existing search, sort,
paging, role and organization/site boundaries still apply.

## Verification

- Two backend HTTP tests cover SQLite and embedded PostgreSQL: every state,
  combined filters, queued priority with timestamp ties, privacy, foreign scope,
  auditor reads, revocation, invalid input and read-only bounded paging.
- Populated backup/cutover test preserves all columns for four schedule states
  and five queued/visible/skipped reminder rows. Exact import and schedule replay
  do not duplicate rows; the due PostgreSQL processor creates one publication,
  one assignment and one new reminder once. Terminal guards remain enforced.
- Full suite 37970: 453 tests, 450 passed, zero failed, three external PostgreSQL
  skips, 88.866 seconds. Strict build: index-CyMG8AqW.js 499.61 kB / 135.48 kB
  gzip. All 32 public-shell hashes verified.
- Disposable built-app fixture: one schedule POST and one cancellation POST;
  zero immediate publication POSTs, publications or assignments. Queue and
  cancellation library results show the correct state and queued UTC time.
  Actual 320px cancellation screenshot is contained. The fixture's queued-empty
  observation was captured while loading, so that specific result is not claimed
  there; the restarted main app independently verifies its empty queue.
- Screenshots: `artifacts/scheduled-library/queued-desktop.jpg`,
  `cancelled-mobile.jpg`. `queued-mobile.jpg` shows only the filter portion.
- Fixture 42530 stopped, QA tab closed, viewport reset. Main 14973 intentionally
  runs synthetic/email-disabled on 3020/3021. Native no-schedule result preserves
  the original briefing; overview remains 30/25/22/3/5. Eight selected business
  hashes, integrity and foreign keys unchanged; schedules/reminders/read receipts
  remain empty on the saved main database.

## Remaining Gates

Approximately 69% planned implementation, not production readiness. Site-local
time/DST entry, closed-tab staff mutation recovery, reminder operations/retention,
full reference/accessibility checks and real Neon TLS/concurrency/cloud restore
remain. Reticle has no connected verdict. No real worker content was sent to
Gemini free tier and no external service/account/email action occurred.
