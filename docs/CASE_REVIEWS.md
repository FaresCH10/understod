# Private Case Reviews And Deadline Changes

20 October 2026 continuation: captured paged contracts, canonical v2/legacy
receipt recovery, draft preservation and site-timezone/DST input are implemented
locally. See CASE_WORKFLOW_RECOVERY.md for current evidence and limits. The
device-timezone UI description and build statistics below are historical.

2026-10-10 checkpoint, PostgreSQL migration 061. Not a production-readiness
declaration. SQLite parity and broader release verification remain.

Owners and supervisors can change an open case's follow-up deadline, separately
from worker assignment and repeat-answer deadlines. Each change appends an
actor/site/case-bound record and audit event. Commands carry the previously
observed effective deadline; stale edits are rejected. Case locking precedes a
fresh ledger read. Deadlines must be future UTC within 30 days. Overdue filters
and automatic escalation use the latest override, without editing original
routing evidence or repeating an already-recorded escalation.

Disagreement appends a supervisor-only reason tied to the original assessment,
including after human resolution. It does not change an answer, AI outcome,
case state, receipt or assignment metric. Help-only cases without an assessment
cannot record an assessment disagreement. Worker conversations do not expose
private reviews. Authorized deletion redacts disagreement text while retaining
receipt identity and audit metadata; arbitrary mutation/deletion is rejected.

The case view exposes native date/time input with device timezone, private reason,
history, draft clearing and exact receipt checks. Session storage contains only
UUID, kind and hash, never disagreement text. Unknown delivery never resends
automatically. Explicit retries must match the original hash. The displayed
owner deadline updates after confirmed receipt. Message/review recovery keys
remain isolated.

## Evidence

- Review, recovery, routing, deletion, embedded migration and populated import
  regression: **25 passed, zero failed/skipped**, 18.803 seconds. Earlier eight
  checks overlap and are not additional unique coverage.
- Strict TypeScript/optimized build pass. Entry 538.19 kB / 144.57 kB gzip;
  existing size warning remains for final performance work.
- Built disposable credential browser verifies lost deadline acknowledgement,
  failed readback, GET-only recovery, displayed effective deadline, disagreement
  save and durable history after successful reload. Reload attempted with an
  unsent date draft did not visibly replace the document, so pending-command
  reload is not browser-proven. Metadata reload/isolation has unit coverage.
- Graceful fixture shutdown: two POSTs/two receipt reads, one deadline review,
  one disagreement, one assignment/case/answer receipt and unchanged original
  attempt hash. Desktop screenshots inspected inline, not saved as release
  artifacts. QA tab closed/fixture stopped. Reticle unknown/unconnected; its
  automatic dev wiring/dependencies removed. No Reticle pass claimed.
- No external provider, real worker data, cloud/mail/deployment or paid operation.

Voice help/replies, SQLite parity, privacy-approved live processing, actual
Neon/private-storage/TLS/backups and complete reference/mobile/accessibility/
security/concurrency/release verification remain. Percentage unaudited; goal
active with automatic continuation.
