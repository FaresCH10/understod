# Delegated Provider Verification

## Independent Heartbeat Checkpoint

2026-10-16: delegated75%,operator80%,overall71%,not production ready.
WORKER_HEARTBEAT.md supersedes the stage-boundary liveness limitation below:
atomic serialized five-second health/capability publication continues through
awaited work, fences dispatch/result after failure and drains before terminal
publication, including newly discovered stop failures. Clean650e1447 passes
1163tests/1159pass/zero fail/four native skips,offline install/build and both
synthetic evaluations with831unchanged source files. No external request/new
cloud resource or grant change. Native91/three-role,stalled-connection and
hosted/live/full-release acceptance remain open. Earlier sections are historical.

## Current Capability And HTTP Checkpoint

2026-10-16: delegated task 70% (was 45%), operator isolation 80% (was 75%),
overall 71%, not production ready. Migration091 worker-only hash registry,
database-stamped freshness/stopped guards, keyless dedicated operator queue,
reviewed-configuration binding and persisted receipt reconciliation are locally
implemented and verified. API/operator keep no Gemini adapter/key. Staging worker
fixed tests are optional/default-off and synthetic-only; no live/hosted test ran.
Final clean bfbca555: 1153 tests / 1149 passed / zero failed / four native skips,
offline install/build,43contract/ten pipeline checks and829unchanged source files.
Built loss/outage/reload/stopped-worker and320/1440 checks pass with one mock call,
one slot and one test POST. VERIFICATION_WORKER_CAPABILITIES.md records exact
evidence, process cleanup, long-awaited-stage heartbeat limits and remaining
native91/three-role,rotation/live/hosted/full release gates. Earlier scopes below
are historical and do not certify the new policy on existing cloud roles.

## Current Durable Queue

2026-10-15. Overall71%;delegated verification45% (was20%). Migration090 adds a
functioning local operator-to-worker queue.
Hosted dispatch remains disabled; the operator HTTP service does not yet read a
fresh worker capability or submit through this bridge. Real worker content stays
prohibited on Gemini Free. The full isolated regression passes; see
BUILD_STATUS.md for the final checkpoint rather than inferring a release verdict.

The operator receives an exact validated public descriptor, not a key or provider
function. It atomically reserves the original quota, captures session authority,
inserts immutable fixed test/model/config metadata and audits enqueue. Duplicate
commands return their original receipt even after config changes. An audit error
rolls the entire transaction back. Direct column-only SQL cannot bypass the
global quota, create a preverified approval or directly insert permit records.
The permit INSERT grant is usable only by the nested approval-capture trigger.

Only the worker can claim and complete jobs. Its one claim expires at the
original approval deadline; it cannot reset attempts or rewrite terminal jobs.
Every provider request checks the claim, minimal authority and dispatch pause.
Completion requires exact accepted request counts and bounded validated stage
evidence, with fresh authority/deadline/config checks. Revocation or pause during
transport cannot promote the result. Expired processing is sealed uncertain,
never automatically replayed or refunded. Queued expiry is sealed failed without
requiring provider credentials. No operator identity/session access is given to
the worker. A terminal job closes effective authority even while the private
approval record retains its original pending state; receipts project the sealed
job result without changing that original approval.

The registered providerVerification worker stage uses this queue. It is skipped
for an explicitly application-profile legacy runtime; no application job-table
grant is added. Existing health reporting accepts the bounded stage name but is
not a fresh per-claim capability heartbeat. An actual claimed synthetic test now
has local awaited-stage shutdown proof: it finishes once, then the next stage
does not start. This is not an independently observed hosted drain or native
multi-process claim test. The backup snapshot dynamically discovers the new
lease column; no copied list of outstanding leases was introduced.

Catalog136/90migrations: application118DML/12read-only/6hidden;
worker97full-DML plus one SELECT/limited-UPDATE job table,29read-only/9hidden;
operator19some-write/18read-only/99hidden. The operator can insert immutable job
metadata and read bounded results, but cannot read claim leases/tokens or update
results. Worker UPDATE permits exactly seven transition/result columns, not
metadata, INSERT or DELETE. All profiles verify six exact invoker functions and
eight trigger bindings; worker admission also rejects broader column/table grants.
The durable source fence removes these worker column grants too. Existing cloud
roles have not been reconfigured or certified under this policy.

Final queue/scheduler/dedicated-role-runner regression:33pass/zero fail/zero skips,
26503.7446ms,57467terminal0. Earlier queue/scheduler/pipeline run:23pass/zero fail/zero skips,
24498.9184ms,60474terminal0. Earlier23-test run had22pass/one failure because
REVOKE of a deliberately broad test grant also removed expected column grants.
The fixture now restores the exact column policy; no admission check was weakened.
The preceding five-file46pass run remains earlier evidence. These use disposable
PGlite actual SQL roles and mocked/scripted transport, not native PostgreSQL,
spoken-audio quality or live Gemini.

The first full run7fa49ae1-8127-447b-8a9d-e4f3c5e68830 passed offline install/
production build but failed one of1145tests:1140pass/four native skips,
270184.7569ms. Its legacy application-role scheduler correctly could not read
the worker-only job table. The scheduler now excludes that stage for application
profiles; the original SQL denial and full-test assertions remain. Only
runtime.mjs and provider-verification-jobs.test.mjs changed after that snapshot.
The failed report is preserved, not reclassified as passing. A new unchanged-
source full7ba8b703-a873-4e24-bc6d-93d52f40f924 passed,93968terminal0,
20:06:05-20:10:55UTC:locked offline install,production build,1146tests/1142pass/
zero fail/four native-prerequisite skips,270364.0603ms,and both synthetic
evaluations.827source files unchanged,SHA256
d44af148fea46ec1de4b19dfd86d1cb3235b9b5d2524fbb6605f9273c3ffb50a.

Both evaluations pass43contract/ten pipeline checks with24scripted requests and
zero external requests. Existing mixed static/dynamic-import warnings remain.
Preservation88f5f6d0 matches the earlier original eight table fingerprints,
integrityOK/FK0,22valid saved build manifests,2384selected files and zero
configured-secret matches. Private envs remain ignored; example key stays blank.
Durable record:artifacts/production-verification-queue-checkpoint-2026-10-15.json.

### Current Remaining Work

- [ ] Fresh bounded worker capability metadata and explicit stale/stopped/config-
  conflict handling, without provider secrets in the operator/API services.
- [ ] Dedicated operator HTTP queue bridge and built receipt/poll/reload/outage
  acceptance, while preserving the original request and quota under interruption.
- [ ] Restricted-role native90 concurrent claims, exact trigger/column admission,
  shutdown/fencing and cleanup under a separately bounded authorization.
- [ ] Separately authorized synthetic live/hosted acceptance. No real data,
  automatic production activation, billing changes or deployment is enabled.

## Previous Authorization Foundation

2026-10-15. Overall71%;worker-dispatched provider verification20% then. This was an
authorization foundation,not a functioning delegated queue or enabled hosted
Gemini test. Real worker content remains prohibited on Gemini Free.

## Implemented Boundary

Migration089 adds provider_verification_authorities with only request_id,
expires_at and revoked. The expiry is the earlier of the test deadline and its
approving session expiry. New verification insert requires a matching,live,
unrevoked operator session and active/current operator revision. Completion
closes authority. The original provider evidence stays in its private table.

Invoker-only triggers atomically close authority on session revocation,
replacement login,session deletion,changed session identity/expiry,operator
deactivation/revision/password changes and verification completion. The ledger
is append-only except false-to-true revocation;its identity and expiry cannot be
rewritten or deleted,even by an ordinary maintenance UPDATE. No security-definer
function or worker access to operator identity/session tables was introduced.

The worker has read-only access to the three-field ledger. Customer/API role
has no access. The operator may read it and change only revoked;it cannot
insert,delete,extend or reopen authority. Its provider_verifications SELECT
projection now includes session_hash solely so invoker session-revocation hooks
can match private approvals. Worker/customer cannot read operator sessions or
credentials;HTTP provider DTOs still exclude private approval identities.

All three runtime profiles verify the exact bodies and four enabled trigger
bindings before admission. Security-definer,SET configuration,disabled/missing/
altered guards fail. Fingerprints normalize CRLF pairs only;adding a literal CR
to the shared lock key is detected. currentVerificationAuthority takes the same
transaction advisory lock as revocation before reading. The existing inline
verification request journal now calls it after its existing session check.
This is not yet the worker-dispatched request path.

Current catalog135tables/89migrations:application118DML/12read-only/5hidden;
worker97DML/29read-only/9hidden;operator16some-write/20read-only/99hidden.
The operator's new table has revocation-column authority only,not whole-table
DML. Previously configured cloud roles have not been changed or certified.

## Historical Migration

Real88-to89 local migration tests preserve every existing verification row and
backfill one minimal authority record per row. Missing,expired,revoked,completed,
inactive or mismatched operator/session approvals cannot become active. Expired
test deadlines remain expired. A second migration run changes no authority rows.
This uses populated in-memory PostgreSQL compatibility tests,not native Neon.

Request IDs retain all UUID versions1-5 accepted by existing provider commands;
the new helper does not narrow accepted historical IDs to generated v4 only.

## Evidence

Final focused four-file regression:34pass/zero fail/zero skips,22982.2422ms,
19729terminal0. It covers existing quotas/stages,exact request budgets,uncertain
transports,authority revocation,minimal actual SQL permissions,admission drift,
all UUID versions and populated historical migration. Earlier27pass,17pass and
11pass runs preceded the final compatibility fix and are historical only.

One earlier28-test run passed27 and failed hosted startup because the preserved
root dist lacks the newer operator manifest. That failure is retained,not
credited as passing. The root preview was not replaced. Final clean verification
builds before hosted tests inside a separate source snapshot.

Two superseded clean runs bbcf3ff4-d131-4628-9136-fd900d8c8082 and
ec590f05-c8fa-419b-95fa-b351605f2321 were intentionally interrupted before their
source snapshots became outdated by historical-mismatch and UUID-contract fixes.
Their journals/builds are preserved and are not passing final-source evidence.
Full a88a3875-1faf-4f71-a830-1dbaa8be9534 ended failed at19:27:36UTC:
1130total/1124pass/two failures/four native-prerequisite skips,258538.5942ms.
Both failures were exact migration arrays in historical upgrade tests ending88.
They now append89 while retaining every existing privacy/history assertion;
both affected tests pass,2061.869ms. Source comparison proves only those two
test files differ from the full snapshot;no application code changed afterward.
The original failed report/log are retained,not reclassified. There is no new
uninterrupted full-verifier pass claim. Separate stripped-environment contract/
pipeline evaluations on the identical application snapshot passed19:30:13UTC,
with only the two known expectation corrections in current source. See its
post-regression-evaluations.json and current BUILD_STATUS.md.

## Remaining Work At The Previous Foundation Checkpoint

- [ ] Durable operator-enqueued jobs with exact fixed test/model/config metadata,
  atomic quota reservations and immutable original request receipts.
- [ ] Worker claims and leases,per-request authority/config/pause checks and
  conservative crash/uncertain handling without automatic extra provider calls.
- [ ] Worker-only provider credentials and fresh bounded capability metadata;
  operator service keeps no Gemini key or executable provider adapter.
- [ ] Restricted worker result writes and operator result reconciliation that
  cannot forge a verified result or reopen completed evidence.
- [ ] Scheduler/task-health registration,shutdown and stale-worker behavior.
- [ ] Native89/three-role concurrency/admission/fencing/cleanup acceptance under
  a separately prepared bounded authorization;older87/two-role proof is historical.
- [ ] Built operator request/receipt/outage/reload and role-denial acceptance,
  then separately authorized synthetic live/hosted tests. No production activation.
