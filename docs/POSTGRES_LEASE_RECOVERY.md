# PostgreSQL Connection-Loss Recovery

## Failed Native Run

Run `2e42b143-fa5e-4164-b257-9d8697dcd380` started on 2026-10-16 at
05:38:26.274 UTC, applied91 migrations and admitted three distinct verified-TLS
runtime profiles. Process50079 then exited1 with an unhandled checked-out
`pg.Client` ECONNRESET. The reset's origin is unknown. The original checking
journal is retained unchanged, not a successful test or a running process.

Read-only reconciliation found its one database and three marked logins, with no
active sessions. The original OIDs and outside baseline had been held only in
lost process memory. Fresh user approval authorized only the four newly inspected
resources. Cleanup rechecked their captured OIDs/markers/attributes, disabled
logins, closed the database to new connections, verified no sessions and removed
only those resources. At05:46:30.176 UTC absence was verified. The outside catalog
and ACL fingerprint was unchanged across cleanup. This does not reconstruct or
verify the original run's lost outside baseline.

Evidence remains separate:

- `artifacts/neon-three-roles-2e42b143-fa5e-4164-b257-9d8697dcd380.json`: failed process's stale journal.
- `artifacts/neon-three-role-reconcile-2e42b143-fa5e-4164-b257-9d8697dcd380.json`: read-only observations.
- `artifacts/neon-three-role-cleanup-2e42b143-fa5e-4164-b257-9d8697dcd380.json`: separately authorized cleanup pass.

Both authorizations are consumed. No cloud rerun is included in the repair.

## Local Repair

The shared database helper installs one error listener per physical client for
its lifetime. It tracks failures while a lease is checked out or between queries,
including errors arriving after release. Guarded promise-based queries check
the lease before dispatch and after acknowledgement. A failed or ended connection
cannot return a healthy result or execute another query. Broken clients are
discarded; repeated leases do not accumulate listeners and stale wrappers cannot
query a reused client. Idle pool errors are handled and retained as a failed
pool observation for bounded rehearsal acceptance.

Transactions retain their callback until it settles, then reject a lost lease.
They do not release a client while business/provider work is still awaiting.
BEGIN failures, failed rollback and ambiguous COMMIT acknowledgements discard the
connection. No transaction, business callback, provider request or uncertain
commit is automatically replayed. An accepted write with a lost acknowledgement
still needs the existing exact-intent receipt reconciliation.

Health probes, native identity checks, imports and restore accounting/lock leases
use the same guard. Restore cleanup checks its advisory-lock lease between stages
and refuses a successful verdict after loss. This cannot cancel an already
running external removal; it stops subsequent stages and preserves quarantine.
An EventEmitter/PGlite-authored lock-loss test is not a native lock-failure test.

Future LOGIN journals contain a versioned nonsecret ownership record: original
outside hash, database owner/OID/marker acknowledgement, and each role's original
OID, marker, expiry, memberships and COMMIT acknowledgement status. Observations
are saved before protected workflows and before role COMMIT. A pre-COMMIT record
does not assert the role survived rollback. Passwords and connection URLs are
never serialized. Each checkpoint syncs a new sibling file before atomic rename;
serialization/replacement failure leaves the previous complete checkpoint intact.
Directory durability across machine/power failure is not claimed. A journal is
evidence for reconciliation, not standing deletion permission or proof against
local tampering. Identity/ACL/session uncertainty still refuses deletion.

## Verification Limits

Focused local tests cover idle/leased/late error events, held callbacks, failed
BEGIN/rollback/COMMIT, no replay, stale leases, listener reuse, false-success
acknowledgements, ownership checkpoints, atomic replacement, exact cleanup and
restore lock loss. These do not establish current-policy native concurrency,
network/process-kill recovery, lock starvation, hosted shutdown or release
readiness. Clean verification and preservation results are recorded in the
current build checkpoint. Overall production estimate remains71%.
