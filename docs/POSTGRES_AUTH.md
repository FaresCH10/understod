# PostgreSQL authentication repository

Status: implemented and tested in embedded PostgreSQL and isolated credential HTTP rehearsal, not connected to the default running browser application. Production startup remains blocked. No external database, real identity, email delivery or live provider was used.

`server/postgres/auth.mjs` uses one checked-out client per transaction, scoped queries, server-clock expiry and hashed bearer tokens. Staff login creates its session and audit record atomically. Credential rotation revokes old staff sessions. Active principal, scope, credential and worker grant validity are rechecked on session lookup.

Failed-login counters commit even when login is rejected. Hashed email/IP advisory locks serialize counter changes; five failures in a fifteen-minute window deny further attempts. A successful login clears its email counter, not shared IP failures. This needs real-server concurrency and deployment proxy/IP validation before rollout.

Worker grants are scoped to active workers and an active owner/supervisor. Issue, replacement, redemption and revocation lock the worker before modifying grants. Redemption is one-use; session expiry cannot exceed the grant. Replacement and revocation invalidate prior sessions. Replay does not duplicate revocation audit evidence.

`provisionStaffCredential` is a maintenance function, not a public account-management endpoint. The synthetic backup importer deliberately does not import passwords. A protected operator provisioning procedure and staff invitation/recovery workflows are still required. Raw issued tokens must be delivered privately; passwords, cookies and token values must never enter logs.

`server/auth-crypto.mjs` shares bounded scrypt hashing/verification with existing SQLite authentication. PostgreSQL calls use asynchronous scrypt. Session cookies support opt-in `Secure`; local HTTP defaults stay compatible. HTTPS application integration must enable it.

Verification: four PostgreSQL authentication tests and three existing local authentication tests pass. Checks cover credential compatibility, malformed credentials, generic failed-login errors, persistent throttling, rotation, expiry, tenant/site/role denial, sanitized session output, hashed token storage, one-use grants, idempotent revocation and injected audit-failure rollback. PGlite's sequential transactions do not establish real PostgreSQL wire/TLS/concurrency correctness.
