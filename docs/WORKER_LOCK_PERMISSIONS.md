# Worker Lock-Column Permissions

2026-10-19 locally verified. Local lock-column task 100%; broader service
permissions 80% (was 75%). Overall estimate remains 73%; not a production verdict.

## Boundary

Worker organization/site INSERT, table UPDATE and DELETE are replaced with
SELECT and UPDATE(id) only. The unchanged migration 088 invoker guard rejects
every actual row change, including unreferenced IDs. No-op id updates and the
row locks used by operational/site admission still work. API/operator grants,
migrations and actual Neon permissions are unchanged.

PostgreSQL requires UPDATE on at least one column for row-locking SELECT clauses.
Table-level REVOKE also removes the corresponding column grants. Sources checked
2026-10-19: [SELECT](https://www.postgresql.org/docs/current/sql-select.html) and
[REVOKE](https://www.postgresql.org/docs/current/sql-revoke.html).

The exact guard-function/trigger inspection is shared with operator admission.
A positive column checker also serves the existing verification-job boundary.
Missing objects/columns, broad writes, extra columns, grant options and PUBLIC
grants fail closed. Restricted tables receive no owned-sequence privileges.
Setup remains explicit and transactional; startup never repairs grants.

Source fencing removes all three worker column-update sets. Sealed identities
cannot write or take row locks; a later UPDATE(id) grant invalidates the fence.
The 137-table worker summary remains 95 write-capable / 33 read-only / 9 hidden.
Those 95 now mean 92 ordinary-DML tables, one job-result column table and two
immutable lock-column tables, not 95 tables with unrestricted DML.

## Local Evidence

Four new tests passed, 9378.7389 ms: ten business mutation denials including
unused IDs; required locks/no-op updates and pause checks; eleven grant/future-
column/missing-lock/sequence drift cases; three damaged-guard admission/setup
refusals; distinct API/worker preparation, scheduled publication and populated
text retention with unchanged organization/site rows. The old retention candidate
is explicitly seeded synthetic metadata, not proof of natural 40-day aging.

The extended mixed-role fence test passed, 2959.204 ms: writes and row locks
denied, later lock grant detected, restored fence valid, inventory unchanged.
Existing permission/authority 24 tests and TypeScript passed. Broader focused
run 80916 finished 71 passed / 1 failed, 102050.4193 ms. Its sole failure was
ENOENT for the deliberately preserved old root dist operator manifest. It is
not a passing hosted-startup result; root dist was not overwritten.

Initial fixtures needed current site-control fields, explicit preparation
queueing, and restoration of the id grant after deliberate table-grant drift.
Production checks were not relaxed.

Fresh full clean 6c284a4b-7245-44b5-b023-74c7f08e7975, exec46855 exited 0.
09:11:16.251-09:16:56.169 UTC: locked offline install/build, 1211 tests /
1207 passed / 0 failed / 4 native-only skips, 321135.2848 ms. All 43 contract
and 10 pipeline checks passed; 24 scripted provider requests, zero external.
The fresh operator startup/HTTP check passed, 9272.9346 ms. Earlier ENOENT remains
recorded, not converted into a pass. Source: 851 unchanged files, SHA256
`74dec3372dbac06bd0e87a3641f9f033841f598365fe955147c27d95880b1c7e`.
Source comparison found no changes. Preservation 57fd5625-da71-4ff1-9f96-
513c840b9e81 confirms the original eight table fingerprints unchanged, integrity
OK / foreign-key violations 0, all 38 saved manifests valid, 3470 selected files
scanned and zero configured-secret matches. The UI manifest is identical to the
preceding accepted build. No required verification process remains running.

## Remaining

The separately approved native three-role run covered the preceding broader
worker policy; its exact resources were removed. No new cloud run is authorized.
Current-policy native/TLS/concurrency, other worker column/verb restrictions,
full job/failure population and deployed admission remain. This does not approve
real-worker Gemini Free processing, hosting, billing or deployment.
