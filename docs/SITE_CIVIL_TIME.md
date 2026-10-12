# Site Civil Time

Checkpoint: 2026-10-08 16:03 UTC. Local implementation evidence, not a
production deployment or external PostgreSQL concurrency verdict.

## Contract

Publication and optional response deadline use the current site's IANA time
zone, with an explicit UTC alternative. Native datetime fields are read from
FormData. Switching zones clears both fields, repeated-hour choices and
confirmation; it never silently reinterprets an existing value.

The pinned `@js-temporal/polyfill` 0.5.1 resolves civil time. Calendar errors and
DST gaps are rejected, including whole skipped days. Repeated hours require an
explicit first/second occurrence for each field. The selected offset and UTC
instant are displayed before confirmation. Deadline must follow publication.
The API and saved schedules still contain absolute instants: changing a site's
zone after acceptance does not move publication or reminder times. Saved history
shows the zone and numeric offset so repeated civil hours remain distinguishable.
The form and polyfill load lazily; they are not in the main entry bundle.

Primary algorithm references: [Temporal polyfill](https://github.com/js-temporal/temporal-polyfill)
and [ZonedDateTime disambiguation](https://tc39.es/proposal-temporal/docs/zoneddatetime.html).

## Verification

Four focused tests cover Beirut summer/winter and DST boundaries, New York,
Kathmandu fractional offsets, Lord Howe half-hour changes, Apia's skipped day,
calendar/zone/year validation, independent repeated-hour choices and deadline
ordering. A SQLite integrated test freezes a Beirut repeated-hour publication,
deadline and reminder; after changing the site zone, due processing and exact
replay preserve the original instants and execute once.

Full suite 52574: 457 tests, 454 passed, zero failed, three external PostgreSQL
skips (101.902 seconds). Final short mobile labels, stale-error clearing and
history-offset display follow that suite; strict rebuild and native browser
verification follow those changes. Final entry `index-CFrCLXt0.js`:
478.58 kB / 129.65 kB gzip; publication form 172.30 / 49.70 kB gzip.
All 35 public-shell hashes match the built files.

The earlier memory-only browser rehearsal rejected a DST gap, missing occurrence
choices and a reversed deadline with zero schedule/publication POSTs. Zone change
cleared the fields. A runtime transition closed that fixture before final saved
readback, so the final save was repeated on fresh fixture 51687. Native controls
at an actual 320x844 viewport saved publication `2026-11-01T05:10:00Z` and deadline
`2026-11-01T06:50:00Z`. Read-only evidence: one schedule POST, zero publication
POSTs, one queued schedule, zero publications/assignments/reminders. Saved history
shows 01:10 GMT-4 and 01:50 GMT-5, without page overflow (scroll width 305).
Screenshots: `artifacts/site-civil-time/repeated-mobile.jpg`,
`repeated-desktop.jpg`, and `saved-mobile.jpg`. The desktop capture precedes the
final short-label/history-offset changes; the mobile saved capture follows them.
Fixture stopped, tab closed and viewport reset. Reticle has no connected verdict.

All eight selected saved business hashes remain unchanged, SQLite integrity/FKs
pass, and main schedule/reminder/notification-read tables remain empty. Main
development services were stopped by the runtime transition and will be restarted
after the next implementation checkpoint. No cloud, provider, email or real-data
action occurred.

## Remaining

Publish-version confirmation fencing is now verified in `PUBLICATION_VERSION.md`.
Closed-tab mutation recovery, reminder
operations/retention, translated staff controls and broader accessibility checks
remain. Real Neon TLS/concurrency, independent cloud restore, privacy-approved
real speech and full reference/production gates are unverified. Approximately
70% of planned implementation is an estimate, not production readiness.
