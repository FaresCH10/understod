# Publication Receipt Recovery

2026-10-08 16:48 UTC checkpoint. Scoped owner/supervisor GET
`/api/briefings/:briefingId/publication-receipts/:kind/:requestId` supports
`publish` and `schedule`. Active staff, account/session and exact site/briefing
authority are rechecked. Unknown or other-briefing/kind IDs return a minimal
`accepted:false`; foreign briefings and unauthorized roles are denied. Query
overrides are rejected and responses use no-store. Infrastructure errors are
sanitized. Reads create no business or audit records.

Accepted receipts expose normalized intent and minimal publication result or
the existing schedule receipt, not source, private rubric, generated audio,
provider details or issuing authority. Earlier accepted publication receipts
remain readable after draft changes/archive; closed schedule acceptance remains
distinct from publication. A queued schedule receipt does not mean it published.

Before POST the browser retains one exact bounded request in sessionStorage,
keyed by server-verified organization/site/staff identity. It retains request ID,
kind, briefing, revision/version, explicit worker IDs and timing/reminder fields,
not worker names, audio, facts or response text. A failed/discarded write prevents
POST; malformed or conflicting pending records block new publication. Storage is
plaintext tab storage, not a private vault, closed-tab guarantee or offline queue.
No silent restoration to a different actor/site is attempted.

Unknown/malformed acknowledgements enter a standalone recovery view, including
after reload or when the draft is no longer ready. Initial reconciliation is GET
only. Exact receipt intent and result must match before clearing the saved record.
Absent or unavailable reads never claim failure or resend. Explicit Retry unchanged
request is offered only after an absent receipt and sends the original complete
body and ID. A definitive rejection permits explicit Return to draft; it does not
publish or cancel a schedule. Successful recovery refreshes the original briefing.

## Verification

Five focused checks pass across SQLite, embedded PostgreSQL, credential HTTP and
client storage: exact/closed receipts, archive, wrong kinds/IDs, revocation, scope,
no-store, query overrides, error redaction, read-only audit and fail-closed matching.
Related subset: 54 passed. Final full suite 90422: 466 tests, 463 passed, zero
failed, three external PostgreSQL skips, 85.555 seconds. Real Neon concurrency/TLS
is not proved by the embedded tests.

Strict optimized build passes: index-UGtMiftI.js 479.71/129.75 kB gzip; lazy
PublishForm 172.99/49.94; recovery 2.40/1.09. All 37 public shell hashes match.

Disposable built fixture 84251: lost acceptance acknowledgement plus receipt
outage, reload and manual reconciliation retain one publication/assignment with
one POST and four GET reads. Final mobile heading/grammar was tightened and the
same saved request reloaded before successful reconciliation.

The next fixture's request-counter listener accidentally consumed the body before
the API reader; its failed retry is not verification. Instrumentation now observes
existing stream events without starting flow. Fresh final fixture 22476 repeats
the before-acceptance interruption/reload/explicit retry: both POSTs have the same
UUID, and exactly one publication/assignment exists. One receipt GET was observed
after reload; an earlier in-flight GET may have been aborted.

The same final fixture then prepares v2 and resets only scenario counters. Lost
schedule acknowledgement/reload/manual GET resolves one queued v2 schedule from
one schedule POST, zero new publication POSTs. The prior v1 publication/assignment
remains the baseline, not a schedule-created result. Publication instant is
2026-10-09T06:00Z (09:00 GMT+3 Asia/Beirut). Actual 320px recovery and history
layouts were inspected; history document scroll width is 305px. Screenshots in
artifacts/publication-recovery: lost-reload-mobile.jpg, unaccepted-mobile.jpg,
retried-mobile.jpg, schedule-reload-mobile.jpg and scheduled-mobile.jpg.

Fixtures stopped, QA tabs closed and viewport reset. Main synthetic/email-disabled
dev session 24382 is running on 3020/3021, browser-verified at original 30/25/22/3/5
counts. Eight business hashes, integrity/FKs unchanged; main schedules/reminders/read
receipts empty. No external provider/email/cloud or real-data action. Reticle has
no connected verdict. Approximately 70% planned implementation, not readiness.
Closed-tab/durable private recovery, interrupted creation/source edits, reminder
operations and broader offline/hardware/deployment/reference/accessibility gates remain.
