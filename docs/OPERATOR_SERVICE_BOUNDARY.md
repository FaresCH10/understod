# Operator Service Boundary

Historical HTTP-only checkpoint. The subsequent local operator database profile,
guarded retries and dedicated startup are recorded in OPERATOR_COLUMN_PROFILE.md.
Remaining-before-startup percentages below describe the earlier checkpoint, not
the latest source. Native/hosted/full-release acceptance is still incomplete.

2026-10-15. Local synthetic implementation checkpoint, not deployment approval.
Overall remains about71%; API/worker/operator hardening estimate58% (was55%).

## Implemented And Locally Verified

- [x] 100% at this narrow scope: hosted customer/worker configuration rejects
  `UNDERSTOOD_OPERATOR_ACCESS=true`. The customer HTTP factory and API startup
  also reject mixed service/profile/operations settings before opening the pool.
- [x] 100% local HTTP boundary: internal `createPostgresOperatorServer` exposes
  only operations APIs, minimal database health and the allowlisted public build.
  Customer sessions, login/recovery, worker redemption, audio, people, reports
  and all other customer APIs return404 without database access or body parsing.
- [x] 100% local configuration boundary: explicit operator mode requires its own
  exact HTTPS origin and a different exact customer origin, verified-TLS database
  configuration, synthetic staging, and the existing narrow trusted proxy rules.
  Storage checks, storage/AI/mail credentials and pilot delivery are refused.
- [x] 100% local operator session boundary: hosted operations use
  `__Host-understood_operator`, Secure/HttpOnly/SameSite=Strict/Path=/, no Domain.
  The old local cookie and customer cookie cannot authenticate this service.
  Same-origin mutation, bounded JSON, session context, revocation, exact request
  replay and immutable receipts retain their existing checks. Rehearsal-only
  local operations retain their explicitly separate local cookie behavior.
- [x] 100% embedded SQL boundary: application-role access to `platform_operators`
  and `operator_sessions` is denied for SELECT/INSERT/UPDATE/DELETE. Startup
  inspection rejects table or column privilege drift. Customer submission and
  distinct worker-profile/fencing checks still pass. This is not native proof.

## Remaining Before Startup

- [ ] 0% operator-specific database profile: derive positive verb/column grants,
  scoped retry/control mutation authority and metadata-only reads. Do not grant
  the existing application profile to operators or drop concurrency locks to
  make ACL tests pass. The application still has broader control/request DML;
  this checkpoint removes credential/session access only.
- [ ] 0% dedicated operator launcher: must verify that actual directly connected
  operator profile before listening. The public launcher currently accepts only
  api/worker/check/check-worker; `runtimeProfile('operator')` is rejected. The new
  HTTP factory is internal and exercised only by disposable local tests.
- [ ] Native three-role TLS/profile/negative-SQL and combined workflow proof.
  A new live resource test requires separately bounded authorization. Earlier
  native two-role evidence used the old application policy and does not certify
  these new denials or a nonexistent operator profile.
- [ ] Actual proxy/host/cookie/browser and deployment isolation, operational
  monitoring, no cross-host service-worker effects and authorized rollout.
  No browser screenshot or cloud/deployment verdict is added here.

## Upgrade Admission

The application policy now allows DML on124 tables, read-only access to seven
maintenance tables and no access to the two operator identity/session tables.
The worker policy remains98 writable/28 read-only/seven hidden. Counts refer to
the current87-migration schema, not future migrations.

Old application roles retaining operator table/column grants now fail startup
inspection. A reviewed maintenance operator must reapply the existing explicit
permission-configuration procedure on the dedicated target with all writers
stopped. No running/hosted database is changed by this source update, and startup
does not silently repair ACLs or create identities. Existing local customer
previews and original SQLite data/builds are not replaced.

## Evidence

`tests/operator-service.test.mjs` uses actual loopback HTTP, fixed proxy headers
and disposable PGlite. It has no storage/provider/mail adapter or cloud URL.
`tests/runtime-permissions.test.mjs` uses actual embedded SQL ACLs, not mocked
permission results. Expanded11-file regression:61pass/zero fail/zero skips,
31956.3609ms, terminal0. Focused earlier five-file regression:23pass/zero fail.

Initial three-file run:12pass/one failure (`ECONNRESET`). Its negative-request
helper sent GET bodies without an explicit Content-Length. Corrected HTTP framing
retains the invalid JSON bodies and every404/no-database assertion; the unchanged
application assertions pass. This failed attempt is not counted as a pass.

Fresh clean b1ec0c63-9c02-45fb-b931-e54c4ba74962 passed,57142terminal0:
offline locked install/build,1106tests/1102pass/zero fail/four native-prerequisite
skips,43mocked contract/ten scripted pipeline checks,811stable source hashes.
Original eight table fingerprints and twelve55-file shell manifests preserved;
1726selected files/zero configured credential matches at12:38:56UTC. Exact
verification/preservation paths are recorded in BUILD_STATUS.md and the dated
operator-service checkpoint artifact. Local
HTTP/embedded ACL evidence is not native PostgreSQL, hosted ingress, physical
device, live-provider quality, real-data privacy or production-readiness proof.
