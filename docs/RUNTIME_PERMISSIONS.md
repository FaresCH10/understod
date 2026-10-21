# Restricted PostgreSQL Runtime And Source Fence

20 October2026 schema095 extends the existing case_voice journal for private
staff-authored in-person audio. Worker permission is now SELECT plus lifecycle/
cleanup UPDATE columns only, with no INSERT/DELETE or author/receipt clock
authority. Current catalog remains139 tables: worker84 ordinary-DML/ten
column-restricted/34 read-only/11 hidden. Application/operator table grants are
unchanged. Exact voice guard and broad-grant drift checks are required before
startup. Separate API/worker local tests pass; the full current clean checkpoint
is recorded in BUILD_STATUS.md. Native91 does not accept095. No cloud migrations
or grants changed. See STAFF_CASE_RECORDINGS.md. Earlier entries are historical.

20 October2026 schema94 adds the immutable staff clarification creation journal.
It is application-writable under its guards and hidden from worker/operator
profiles. Catalog139 tables: application120 writable/12 read-only/7 hidden;
worker94 write-capable/34 read-only/11 hidden; operator19 writable/19 read-only/
101 hidden. Existing nine worker column-restricted tables are included in94,
not granted unrestricted DML. Local clean8be48ec7 and actual SQL denials pass;
no native/cloud grants or schema changed. Historical native91 does not accept94.
See STAFF_CLARIFICATION_CREATION.md. Earlier policy checkpoints below are history.

20 October2026 worker cleanup continuation: case_reviews now has SELECT plus
UPDATE(reason) only; case_repeats has SELECT plus UPDATE(status) only; the worker
has no review-sequence privileges. Exact current evidence guards are required
at setup/startup. This is a new ACL/inspection policy on schema093, not a native
acceptance or schema migration. Stop writers and reconfigure through separate
maintenance before rollout; broader preceding grants deliberately fail startup.
See WORKER_CASE_WORKFLOW_PERMISSIONS.md for evidence, trusted-status-operation
limits and remaining row/read restrictions. Application/operator grants unchanged.

2026-10-20 local source adds migration093, immutable scoped clarification-action
receipts. Application policy138 tables:119 writable/12 read-only/seven hidden.
Worker:94 writable/34 read-only/ten hidden; operator:19 writable/19 read-only/
100 hidden. Neither worker nor operator may read or write action receipts.
Historical populated import and current embedded role checks pass; clean99969805
passes1,254 tests/1,250 pass/zero fail/four native skips. No Neon migration or
grant changes occurred. Native91 evidence does not establish current92/93
acceptance or complete least privilege. See CLARIFICATION_ACTION_RECOVERY.md.

2026-10-19 current source adds migration092: worker staff/account/credential/
access-revision UPDATE permissions are immutable lock columns only, and account
memberships are SELECT-only. Required recovery/invitation jobs, API reset/signup,
populated upgrade and schedule/fence checks pass locally. Fresh clean b8ad7ba7
passes1,215 tests/1,211 pass/zero failures/four native skips, build and scripted
evaluations (exec63134 exit0). See WORKER_IDENTITY_PERMISSIONS.md for scope and limits.
No existing Neon schema or grants changed; preceding native91 evidence is not
current-policy native acceptance.

2026-10-19 locally verified source adds worker SELECT plus immutable UPDATE(id) only for
organizations/sites, shared exact guard/positive-column inspection, no restricted
sequence grants and expanded source fencing. Four new tests and the extended
fence pass; clean6c284a4b passes1211tests/1207pass/zero fail/four native skips,
build and scripted evaluations. No Neon ACL or schema change.
See WORKER_LOCK_PERMISSIONS.md; earlier native results do not prove this policy.

2026-10-19 locally verified source further restricts templates,template_versions,
glossary_terms andglossary_versions toworker SELECT only. Application grants and
migrations unchanged. Embedded populated-library/preparation/drift checks pass;
clean6a316e16 passes1207tests/1203pass/zero fail/four native skips,build and
scripted evaluations. No current-role Neon test orcloud reconfiguration authorized. Earlier
native91 evidence below covers the preceding worker library-write policy,not
these new restrictions. Broader column/verb hardening remains open.

Current native status: separately approved retry6a30573b passed current91
three-role admissions,positive denials,API/worker workflow,keyless queue and
mixed-role write fence with unchanged inventory. Exact resources removed;
independent read-only postcheck confirms absence and original outside baseline.
See NEON_THREE_ROLE_ACCEPTANCE.md. The first failed run remains historical.
Broader worker positive column/verb restrictions and hosted/failure gates remain.
No further cloud mutation authorized.

## Historical Checkpoints

2026-10-16: the distinct three-role rehearsal CLI/default exercise now covers
current91-policy admission before fixture writes,all-three-profile guard drift,
keyless queue/pause/rotation/expired queued approval and all-role source fence.
Its heartbeat SQL fault function and worker-only EXECUTE grant exist only inside
the new disposable test schema and are removed afterward. Production profiles
and guard bodies are not relaxed. Local clean d6b611b6 passes1173tests1169pass/
four native skips/zero fail; native authorization/current-policy proof pending.
See NATIVE_THREE_ROLE_PREPARATION.md for exact scope and remaining failure gates.

2026-10-16 heartbeat checkpoint adds no grants or migration (137tables/91).
Worker health/capability now publish atomically using the existing role, with
serialized five-second liveness,dispatch/result failure fences and terminal
drain. Legacy application profile does not gain capability-table access.
Clean650e1447 passes1163tests1159pass/four native skips/zero fail; this is local
PGlite evidence,not current-policy native/three-login acceptance.
See WORKER_HEARTBEAT.md and NATIVE_THREE_ROLE_PREPARATION.md.

Web/worker connections must use a dedicated, existing, unprivileged login role,
not the migration/schema owner. Hosted API, worker and `hosted:check` now verify
the role before accepting requests or running tasks. The API verification is
read-only and fails closed. Local synthetic rehearsal retains its existing
explicit fixture behavior; it is not a permission bypass for hosted deployment.

This is a service-role boundary, not per-tenant RLS or a complete security review.
Scoped application authorization and immutable evidence guards remain required.
The policy uses PostgreSQL 17+ `MAINTAIN` privilege checks. Prior native Neon
PostgreSQL18 direct-login/TLS evidence is recorded in NEON_LOGIN_REHEARSAL.md;
it initially covered the combined application profile only. The worker profile
has separate, explicitly labeled local and native evidence below. These are not
proof of deployed service isolation or a full least-privilege policy.

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

For a separate worker login, configure and check the explicit worker profile:

```powershell
node --env-file=.env.maintenance scripts/postgres-permissions.mjs configure understood_worker --profile=worker --dedicated-database --writers-stopped
node --env-file=.env.worker scripts/postgres-permissions.mjs check understood_worker --profile=worker
```

The application profile currently allows DML on118 tables, read-only access
to12 tables and no access to seven operator identity/session/throttle/audit/permit/job/capability
tables (`platform_operators`, `operator_sessions`, `operator_auth_attempts`,
`operator_audit`, `provider_verification_authorities`, `provider_verification_jobs`, `provider_verification_workers`). Control tables `operator_requests`, `provider_verifications`,
`tenant_controls`, `system_controls` and `provider_policies` are read-only.
Existing application roles
retaining grants on those tables or columns fail startup and need explicit
maintenance reconfiguration with writers stopped; no target ACL is changed by
this source update. The new denials have embedded SQL proof only; earlier native
application evidence covered older policies. The worker profile allows DML on87 tables,
SELECT and UPDATE on only seven transition/result columns of the verification
job table (no metadata updates, INSERT or DELETE), plus SELECT and immutable
UPDATE on immutable identity keys only on organizations/sites/staff/staff_accounts/
staff_credentials/staff_access_revisions,
read-only access to34 and no access to nine billing/operator/verification
tables. It cannot modify provider policy, system/tenant controls, operator
identity/session records, billing records or administrative request receipts.
It retains credentials/staff/access locks and mail/expiry/retention writes needed
by registered tasks. This is deliberately described as partial: finer positive
verb/column allowlists remain open for application/worker. The separate operator
profile now uses positive column/verb grants on38 tables (19 include some write
authority,three of those only immutable lock columns),hides99 and has no sequence
access. The ledger is worker-readable only and operator-revocable only, with an
operator INSERT grant restricted to the nested invoker approval-capture trigger;
no worker access to private operator sessions/identities or verification rows.
All profiles verify seven exact invoker functions/nine authority,queue and capability triggers.
Worker admission checks exact job/lock-column grants and migration088/092 guards.
The source fence removes all seven column-update sets.
Migrations89/90/91 and DELEGATED_PROVIDER_VERIFICATION.md
describe the minimal ledger, historical backfill and functioning local queue.
Worker-only hash capabilities and keyless operator HTTP integration now have
local actual-role/built browser proof. Normal long-stage heartbeat,native91 and
hosted acceptance remain open; local success does not authorize or certify
existing cloud roles. See VERIFICATION_WORKER_CAPABILITIES.md for exact limits.
Its dedicated verified startup is implemented and locally tested.
CONTROL_PLANE_RUNTIME.md records the current actual API-role pipeline and limits.
OPERATOR_COLUMN_PROFILE.md records commands,guarded mutation limits,
native/hosted gaps and the new operator-specific login-budget boundary.

Hosted worker configuration always selects `worker`; API admission always
selects `application`. `hosted:check-worker` checks the worker connection without
starting jobs. The wrong profile fails before worker heartbeat/task execution.
An environment value cannot downgrade either hosted admission policy.

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
node --env-file=.env.source-maintenance scripts/postgres-fence.mjs seal understood_web,understood_worker --worker-roles=understood_worker --writers-stopped
node --env-file=.env.source-maintenance scripts/postgres-fence.mjs check understood_web,understood_worker
```

When a dedicated operator service exists, include its identity and bind its
profile with `--operator-roles=understood_operator`; it must not overlap the worker
subset. Stop operator writers as well. Operator column writes are explicitly
revoked and verified, not assumed fenced from table-level revocation alone.

The seal uses the same full-table locked backup snapshot, migration advisory
lock, global pause/worker-shutdown/lease checks as backup. It first verifies every
listed role's restricted policy, then atomically revokes all application-schema
write/trigger/maintenance privileges and sequence advancement. SELECT remains for
inspection. ACL revocation persists after commit and process restart. The command
does not modify source business rows, manufacture acceptance receipts, migrate
the database, remove objects or activate a target.

`--worker-roles` must be a distinct subset of the explicitly listed roles;
unlisted identities or invalid profiles are rejected before any revocation.
Omitting it preserves the legacy combined application profile, not automatic
worker-profile inference. Read-only fence checking needs no profile flag.

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

The fixed scripted pipeline now executes15 real task invocations under the
worker SQL identity, covering source transcription, preparation, recording,
assessment and case follow-up. All nine workflow checks pass,24 scripted provider
requests make zero external calls. Evidence:
`artifacts/worker-profile-pipeline-2026-10-15.json`. API/bootstrap still uses the
owner fixture in that evaluation; it is not native two-service proof. Additional
SQL tests run all32 registered scheduler stages with populated assessment/mail
expiry, recovery/invitation mail preparation and synthetic accepted receipts.
No actual mail is sent. Mixed-profile fencing validates both identities before
revocation, blocks both afterward and leaves full business inventory unchanged.
The focused combined worker/mail/pipeline/hosted set passed35 tests before the
two-role native runner extension; the latter has its own focused coverage.

Native PostgreSQL18 migration087/two-service proof now passes:
`artifacts/neon-service-roles-1ee4833f-f3bb-4e52-a40b-db7e1d64d010.json`.
Both profiles used independent direct verified-TLS connections; API publication/
submission,worker scheduled assessment,wrong-profile rejection,13 SQL denials
and mixed-role durable fencing passed with unchanged full business inventory.
The one disposable database and both expiring logins were verified removed;
outside catalog/ACL/role/membership state matched baseline. No existing database
permissions or storage contents changed. See NEON_LOGIN_REHEARSAL.md for scope.

PostgreSQL references: [Privileges](https://www.postgresql.org/docs/current/ddl-priv.html),
[Role Membership](https://www.postgresql.org/docs/current/role-membership.html).
