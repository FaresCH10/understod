# Authentication and mail admission

Checkpoint: 2026-10-06. Approximate whole-build completion remains 47%; this is not a readiness score.

## Implemented scope

SQLite and PostgreSQL credential login, recovery request/reset and invitation preview/acceptance share a persisted admission ceiling: 1,000 admitted operations per fixed 15-minute window. Existing per-email/token/IP limits remain five for recovery and failed login, ten for invitation preview/acceptance. Login reserves counter slots before password verification; only failures increment its local counters. A successful login clears its email failures, not failures accumulated by the same IP against other accounts.

Admission checks all keys before inserting or incrementing any of them. A blocked IP cannot create arbitrarily many rows by varying recipient email or bearer token. Counter cardinality is capped at 2,500; expired windows are removed at admission. Values are SHA-256 hashes, counts and window timestamps, not raw email/IP/token values. Expiry is request-driven, not yet a scheduled retention job.

SQLite admission is a write transaction. PostgreSQL admission takes one shared advisory lock and sorted key locks; login commits this short reservation before its account/password transaction and rechecks the failure counters there. Recovery token and invitation admission likewise precede password derivation/account locks. These limits intentionally fail closed for valid users too when global capacity is exhausted. Edge/network abuse protection and capacity tuning remain launch requirements.

Both credential-mail queues share a ceiling of 1,000 queued/processing jobs, including expired jobs that have not yet been finalized by a worker. PostgreSQL enqueues serialize their capacity check and insertion with a shared advisory lock; SQLite uses the existing write transaction. Terminal jobs release capacity. Invitation issue rolls back entirely when full; accepted exact replay does not enqueue again. Resend can revoke its previous queued job and replace that capacity atomically. Public recovery returns the same non-enumerating acknowledgement when denied; it is not a delivery receipt. A password reset with no space for its security notice fails before changing credentials, consuming the link or revoking sessions. Capacity release permits a fresh explicit retry with the same live link.

No migration is required. Existing schemas/counters and lazy SQLite mail queues are reused. Email remains disabled in the saved local demo. No actual message, provider call, worker data or cloud resource was used.

## Evidence

- `tests/auth-budget.test.mjs`: both databases reject blocked varying keys without writes, enforce the shared ceiling/cardinality, reserve failure-only counters and remove expired windows.
- `tests/auth.test.mjs`, `tests/postgres-auth.test.mjs`: valid credential denial at global capacity, no PostgreSQL session/audit on denial, retained IP failures and prior origin/session contracts.
- Recovery tests: varied recipient denial, full-queue generic request response, unchanged credential/token/audit after notice-capacity failure, successful retry after capacity release.
- Invitation tests: shared recovery/invitation capacity, atomic rollback, exact accepted replay, one-for-one resend and existing authority/lease/retry checks.
- `tests/postgres-concurrency.test.mjs`: real-server two-connection global/key/mixed-mail oversubscription checks are written, but unexecuted without an explicitly local test PostgreSQL URL. Embedded sequential transactions are not concurrency proof.
- Final full suite rerun: 274 total, 271 pass, zero fail, three external PostgreSQL skips. Strict TypeScript/Vite build passes. No Reticle tools are available, so no Reticle verdict is claimed.
- Ten saved evidence hashes match; SQLite integrity is OK, foreign-key violations zero, saved invitation tables remain absent. Final local web/API restart uses email-disabled session 40872 at ports 3020/3021; intermediate session 8299 is stopped.

## Remaining gates

This is not all-route abuse protection, tenant quotas, provider spend reservation/reconciliation or an incident console. Worker grant redemption, authenticated commands, source/audio/upload workloads and other public/contact routes need their own actual-context limits. Per-tenant/principal fairness and live capacity measurement remain open. Terminal mail/token/audit metadata retention is separate from active-backlog bounds; these queues do not prove a permanently bounded database size. Provider delivery, key rotation, restore, real concurrency, external Neon TLS/wake/quota checks, full accessibility and release gates remain unverified. Neon Free stays the unprovisioned database target with no automatic paid upgrades.
