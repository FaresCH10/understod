# Native Three-Role Acceptance Preparation

Current status: separately approved retry6a30573b passed current91 native
three-role workflow,heartbeat fault/drain/recovery,positive denials and exact
cleanup. Independent read-only postcheck confirms absence and original outside
baseline. See NEON_THREE_ROLE_ACCEPTANCE.md. Rehearsal task90%,overall72%; wider
failure/hosted/release gates remain. No further cloud mutation authorized.
The failed first run and its separately approved cleanup remain historical.

## Previous Preparation Checkpoint

2026-10-16. Runnable command preparation, not native acceptance or permission to
contact Neon. Preparation task estimate75% (was55%); native acceptance82% remains
the historical two-role87-migration scope. Prior authorizations were consumed.
The new three-role command requires a fresh bounded authorization before use.

## Implemented Locally

`neon-login-rehearsal.mjs` now has explicit three-role orchestration behind strict
`operatorServices`, `separateServices` and separate `confirmedOperator` booleans.
Its default runtime exercise includes the real worker heartbeat loop, not a
caller-supplied pass stub. Old one/two-role authorizations cannot select it.
`neonOperatorResources` derives the exact database/schema/API/worker/operator
names from one validated UUID. Eight target DB connections budget six runtime
connections plus the owner's two; each expiring unprivileged login stays at two.
Outside catalog comparisons exclude only the three exact new role names.

The common runtime exercise accepts a third distinct operator pool and exercises
all correct/wrong profiles,API publication/submission,worker assessment,keyless
configuration-bound operator enqueue,duplicate/original receipt,competing claim
calls,one attempt/request,revocation during a metered response,no replay/refund,
positive-column denials,disposable operator grant drift/rejection/restoration,
and a mixed three-profile source fence with unchanged business inventory. New
checks cover in-flight pause,configuration rotation,original receipt recovery
after rotation,an already-expired original queued approval with zero dispatch,
and disabled verification guard rejection/restoration across all three profiles.
Wrong/owner profiles fail admission before any application fixture rows are made.
This uses fixed synthetic preparation through injected in-memory transport.
No real Gemini key,network model request,cloud storage or mail is involved.

Cleanup independently tries to disable every provably owned login, even if a
different role has changed identity. Any marker/OID uncertainty refuses all
deletion. The new three-role path requires captured integer OIDs for roles and
the database; a name or marker alone is insufficient. It then checks attributes,
expiry,membership,ownership,outside drift and active sessions before exact DROP.
Changed/unproven resources remain for explicit reconciliation,not broad cleanup.
All three logins are disabled independently before either database or role DROP.
An additional all-database session check refuses deletion while any owned login
has an active client connection,even if the temporary database is already absent.
Cleanup never terminates an unrelated connection. Bounded refusal labels identify
role identity/attributes,outside catalog drift or remaining runtime/target sessions.

## Heartbeat Acceptance Included

`neon-verification-heartbeat.mjs` executes the normal runtime with its unchanged
five-second heartbeat and30-second capability window. Two held18-second scripted
requests keep the worker busy across that real window. After shutdown is requested,
a further5.5-second held drain proves observations advance before terminal stop.
The original translation receipt verifies once.

A temporary invoker trigger then rejects nonterminal heartbeat writes inside
the disposable schema only. Its temporary EXECUTE grant is only to the worker
login,so persistent-failure startup reaches heartbeat publication rather than
failing an unrelated function-permission gate. Periodic failure fences the second
translation request/result,keeps quota reserved and records stopped workerHealth
failure. With the fault still installed,a fresh normal worker rejects startup
before dispatch and records the failure. The trigger/function are removed in
finally; fresh presence then recovers. No production ACL/guard is relaxed.

The fixture initially failed at the function-permission gate before this exact
temporary grant was added. Corrected focused23tests passed in55766.771ms; a later
five-test CLI/acknowledgement/session group passed in323.1661ms. The final clean
run also covers additional wrong-role-before-data assertions. Clean d6b611b6-
75cf-4e9d-818e-2b9542be2823 passed,88363terminal0,2026-10-16T05:30:36.945Z:
locked offline install/build,1173tests/1169pass/zero fail/four native skips,
477038.5534ms,43contract/ten pipeline checks,24scripted/zero external requests.
All832source files unchanged,SHA256
1e6b589537f97ec46a0a46322443de091c7f0c0f7c54d6105678a507f907d030.
Fresh bounded Neon authorization has been requested;no cloud run occurred.
This is serialized PGlite evidence,
not native TLS,network interruption,lock starvation or process death.

## Explicit Command And Evidence

After fresh authorization only:

```powershell
node scripts/neon-synthetic-login.mjs --confirm-synthetic --confirm-temporary-database-and-three-logins
```

The exact two-argument form selects all three strict booleans. Mixed,reordered,
duplicate or abbreviated flags reject before configuration or connection. The
new evidence filename is `neon-three-roles-<uuid>.json`; runtime journals use
`neon-login-rehearsal-v2`. Passwords stay only in memory. Initial/final evidence
and failed checkpoints never contain connection URLs or credentials.
The old single/two-role flags,filenames and authorization scopes remain distinct.

## Remaining Native And Release Gates

This bounded current-policy command is ready for a separately authorized native
run once final local verification passes. It does not stand in for the remaining
platform failure/operational release drills below; those are not dropped or
credited by making the current-policy test runnable.

- Actual current91 three-login TLS/native competing-claim/heartbeat acceptance.
- Native connection/lock starvation,network stall/backend death/process-kill and
  original processing-claim deadline failure matrices. The seeded expired queued
  approval above is not elapsed90-second processing-expiry or process-kill proof.
- Hosted proxy,HTTPS,operator frontend,platform shutdown and rolling deployment.
- Resource removal,outside ACL invariance and scoped secret scan of any actual
  native evidence; no native outcome can be inferred from a green local suite.

## Required Resource Contract

- One new uniquely marked synthetic database in the user's isolated Neon Free
  test project, with three new expiring unprivileged LOGIN roles: API, worker and
  operator. Passwords stay only in memory. No owner credentials in a runtime.
- Names derive only from one validated fresh UUID. Bind each resource to the
  exact ownership marker and observed OID; never select an existing arbitrary
  resource or clean up by a broad name prefix.
- Configure the current91-migration schema and exact three runtime profiles
  inside that new database only. No existing schema/role permissions, billing,
  public deployment, mail, cloud storage or real data changes.
- Two independently authenticated, certificate-verified TLS connections per
  runtime. Account for six idle runtime connections plus the maintenance pool:
  the old two-role database connection limit of six cannot be reused blindly.
- Outside catalog/ACL/membership/default-grant snapshot must exclude only the
  exact newly owned resources and be unchanged before and after the run.

## Required Acceptance

- Each correct profile admits; wrong/owner profiles fail before serving or
  running tasks. Actual API publication/submission and worker assessment remain.
- Operator-only credential/session/control access, positive column grants,
  worker job-update restrictions and API hidden registry/job/authority tables.
- Keyless operator enqueue, reviewed fingerprint, original receipt/quota replay
  and local fixed mock transport. No Gemini request or real worker content.
- Concurrent native worker claims consume one attempt and one request budget;
  revocation, pause/configuration changes and expired claims cannot promote a
  late result or automatically dispatch again.
- Independent heartbeat through an awaited stage, transient/persistent failure
  and graceful-stop ordering on real separate connections. Native clock and
  connection-stall behavior must be measured, not inferred from PGlite.
- Exact guard/column drift rejection. Restore only deliberately changed objects
  inside the disposable target; do not repair existing project permissions.
- Stop all writers, close active claims/capabilities and fence all three source
  roles, including their column grants. Inventory must stay unchanged by fencing.
- Dedicated operator HTTP loopback checks can exercise the native DB profile,
  but they must not be mislabeled deployed HTTPS/proxy/frontend acceptance.

## Required Failure And Cleanup Proof

Offline tests must cover third-role creation/configuration failure, interruption,
lost acknowledgement, altered operator marker, outside ACL drift and evidence
write failure. The CLI needs a distinct three-role confirmation, never reusing a
two-role authorization or accepting an ambiguous string/boolean selection.

Disable all verifiably owned logins before deletion. Verify markers, OIDs, role
attributes, expiry, membership, ownership and no active client sessions before
dropping the exact new database and each owned role. Changed/unproven identity
or outside drift refuses deletion and records unverified cleanup. A saved journal
or lock alone does not prove a process is still alive; revalidate its handle/PID
or database sessions before continuing or reconciling. No blind rerun on timeout.
