# PostgreSQL backend groundwork

Status: schema, adapter, synthetic backup importer and repositories execute in embedded PGlite and an isolated authenticated HTTP rehearsal; **not integrated with the default browser application or verified against a PostgreSQL server over the `pg` wire protocol**. The default web API/worker still use synchronous SQLite. Production startup must remain blocked. This work addresses parts of A02, A05, A08 and A18; it is not a completed production database gate. See `POSTGRES_DOMAIN.md` and `POSTGRES_CUTOVER.md`.

## Files and prerequisites

- `server/postgres/migrations/001_initial.sql`: tracked initial schema for the current briefing/crew/assignment/attempt/clarification/job/auth/audit/recording domain.
- `server/postgres/migrations/002_submission_receipts.sql`: additive, ordered typed/audio submission receipts with assignment/organization scope and immutable updates.
- `server/postgres/migrations/003_exports_imports.sql`: scoped durable export/import records, frozen request evidence and a synthetic cutover receipt.
- `server/postgres/migrations/004_audit_read_only.sql`: normal-use audit update/delete rejection.
- `server/postgres/migrations/005_typed_assessment.sql`: pending attempts, frozen original assessments, durable assessment jobs and publication request replay.
- `server/postgres/migrations/006_preparation_leases.sql`: token-fenced preparation and interrupted-job reset.
- `server/postgres/migrations/007_assignment_language.sql`: frozen recipient language; legacy synthetic rows use cutover preference, not verified real history.
- `server/postgres/migrations/008_clarification_evidence.sql`: independent immutable help text and resolved-case evidence guards.
- `server/postgres/import-sqlite.mjs`: verified synthetic backup import, default data rollback, explicit commit/replay and empty isolated target only.
- `server/postgres/reports.mjs`: active staff/site recheck and repeatable-read publication report; wired to isolated rehearsal HTTP, not the default app.
- `server/postgres/auth.mjs`: transactional credentials, sessions, throttling and one-use worker grants; connected to isolated rehearsal HTTP, not the default app. See `POSTGRES_AUTH.md`.
- `server/postgres/domain.mjs`, `recordings.mjs`, `assessment-worker.mjs`, `recording-worker.mjs`: publication, ordered typed/private-audio receipts and bounded frozen-rubric assessment. Connected to isolated rehearsal HTTP, not the default app. See `POSTGRES_DOMAIN.md`.
- `server/postgres/preparation.mjs`, `read-models.mjs`, `people.mjs`, `http.mjs`: revised drafts, private-safe DTOs, scoped directory and isolated credential HTTP rehearsal. Twenty-seven focused domain/HTTP tests; default app not switched. See `POSTGRES_DOMAIN.md`.
- `server/postgres/audit.mjs`, `clarifications.mjs`, `worker-import.mjs`, `exports.mjs`: scoped metadata history, independent help/resolution, explicit all-or-none CSV import and frozen lease-fenced exports. Connected to isolated rehearsal HTTP; frontend contract cutover and runnable PostgreSQL services remain open.
- `server/postgres/migrate.mjs`: transactional migration runner with advisory lock and SHA-256 checksum verification. It refuses a changed applied migration.
- `server/postgres/db.mjs`: `pg` pool creation and same-client async transaction helper.
- `tests/postgres.test.mjs`: migration-content/runner/transaction/config checks without a database.
- `tests/postgres-embedded.test.mjs`: actual migration SQL, replay/checksum and scoped-constraint checks in PGlite's PostgreSQL WASM engine.
- `tests/postgres-live.test.mjs`: opt-in, isolated real-PostgreSQL scope/immutability check.

Requires Node 24+ and the **`pg` runtime dependency**. `pg` 8.23.1 was subsequently installed in the workspace by the lead; pool construction was checked without a network connection. There was no `psql`, `postgres`, `pg_ctl`, Docker, PostgreSQL service, `DATABASE_URL` or PostgreSQL test URL available in the local environment. No system installation or hosted resource was attempted. `pg` is imported only when opening a real pool, so the static tests remain runnable without it.

Connection configuration uses `UNDERSTOOD_POSTGRES_URL`. A non-loopback host requires `UNDERSTOOD_POSTGRES_TLS=true`; `UNDERSTOOD_POSTGRES_CA_FILE` can name a trusted CA file. The URL must not include `sslmode`, `sslcert`, `sslkey` or `sslrootcert`, because node-postgres can replace an explicit TLS object when those URL parameters are present. TLS certificate verification stays enabled. Supply secrets through a protected environment, never source or logs. See [node-postgres TLS guidance](https://node-postgres.com/features/ssl) and [transaction guidance](https://node-postgres.com/features/transactions).

## Migration usage

After a PostgreSQL database and `pg` are explicitly provisioned, set `UNDERSTOOD_POSTGRES_URL` and run:

```powershell
node server/postgres/migrate.mjs
```

The default schema is `public`; set `UNDERSTOOD_POSTGRES_SCHEMA` to an existing schema name if needed. The runner creates `schema_migrations`, locks this schema's migration stream, applies pending numbered `.sql` files in one transaction and stores checksums. Do not edit a migration that has been applied; add a new numbered migration. Back up the database and dry-run on a disposable copy before a production migration. The runner does not create the database, schema, role or backup.

Run non-DB tests with:

```powershell
node --test tests/postgres*.test.mjs
```

To run the real-DB test, use an explicitly disposable **local** database whose name contains `test`, and set `UNDERSTOOD_PG_TEST_URL`. The test creates a random schema, migrates it twice, checks cross-tenant and cross-site foreign-key rejection, crew and grant scope, recording receipt consistency and publication immutability, then drops only that random schema. It skips when no approved URL is set. Do not point this test at production.

## Current schema contract

Primary keys remain `text` so the current fixture IDs and generated UUID strings fit without coercion. Tenant-owned relationships use composite foreign keys including `org_id` and, where applicable, `site_id`; a globally unique row ID cannot be paired with another tenant or site in a dependent row. `attempts` and `clarifications` gain an explicit `site_id` compared with SQLite, allowing their assignment/owner/attempt references to be checked in the database. Publications and assignment snapshots reject changes to frozen identity/content/recipient fields after insertion; publication lifecycle `state` and assignment `due_at` remain updatable. Retention deletion still requires a separately authorized lifecycle.

PostgreSQL stores booleans as `boolean`, times as `timestamptz`, and prepared/snapshot/reason data as `jsonb`. The existing SQLite modules assume integer flags, ISO text and JSON strings. An adapter or domain-port rewrite must convert those shapes explicitly; this migration is not a drop-in replacement for `DatabaseSync` or positional `INSERT` statements. `sessions` retain `principal_type`/`principal_id`; a trigger checks the referenced principal scope, while composite keys bind credential worker sessions to the issuing grant. The API must still check active/revoked/expired principal, tenant/site, grant and session on every operation. The database does not decide whether a bearer link proves a worker's real-world identity.

`recordings.received_at` remains null until private object storage commits; the `received`, `processing`, `blocked` and `transcribed` states require it. A failed storing upload may have no receipt and must not be counted as received. `lease_token` is reserved for compare-and-swap worker completion so an obsolete worker cannot finalize another lease. Set status and receipt timestamp in the same transaction; a `storing -> received` status-only update will violate the check.

`submission_receipts` uses a `bigint` identity sequence to choose the latest typed or audio submission even when timestamps tie. Its composite foreign key binds each receipt to the assignment's organization, its `(assignment_id, submission_id)` key rejects duplicates, and updates are prohibited. A successful typed answer or stored audio inserts its receipt in the same database transaction as the accepted submission state. The synthetic importer preserves existing SQLite receipt order and refuses missing receipt evidence; it does not invent a legacy backfill. Shared comparisons use `BigInt`, because node-postgres returns bigint strings. Async submission repositories lock the assignment before inserting competing receipts; real-server concurrent writes still need verification.

The migrations cover the present implemented model, including crews/imports/exports. They do **not** yet add all specified future entities (inquiries, outbox, schedules, template/glossary revisions, usage reservations, retention, invoices/payments). Add numbered migrations as those behaviors are implemented. They also do not enable row-level security; production integration must use a dedicated least-privilege application role, parameterized scoped queries, negative route/join/file/job tests, and decide whether/how to enforce RLS without breaking pre-auth credential lookup. Composite keys protect referential scope but are not a substitute for read authorization. Audit immutability triggers are not protection against DB administrators.

## Integration path and gates

1. Install and lock a supported `pg` version; obtain an explicitly authorized local PostgreSQL test database. Run the real-DB test and fix any SQL/runtime defects before claiming migration verification.
2. Align browser contracts with the implemented async repositories and add runnable PostgreSQL API/worker services. Keep one checked-out client for each transaction; quota/outbox workflows are not yet implemented.
3. Port seed/demo setup to PostgreSQL without live users/credentials. Convert `jsonb`, `timestamptz`, booleans and the new `site_id` columns intentionally. Verify two-tenant denial and exact-version immutability on the real DB.
4. Add scoped runtime role/grants and any RLS policy chosen for the deployment model. Test allowed and denied collection/detail/join/storage/job/export paths, including privileged service paths. Do not expose the migration-owner role to the web process.
5. Verify the implemented durable import/export workflows on the real server and add missing outbox/schedule/usage/retention entities before turning on production writes. Migrate and test backup plus object restore. Configure separate private durable audio storage and authorized live AI. Only then revisit the production startup gate.

**Actual checks at writing:** the full suite has 101 tests, 100 passing and one external-PostgreSQL skip. Embedded checks apply all eight migrations in PGlite 0.5.8 (PostgreSQL 18.3), replay them, reject checksum drift and enforce scoped relationships and immutable evidence. Twenty-seven domain/HTTP checks and four auth checks execute isolated workflows. Three importer/order checks cover backup import, rollback, report parity, replay and preservation of legacy open-help text and separately saved resolved-help evidence. No `pg` wire query, TLS, concurrent server transaction, production backup/restore or deployment was verified.

PGlite is installed as a dev-only dependency for embedded SQL checks. It does not verify this `pg` pool, TLS, server concurrency, restore or deployment. Its optional socket server is a separate dependency and documents no SSL and limited concurrent-connection behavior. Retain the real PostgreSQL gate. See [PGlite API](https://github.com/electric-sql/pglite/blob/main/docs/docs/api.md) and [PGlite socket limitations](https://github.com/electric-sql/pglite/blob/main/packages/pglite-socket/README.md).
