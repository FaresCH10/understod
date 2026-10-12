# Exact-Version Publication

2026-10-08 16:20 UTC checkpoint. New publication requests require an explicit
positive safe-integer `nextVersion`, matching the prepared draft under its
transaction lock. Revision alone is insufficient: publication advances version
without changing revision. A stale confirmation returns 409 `Draft version changed`
and creates no publication, assignments or audit record.

SQLite and PostgreSQL share input validation. PostgreSQL rechecks after asynchronous
private generated-audio reads, before acceptance. Scheduled publication carries
its already-frozen version through the same guard. No schema or stored schedule
payload rewrite is needed.

Exact accepted request replay remains valid after draft changes. Historical
versionless requests replay only their original immutable receipt; a new
versionless request is rejected. Changed version or any other changed receipt
payload conflicts. Scope and active authority are checked before replay.

The browser sends the displayed version for immediate and scheduled publication.
Version/revision conflicts clear confirmation and disable the stale form. Explicit
Refresh draft reads the current draft and remounts a fresh form with no selection
or confirmation. It never publishes automatically. Reload/closed-tab mutation
recovery is still incomplete. Subsequent tab-local exact receipt recovery is
documented in `PUBLICATION_RECOVERY.md`; it does not guarantee closed-tab recovery.

## Evidence

Final full suite 53307: 461 tests, 458 passed, zero failed, three external
PostgreSQL checks skipped, 84.414 seconds. Includes SQLite/embedded PostgreSQL
input, stale-version, exact replay, historical receipt, HTTP status and private
audio race regression checks. An external same-version concurrency assertion
was added but skipped without a real test database; no Neon concurrency claim.

Final strict optimized build: entry index-2AmiesEw.js 478.58 kB / 129.65 kB gzip;
lazy PublishForm 172.56 / 49.77 kB. All 35 public shell hashes match.

Disposable built memory-only fixture 38071: two tabs hold ready v1/revision 1.
One publishes one worker; synthetic preparation makes v2 ready at revision 1.
The old tab's v1 request fails. Native Refresh draft reads v2 and clears selection.
Read-only counters: two publication POSTs, one publication, one assignment.
Actual 320px viewport has 305px document scroll width and contained error/actions.
Saved and inspected screenshots: artifacts/publication-version/stale-desktop.jpg,
stale-mobile.jpg and refreshed-mobile.jpg. The refreshed capture is scrolled to
selection; the DOM separately confirms v2. Fixture stopped, tabs closed, viewport
reset. No connected Reticle verdict is available.

Main synthetic/email-disabled dev session 67162 restored at 3020/3021 and browser
verified at its original 30/25/22/3/5 counts. Eight selected business hashes,
integrity and foreign keys unchanged; main schedules/reminders/read receipts empty.
No cloud, real-data, provider or email action occurred. Approximately 70% planned
implementation, not readiness. Deployment, real database/storage recovery,
offline/hardware, reference and accessibility gates remain.
