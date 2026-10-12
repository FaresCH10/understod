# Fresh synthetic workspace

Migration 053 and `node scripts/postgres-operator.mjs --bootstrap-workspace` provide an explicit maintenance path for an empty, already-migrated PostgreSQL staging/rehearsal schema. They do not provision a database/schema, connect an account, publish an endpoint or enable real data. No public/customer bootstrap endpoint or default password exists.

The command uses the same validated environment as its runtime: hosted synthetic staging from `.env.hosted.example`, or isolated local synthetic credential rehearsal from `POSTGRES_RUNTIME.md`. Apply migrations explicitly with a maintenance database role, then use the runtime role for web/worker. Do not give web/worker schema creation rights. Actual role/grant verification remains a deployment gate.

Send at most 4 KiB of UTF-8 JSON over standard input from a trusted secret manager or controlled local process. Do not put passwords into command arguments, source files, logs or shell history. Required fields:

| Field | Value |
| --- | --- |
| `requestId` | A new UUID retained for exact recovery |
| `confirmed`, `synthetic` | Both literally `true` |
| `organizationName`, `siteName` | Nonempty validated names, at most 120 characters |
| `timezone` | Valid IANA timezone |
| `generationLanguages` | Supported unique language codes, including `en` |
| `supportEmail` | Valid email or empty string |
| `owner` | Exactly `name`, `email`, `password`; synthetic identity only |

Owner passwords use the existing 12-256-character credential contract and salted scrypt. The command emits only generated organization/site/owner IDs, duplicate status and synthetic data classification. Input buffers are wiped in `finally`; JavaScript strings cannot be securely zeroed, so do not treat this as guaranteed process-memory erasure.

One transaction creates the organization, first site, settings, first owner, credential/account membership, primary contact, immutable request receipt and audit event. No workers, publications, grants or fake operational history are seeded. The owner can use the normal credential sign-in and existing resumable pilot setup. Provider and live language prerequisites remain unverified.

Exact retries return the same IDs with no writes, credential rotation, new session or new audit event. Changed fields/password conflict. Existing owner email conflicts instead of attaching/taking over another account. After credential rotation, the old bootstrap cannot restore the previous password. Lost responses require the original request and password; do not invent a new request ID. Use the separate credential-maintenance procedure for rotation.

The SQLite cutover refuses a target containing bootstrap receipts instead of overwriting them. `tests/workspace-bootstrap.test.mjs` proves input rejection before database access, fresh owner login/settings/onboarding, exact replay, account/tenant isolation, immutable receipts, rotation protection and complete rollback/recovery after audit failure using disposable PGlite. Real PostgreSQL concurrency, CLI secret-manager integration, cloud deployment and full browser/reference checks remain unverified. Site creation/archive/access lifecycle and complete S07/S26 remain open.
