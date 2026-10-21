# Native Three-Role Rehearsal

2026-10-16. Current 91-migration synthetic PostgreSQL 18 acceptance, not full
production readiness. One separately approved retry; no further run authorized.

2026-10-19 source additionally makes four worker template/glossary tables
read-only and organization/site writes immutable lock-column only. The native
run below covered the preceding broader policy. Local checks do not extend
this native result;no existing Neon grants were changed ornew test authorized.

Current source also adds migration092 and staff/account/credential/access-revision
lock columns with read-only account memberships. Neither that migration nor any
newer worker permission boundary was applied in the historical native91 run.
See WORKER_IDENTITY_PERMISSIONS.md. A fresh bounded native test remains necessary.

## Evidence

Run `6a30573b-c52f-46b5-a140-61e1cd8472af` started06:20:56.218 UTC and its
atomic journal reached finished/passed at 06:29:36.284 UTC. The process handle
was lost across interruption; its exact PID 27212 was absent at 11:11 UTC. The
original CLI exit code was not observed and is not claimed. The final journal,
unchanged tested source and independent native read-only postcheck establish
the bounded results below. No process was restarted to recover observation.

- `artifacts/neon-three-roles-6a30573b-c52f-46b5-a140-61e1cd8472af.json`
- `artifacts/neon-three-role-postcheck-6a30573b-c52f-46b5-a140-61e1cd8472af.json`
- Clean source 2c9bdda4-4c58-46c9-968b-3ca55f4b602e: 835 files, SHA256
  fab91e260f65e2c6066579147ea5d8e6b377939e77c281b302458c86d9a58720,
  rechecked unchanged after interruption. Offline build, 1184 passed/four native
  skips/zero fail, 43 contract and ten pipeline checks are separate local evidence.

## Passed Scope

One new template0 database and three random-password, expiring, unprivileged
LOGIN roles were created only in the isolated Neon Free test project. The owner
applied and verified all 91 migrations. Each API/application, worker and operator
login opened two independent certificate-verified direct TLS connections and
passed its exact current profile. The original resource OIDs,markers,owner,
memberships, expiry and outside baseline were persisted without passwords/URLs.

Twenty runtime checks passed, with 23 denied SQL statements. The API published a
synthetic briefing and accepted its worker answer; the actual worker assessed it.
Wrong-role startup was rejected before heartbeat. Worker billing/operator/policy,
API DDL/future objects and operator positive-column/worker-content boundaries were
denied. Temporary grant/guard drift only inside the new target was rejected,
then restored. A mixed-profile source fence preserved the business inventory and
blocked all three writable profiles. This was not activation of that target.

The keyless operator queued a reviewed configuration-bound verification. Competing
native worker calls produced one claim/attempt/request andoriginal duplicate
receipts. Revoked in-flight authority, provider pause and configuration rotation
prevented late result promotion/new unreviewed dispatch. An already-expired
original queued approval closed with zero dispatch; this is not an elapsed
processing-claim deadline test. No quota refund or blind transport replay occurred.

The normal five-second heartbeat retained a 30-second fresh capability through
held scripted translation work and graceful drain. A disposable SQL fault rejected
heartbeat writes; it blocked the next dispatch/result, persisted a stopped failure
and caused a fresh worker to reject startup before dispatch. After removing the
fault, fresh presence recovered. Seven total provider requests were scripted
in memory, three belonging to heartbeat exercises; external provider requests: 0.
No real worker content, cloud storage, mail, billing changes or public deployment.

## Cleanup

The exact original marked database and all three logins were verified, logins
disabled/passwords cleared, runtime sessions closed and resources removed.
Final evidence records all four absences and unchanged outside catalog/ACL.
The independent read-only check at 11:12:11.202 UTC exited 0 and again verified zero
matching names/original OIDs/sessions, with the original outside SHA256
a58095ce27284a2bac2b9361d37c1d43765e3d26af90dc8451115adef15265c3 unchanged.
It made zero cloud writes and did not rerun the test.

The first 2e42b143 failure and its separately approved cleanup remain failed-run
history. This successful retry does not retrospectively verify that run's lost
outside baseline. See POSTGRES_LEASE_RECOVERY.md.

## Remaining Gates

Forced native connection/network/backend/process termination, lock starvation,
actual elapsed processing-claim expiry and cross-process interruption matrices
remain. The shared lease guard has local event/failure tests, not a forced native
reset pass. Worker DML is still broader than a completed least-privilege design.
Actual separate hosted HTTPS/proxy/cookie/shutdown/monitoring, combined private
storage/backup/custody/retention/cutoff, live synthetic voice/semantic quality,
approved real-worker privacy policy, all-reference/language/AT/device and CI/release
acceptance remain. Overall estimate: 72%, not a release declaration.
