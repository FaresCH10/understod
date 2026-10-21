# Worker Case Workflow Permissions

Migration095 local continuation: `case_voice` now grants the worker SELECT and
UPDATE(status,lease_token,lease_until,cleanup_state,cleanup_token,cleanup_until,
cleanup_checked_at) only. No INSERT/DELETE, author, case receipt or acceptance
clock authority. Guard `guard_case_voice` is pinned to
`d5447010e1dcbc8a6c13cceef8c814bf85482f4a59db26d085751479dcd3632e`.
Broad/extra-column grants and altered/disabled/conditional guards are rejected;
reconfiguration removes old DML grants. Actual separate API acceptance and
worker removal preserve staff audio receipt identity. The current worker has
84 ordinary-DML and ten column-restricted tables (94 write-capable),34 read-only
and11 hidden. Native migration095 and hosted acceptance are not claimed. See
STAFF_CASE_RECORDINGS.md. The earlier evidence below predates this continuation.

## Scope

The background worker processes accepted answers and privacy cleanup. It does
not need SQL authority to create supervisor disagreement/deadline reviews or
repeat-answer requests. The worker profile now grants:

| Table | Worker SQL permissions |
| --- | --- |
| case_reviews | SELECT; UPDATE(reason) only |
| case_repeats | SELECT; UPDATE(status) only |
| case_reviews identity sequence | None |

The API application profile retains customer actions, typed/audio receipt
acceptance and sequence allocation. No table, migration, trigger body,
security-definer function or elevated runtime role is added by this change.

Column inspection checks every current/future column, table-level verbs,
PUBLIC/delegated grants and owned sequences. Startup rejects broader historical
grants until a separate maintenance owner reconfigures the worker profile.
Configuration removes old grants atomically without rewriting business rows.
The source fence also revokes both cleanup-column grants.

## Evidence Guards

Startup and configuration verify exact current normalized bodies and
unconditional enabled BEFORE INSERT/UPDATE/DELETE triggers:

- guard_case_review: 0018e5c7482ad035f6220528b827d76e89708b45c1b9c445175c12b2a83d91c9
- guard_case_repeat: 2c97163dd4aa4e0aa8670afce4e18f3c7494f34aeb6ac41471d70176339c432c

These are the existing migration071 review and migration060 repeat guards.
Review redaction still requires the relevant deletion request or expired-case
purge; a cleanup-column grant cannot replace private reasons arbitrarily.
Repeat identity/deadline/actor fields and completed receipt identity remain
immutable under the existing guard. No evidence is relabeled as newly authored.

The worker remains trusted for allowed lifecycle operations. In particular, a
status-column grant is not a deletion-only row authorization policy. It does
not prove that a compromised worker cannot cancel/expire a pending request or
misuse other lifecycle grants. Further row/verb/read restrictions and credential
confidentiality remain separate work. No full compromise-isolation or complete
least-privilege claim is made.

## Local Verification

- Actual role SQL denies create/delete/truncate, every noncleanup column and
  review sequence allocation/read/reset. Business inventory stays unchanged.
- Admission rejects broad, extra-column, delegated, PUBLIC, missing-column,
  future-column and sequence grants; disabled/dropped/conditional triggers,
  changed guard bodies and security-definer substitution are also rejected.
- Reconfiguration removes preceding broad grants without changing inventory.
- Separate API/worker identities complete original assessment, typed repeat,
  private recorded repeat, transcription/checking and another pending request.
  The original case is preserved. API review/deadline receipts remain recoverable
  with unchanged hashes.
- Deletion waits for verified private-audio removal before worker redaction.
  Review text becomes [Deleted] and pending repeats become cancelled; answer
  identity/outcomes and submission receipt metadata remain intact.
- A populated historical resolved case expires private review text only after
  the real retention task creates its purge record. Original assessment rows
  and the review's nontext evidence stay unchanged.
- Mixed API/worker fencing denies cleanup-column writes after commit; a later
  privileged regrant invalidates fence inspection.

Focused41 regression checks and five final guard/fence checks pass locally.
Fresh clean b187180f-c7f2-4543-86bf-5da2735f421b finished at
2026-10-20T12:57:42.245Z,exec26533 observedexit0:1,269 tests/1,265 passed/
zero failed/four native-only skips,offline install/build and both evaluations,
877 unchanged source files. Initial8773ed18 failed one Windows UNKNOWN lstat
on an encrypted temporary backup manifest. That unchanged backup test passed
alone and unchanged fresh full source passed; cause is unproven and no backup
safety check was weakened. Failed evidence is retained.

Preservation f6981c31 observedexit0: original eight table fingerprints unchanged,
integrityOK/FK0,58 saved manifests valid,4,714 selected files/zero configured
secret matches. Frontend manifest matches prior accepted84afc9af byte-for-byte;
no new browser pass is claimed. BUILD_STATUS.md and the checkpoint artifact
record full details. PGlite is not proof of native
PostgreSQL concurrency, native service identity or deployed operation.

## Rollout And Limits

No Neon database, existing cloud ACL, private bucket or hosted service changed.
The schema remains migration093, but this newer worker ACL/inspection policy is
not covered by historical native091 acceptance. An authorized rollout must stop
writers, preserve backup/evidence, reconfigure the worker role through separate
maintenance, then run direct-login profile/workflow checks. Never configure
maintenance privileges from the application/worker process. See
RUNTIME_PERMISSIONS.md and WORKER_IDENTITY_PERMISSIONS.md.

No live Gemini/mail call, microphone, real worker data, billing change, account
connection or deployment is part of this checkpoint.
