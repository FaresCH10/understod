# Dedicated Operator Runtime

Historical local operator-column checkpoint. CONTROL_PLANE_RUNTIME.md records
the subsequent narrower API/worker policy and true application-role pipeline.
Operator column grants remain unchanged;the older API/worker counts below are
historical,not current permission setup or native/deployed acceptance.

Earlier2026-10-15. Local synthetic implementation and acceptance only. Overall about71%;
service-role hardening65% (was58%); dedicated operator isolation70% (was30%).
These are engineering estimates, not deployment or security certification.

## Implemented

- [x] Dedicated `operator` runtime profile, never an alias for application/worker.
  All SELECT/INSERT/UPDATE grants name columns explicitly. Only the dedicated
  operator session and throttle tables allow DELETE. No sequence access, DDL,
  grant options, memberships, object ownership or executable definer authority.
- [x] Operator login has a separate bounded `operator_auth_attempts` table and
  global admission lock. It cannot reset/read customer login throttles. The
  application and worker cannot access operator credentials, sessions or throttles.
- [x] Metadata-only access for tenant/status/access/jobs/health/provider journals.
  Customer credentials/session hashes, worker grant hashes, source/prepared text,
  answers, publication/export snapshots, CSV and audio tables are not readable.
- [x] Existing same-transaction operator session/context checks, operations gates,
  tenant/site admission, row locks, exact retries, immutable receipts and audit
  remain. Normal preparation/assessment/export retries run under actual column ACLs.
- [x] Migration088 adds generated `report_exports.snapshot_available`, allowing
  eligibility checks without SELECT on the snapshot. It also protects restricted
  UPDATE grants: lock columns may not change; sessions can only be revoked;
  failed preparation may only be cleared to processing; failed unleased jobs may
  only be reset to an immediately due queued state. No worker outcome writes.
- [x] Admission checks the exact positive column matrix, unknown/future columns,
  whole-table/PUBLIC/delegate drift, the normalized guard-body fingerprint, all
  nine enabled guard triggers and the stored generated eligibility expression.
  Missing/rewritten/disabled guards fail before listening. No permission repair
  or schema migration happens at runtime startup.
- [x] `hosted:operator` and `hosted:check-operator` verify migrations and the actual
  directly connected operator role. No storage handle, private-storage keys, AI
  adapter/credentials, mail handle/credentials or pilot destination is accepted.
  Customer/worker hosted services cannot enable operations routes.
- [x] Source fencing supports disjoint explicit API/worker/operator identities,
  revokes column writes as well as table writes and verifies the durable result.
  The embedded three-profile test preserves business inventory and does not activate
  a target. Existing application/worker profiles remain deliberately broader.

The134-table catalog has124 writable/seven read-only/three hidden application
tables,98/28/eight for workers and15/20/99 for operators. Operator writable counts
include three no-change lock-only tables. The count is not a claim that all
columns/verbs are writable. The complete policy is in operator-permissions.mjs.

## Commands And Admission

These are documented commands, not authorization to change an existing target.
Use a separately approved dedicated LOGIN and `.env.operator.example` as the
nonsecret contract. Never reuse the API/worker/maintenance login or customer
environment file. The operator HTTPS origin must differ from the customer origin.
Both remain synthetic staging only; private hosting/proxy isolation still needs
actual proof. Current UI entry is `https://<operator-host>/`;OPERATOR_ENTRY.md
supersedes the historical shared frontend/default-entry limitations below.

```powershell
node --env-file=.env.maintenance server/postgres/migrate.mjs
node --env-file=.env.maintenance scripts/postgres-permissions.mjs configure understood_operator --profile=operator --dedicated-database --writers-stopped
node --env-file=.env.operator scripts/postgres-hosted.mjs check-operator
node --env-file=.env.operator scripts/postgres-hosted.mjs operator
```

Stop all API, worker, operator and maintenance writers before approved migration/
ACL changes. Apply088 with the maintenance identity, then explicitly reconfigure
and verify every actual runtime profile. Old grants/new functions can fail closed;
do not bypass admission or give operators whole-table UPDATE to fix an error.
Existing roles with unexpected column grants require reviewed explicit cleanup;
configuration does not silently strip unrelated authority. No cloud ACL was changed
by this source update and no native schema was migrated.

```powershell
node --env-file=.env.source-maintenance scripts/postgres-fence.mjs seal understood_web,understood_worker,understood_operator --worker-roles=understood_worker --operator-roles=understood_operator --writers-stopped
```

Profile flags must be distinct disjoint subsets of the complete identity list.
The check command still takes the full role list and no profile flags. Fence
verification never authorizes target activation.

## Evidence And Limits

Expanded13-file local regression:63pass/zero fail/zero skips,39729.6974ms,
71617terminal0. It covers actual PGlite ACLs, migration replay/upgrade, populated
SQLite import, scoped controls/retries, auth budgets, worker stages and local HTTP.
Additional operator-profile run:8pass/zero fail/zero skips,13922.606ms,
90996terminal0, including disabled/rewritten guard and non-generated-column drift.
Full clean baseline6f06f347-36b3-4719-8cb2-1240d514b0dc passed offline install/
build,1114tests/1110pass/zero fail/four skips and both evaluations. Final review
afterward reproduced a meaningful CR inside a guard SQL literal being ignored
by normalization (one-test failure). Normalize only CRLF pairs,not standalone
CR;the unchanged pinned guard body remains required. Final five-file28tests pass,
15837.1163ms,88385terminal0. Exactly the guard inspector and its regression test
differ from the full snapshot. BUILD_STATUS.md records both source fingerprints;
the earlier full run is not described as an unchanged final source snapshot.

Initial seven-test run:five pass/two fail. A real missing trigger dependency was
fixed with SELECT on `briefing_content_purges.briefing_id` only. The intentional
whole-table privilege test also needed policy reapplication after REVOKE removed
its original column SELECT grants; the drift-denial assertion was retained.
The first mechanical migration-array updater had a PowerShell quoting error and
changed no files; the inspected bounded helper then updated all five ordered
expectations without dropping assertions. These failed attempts are uncredited.

PostgreSQL documents independent access to generated and underlying columns;
the implementation uses a stored boolean with a fixed built-in expression,
not a privileged function exposing the snapshot. [Generated columns](https://www.postgresql.org/docs/18/ddl-generated-columns.html)
documents this privilege model. Explicit column grants and the distinction from
whole-table grants follow [GRANT](https://www.postgresql.org/docs/18/sql-grant.html).
These references are design support, not native execution evidence.

## Still Required

- [ ] Native Neon88-migration, three separate verified-TLS LOGIN identities,
  function/trigger/generated-column admission, private-read/write denials,
  scoped workflow, durable fence and exact owned-resource cleanup. Earlier
  native87/two-role evidence is historical and does not certify this profile.
- [ ] Actual dedicated host/proxy ingress, host-cookie/browser/asset/CSP/PWA,
  default operator entry and shutdown/deployment isolation acceptance.
- [ ] Dedicated worker-dispatched provider verification before enabling that
  production capability. Current hosted synthetic configuration deliberately
  has no provider credentials; verification remains unavailable, not fake-success.
- [ ] Remaining positive verb/column restrictions for the broader customer and
  worker profiles, complete backup/restore/cutoff, external privacy accounting,
  reference/localization/accessibility/devices/live quality/CI/release gates.

No new cloud database/role, real worker data, external AI/mail, billing, public
deployment, original preview restart, original SQLite change or build replacement.
Supported browser automation remains unavailable; no new screenshot is claimed.
