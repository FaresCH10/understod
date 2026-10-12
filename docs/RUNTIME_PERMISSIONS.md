# Restricted PostgreSQL Runtime And Source Fence

Web/worker connections must use a dedicated, existing, unprivileged login role,
not the migration/schema owner. Hosted API, worker and `hosted:check` now verify
the role before accepting requests or running tasks. The API verification is
read-only and fails closed. Local synthetic rehearsal retains its existing
explicit fixture behavior; it is not a permission bypass for hosted deployment.

This is a service-role boundary, not per-tenant RLS or a complete security review.
Scoped application authorization and immutable evidence guards remain required.
The policy uses PostgreSQL 17+ `MAINTAIN` privilege checks. Native PostgreSQL,
Neon Free/TLS, credentials and pooled-connection evidence remain unverified.
No external role/account/database was created by this checkpoint.

## Configure

Create the dedicated login privately through the approved database administrator.
Never put its password in chat or a command argument. It must have no privileged
attributes, no role memberships (including NOINHERIT memberships) and no owned
objects. Use a separately connected maintenance owner, current migrations and a
dedicated database/schema, with all writers stopped:

```powershell
node --env-file=.env.maintenance scripts/postgres-permissions.mjs configure understood_runtime --dedicated-database --writers-stopped
node --env-file=.env.hosted scripts/postgres-permissions.mjs check understood_runtime
```

These are operator examples, not authorization to connect, provision or deploy.
`configure` revokes database PUBLIC CREATE/TEMP and target-schema PUBLIC table/
sequence privileges, so it must not be used on a shared database without review.
It grants only the current explicit application table allowlist. Migration,
SQLite import, bootstrap and restore journals are read-only; unknown/future tables
and unrelated sequences get no grants. Ordinary application tables retain DML;
TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, grant options and sequence UPDATE are not
allowed. Existing SQL evidence guards still reject immutable evidence changes.

No runtime credentials are created/rotated. No business rows are changed.
Everything runs in one transaction, including post-setup verification. Unsafe
existing role attributes, memberships, ownership, column grants, executable
security-definer routines or unexpected default grants cause rejection/rollback.
The command does not silently strip membership or change an existing identity.

Maintenance-owner default grants to PUBLIC/runtime on future tables, sequences
and functions are removed. This affects that owner's future objects in the
dedicated database. Review other object-creating owners separately. A future
migration requiring new runtime access needs an explicit policy update and
maintenance reconfiguration, never automatic ALL TABLES default grants.

## Fence Source Writers

After stopping **every API, worker, storage-cleanup and maintenance writer**, pause
jobs/providers, wait for shutdown observations and outstanding leases to expire.
List every dedicated source runtime identity, including separately credentialed
workers. Then, with the source maintenance connection/schema selected:

```powershell
node --env-file=.env.source-maintenance scripts/postgres-fence.mjs seal understood_web,understood_worker --writers-stopped
node --env-file=.env.source-maintenance scripts/postgres-fence.mjs check understood_web,understood_worker
```

The seal uses the same full-table locked backup snapshot, migration advisory
lock, global pause/worker-shutdown/lease checks as backup. It first verifies every
listed role's restricted policy, then atomically revokes all application-schema
write/trigger/maintenance privileges and sequence advancement. SELECT remains for
inspection. ACL revocation persists after commit and process restart. The command
does not modify source business rows, manufacture acceptance receipts, migrate
the database, remove objects or activate a target.

After sealing, hosted startup must fail its normal writable-runtime check.
Already connected source roles cannot accept an answer, allocate a receipt,
claim a job, update a heartbeat or start cleanup through the fenced schema.
Every role is admitted before any revocation; a failure rolls everything back.
Live checks reject later table/column/sequence grants, creation authority,
memberships, ownership, definer functions and future automatic grants.

This is a **runtime-role write fence**, not a complete final cutoff receipt:

- The supplied list must include every actual runtime identity. It is not inferred
  from historical connections, and omitted identities are not certified.
- Database administrators/maintenance owners retain privileged authority and must
  remain stopped. Direct bucket credentials are not revoked by a database ACL.
- The command does not authenticate a backup/source host identity or persist an
  immutable cutover journal. Full backup/ledger matching and fresh private-object
  verification in SOURCE_CUTOFF.md are separate required steps. That command's
  optional `--runtime-roles` binds live before/after checks into the authenticated
  backup/source observation, without elevating it to a final release receipt.
- A restore does not automatically acquire safe runtime roles/ACLs. Exact target
  state accounting, private readback, native concurrency/backup drills and a
  separately authorized release are still required.
- Re-running writable `configure` deliberately reverses runtime revocation. Do
  not do this on a sealed source unless abandoning cutover with explicit approval.
  No automatic resume/unseal operation exists.

All fence results retain `sourceCutoffEstablished`, `activationAllowed` and
`productionReady` false. `runtimeWriteFenceVerified` only describes the checked
listed roles in that schema. Never use it alone to release a target.

## Evidence

Disposable PGlite tests execute real SQL ACLs and real typed-answer acceptance,
not a mocked privilege decision. They check blocked DDL, trigger disabling,
TRUNCATE, restore/migration journal mutation, grant delegation, receipt sequence
rewrites, unknown/future-table access and retained immutable guards. Permission
setup rejects unsafe identities atomically; source revocation survives commit,
blocks actual submission/worker writes, leaves the full business inventory
unchanged and detects later privileged ACL drift. Hosted synthetic HTTP tests
exercise credential login, overview and logout as the restricted role and reject
schema-owner startup. Session authorization changes are a fixture mechanism,
not native network/password-authentication proof.

PostgreSQL references: [Privileges](https://www.postgresql.org/docs/current/ddl-priv.html),
[Role Membership](https://www.postgresql.org/docs/current/role-membership.html).
