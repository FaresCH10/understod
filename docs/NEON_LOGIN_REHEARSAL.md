# Native Dedicated LOGIN Rehearsal

## Current Three-Role Acceptance

The separately approved retry6a30573b passed the current91 native three-role
workflow,20 runtime checks,23 SQL denials and exact cleanup. An independent
read-only postcheck verifies all four absences and the original outside baseline.
The original process exit code is unavailable after interruption; it is not
claimed. See NEON_THREE_ROLE_ACCEPTANCE.md for precise scope and remaining gates.
Overall72%,not production ready. No further cloud run is authorized.

The first2e42b143 failure and its separately approved cleanup retain their original
scope; the retry does not retrospectively verify that run's lost baseline.
See POSTGRES_LEASE_RECOVERY.md. Earlier preparation below is historical.

### Previous Preparation Checkpoint

2026-10-16: NATIVE_THREE_ROLE_PREPARATION.md records the new distinct,default-off
three-login CLI and its current91-policy runtime/heartbeat/failure/cleanup
acceptance. At that checkpoint no native run had occurred.
The local SQL fault test is not network/process-kill proof. Historical native87
evidence below retains its original scope; no native progress credit is added
by the new command or serialized PGlite tests.

## Separate API And Worker Checkpoint

The user separately authorized exactly one temporary synthetic database and two
temporary LOGIN roles. Actual PostgreSQL18 run
`artifacts/neon-service-roles-1ee4833f-f3bb-4e52-a40b-db7e1d64d010.json`
passed, terminal exit0,2026-10-15 06:35:03-06:40:12UTC:

- Applied and verified all87 current migrations inside a new marked template0
  database, never the original preview or an existing cloud application database.
- Created distinct API/application and worker-profile logins, each with a random
  memory-only password,30-minute expiry,two-connection limit and no elevated
  attributes. Opened two simultaneous verified-TLS direct connections per role,
  with distinct backend IDs and matching current/session identities.
- Both exact production permission profiles passed. Worker login failed the
  application-profile gate; API login failed worker startup before any heartbeat.
- API login published a synthetic briefing and accepted a typed answer. Worker
  login completed its scheduled assessment exactly once and stopped cleanly.
  Loopback read-only API health/auth-denial checks passed; this is not hosted
  HTTPS/proxy/cookie acceptance or a full authenticated browser journey.
- Thirteen statements returned42501, covering API DDL/temporary/truncation/
  maintenance/future-object denials, worker billing/operator/policy denials and
  both roles' heartbeat writes after the durable mixed-profile fence.
- Full business-table/sequence/guard inventories were equal before and after
  fencing. Both writable startup gates then failed; a live fence inspection
  passed. Activation and production readiness remained false.
- Closed all test services/pools, disabled both logins and cleared their
  passwords. Exact marked database and both roles were removed and absence
  verified. Existing catalog/ACL/role/membership fingerprints matched baseline.
  No real data,provider/mail calls,storage writes,billing changes or deployment.

The runner remains default-off and requires the exact two-role flag:

```powershell
node scripts/neon-synthetic-login.mjs --confirm-synthetic --confirm-temporary-database-and-two-logins
```

The earlier one-role flag still creates only one role. Neither command is standing
authorization for another live test. Cleanup refuses changed markers/identities,
outside ACL drift or uncertain ownership; no FORCE/CASCADE or broad deletion.

Local two-role runner coverage plus permission CLI/policy tests passed24/24.
The initial restricted attempt had loopback EACCES; the approved rerun passed
unchanged. Other worker/mail/pipeline/hosted coverage passed35/35. Fresh snapshot
`747d3395-92dc-4e8e-a66b-d2ae0a9c1a1e` then passed locked offline install/build,
1074tests/1070pass/zero fail/four prerequisite skips,228510.7486ms,43mocked
contract checks and nine scripted pipeline checks. All795 selected source file
hashes stayed stable. These evaluations are not live Gemini accuracy evidence.

This establishes distinct native API/worker profile operation and fencing, not
complete least privilege: the worker retains broad DML for required locks/tasks,
positive verb/column restrictions and operator-service separation remain open.
Native cloud-storage all-family workflows,private-cloud backup/custody/cutoff,
hosted services/proxy/monitoring,reference/language/a11y/physical-device review
and actual CI/release acceptance are still required. See RUNTIME_PERMISSIONS.md
and PROGRESS_BOARD.md. Overall estimate remains70%,not production readiness.

## Earlier Combined Runtime Evidence (Historical)

Executed 2026-10-15 against the explicitly authorized isolated Neon Free project.
The user approved a temporary synthetic database and one temporary LOGIN role.
This was not public deployment, a real-worker test or activation of production.

## Passed Evidence

`artifacts/neon-login-2f94d92b-ffa0-4eaf-ab0f-a3adeb3324bc.json` records the
04:38:39-04:40:06 UTC native run, terminal exit 0, PostgreSQL 18:

- Created a uniquely named template0 database owned by the maintenance account,
  with no initial application relations, and applied all 86 migrations.
- Created an unprivileged SQL LOGIN role with a random client-memory password,
  30-minute credential expiry, two-connection limit and no elevated attributes.
  No password or connection URL was written to `.env`, local logs or evidence.
- Applied the existing production permission configurator only inside this new
  database. Existing database ACLs and default privileges were not edited.
- Opened two simultaneous, certificate-verified TLS connections directly as the
  runtime role. Session/current identity and database matched; backend IDs differed.
  The unchanged `verifyRuntimePermissions` production gate passed without SET ROLE.
- The restricted role published a synthetic briefing, accepted a typed submission
  and completed scheduled assessment exactly once. Worker startup permission
  validation and stopped-health evidence passed with no stage errors.
- The read-only API startup check and loopback health endpoint passed. Unauthenticated
  overview access remained 401; the demo-session route remained unavailable (404).
- Six SQL statements were denied with 42501: schema DDL, temporary table creation,
  audit truncation, migration/restore-journal deletion and a newly created future
  table read. No automatic future grants were added. Final permission inspection passed.
- Closed test API and pools, disabled the LOGIN and cleared its password, then
  removed the exact marked database and role. Both absences were verified. Existing
  database/catalog ACLs, original-database object identities/ACLs, role attributes
  and unrelated memberships matched their starting fingerprints.

These comparisons do not hash every table in every other database. PostgreSQL
PUBLIC defaults outside the disposable database were intentionally untouched;
no claim is made that authentication to every other database was impossible.
The runner connects as the test runtime role only to its disposable database.

## Safeguards

Command: `node scripts/neon-synthetic-login.mjs --confirm-synthetic
--confirm-temporary-database-and-login` (one shell line).

The default-off runner requires the existing dedicated isolated Neon configuration.
Only generated UUID-derived resource names are accepted. Phase/resource evidence
is persisted before effects. Templates cannot copy customer application data.
No Console/API-created administrator role or provider/mail integration is used.

Cleanup requires exact marker, owner and OID, expected role attributes/memberships,
no runtime-owned objects, unchanged outside state and no remaining client sessions
in the owned database. DROP uses neither FORCE nor CASCADE. An unmarked lost CREATE
acknowledgement or altered ownership refuses cleanup rather than guessing. Disk
checkpoint failure still attempts guarded cleanup. SIGINT/SIGTERM request cleanup;
a forced process kill requires inspecting the saved run before another attempt.
The expiring credential is disabled before cleanup can refuse a marked role.

An earlier attempt supplied a SCRAM verifier. Neon rejected it (XX000) before
creating any role; the temporary database was removed and outside state matched.
`artifacts/neon-login-ea74c2d7-9461-4db1-a9ee-742d0cb0038e.json` preserves that
failed attempt, not a pass. Neon requires unhashed password input over TLS and
stores an encrypted password; prehashed passwords are unsupported. The supported
method replaced that implementation rather than weakening any permission check.
See [Neon roles](https://neon.com/docs/manage/roles),
[Neon databases](https://neon.com/docs/manage/databases),
[PostgreSQL CREATE DATABASE](https://www.postgresql.org/docs/18/sql-createdatabase.html)
and [DROP DATABASE](https://www.postgresql.org/docs/18/sql-dropdatabase.html).

Nine focused tests pass, including embedded production-policy/runtime/API behavior,
explicit admission, ephemeral credential generation, redacted evidence, cleanup
after failure/interruption, lost acknowledgement and outside drift. Embedded and
mock orchestration are not native direct-login proof; the actual Neon run above is.

Final full regression:1026tests/1022pass/zero fail/four local-native prerequisite
skips,220764.8971ms,terminal exit0. Evidence:
`artifacts/neon-stable-build-suite-110bc507-d1d1-425b-9426-a511da3068fa.json`
and matching log. An earlier run failed when a concurrent build briefly removed
an asset; it remains recorded. Hosted focused3/3 and the full suite passed with
the completed build held stable,without weakening any check. Build passes:
2068modules/670.23KB entry,with existing size/mixed-import warnings.

04:51readonly preservation:all eight original business-table fingerprints match,
integrityOK/FK0;55shell hashes match;1504 source/evidence/public/log files scanned,
zero current Gemini/Neon URL/password matches,.env ignored/exampleblank. See
`artifacts/neon-login-preservation-ec988671-ca59-401e-909f-7052cca65599.json`.

## Remaining Gates

This proves the existing combined application runtime policy, not separate API,
worker and operator database profiles. Hosted TLS proxy, cookies/PWA/device behavior,
private R2, native encrypted backup/restore and source cutoff/activation, broader
process/storage/provider-failure matrices, actual CI/fresh setup and production
credentials/deployment remain open. Gemini Free stays synthetic-only. Overall
engineering completion is approximately 69%, not production readiness.
