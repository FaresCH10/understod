# Worker Library Permissions

2026-10-19 locally verified. Narrow local library restriction100%;broader service-role least-privilege task remains75%;
overall73%. No cloud permission change or production-readiness claim.

## Boundary

The worker profile previously granted ordinary DML on customer templates,
template_versions,glossary_terms andglossary_versions. Registered worker tasks
consume glossary snapshots but do not own library editing. The profile now grants
SELECT only on all four. Customer API grants are unchanged; no schema migration,
new role, database credential or security-definer function is introduced.

Current catalog summary has137tables:94ordinary-DML worker tables,one separately
column-restricted verification-job table,33read-only tables and9hidden tables.
The existing summary's writableTables value95 includes that restricted job table;
it does not mean95full-DML grants. The earlier native result covered98ordinary
DML tables plus the restricted job table and29read-only tables.

Existing startup inspection rejects old library-write grants or later drift.
Reconfiguration remains an explicit maintenance-owner operation with dedicated
database and stopped-writer confirmations; startup never changes grants. Existing
column drift, membership, ownership, function and future-object checks remain.

## Local Evidence

The populated embedded test runs real customer API-role template/glossary create
and template use functions, then changes only its disposable local role profile.
It proves12direct INSERT/UPDATE/DELETE denials,actual archive/glossary edit function
denials,readable glossary snapshot,two actual preparation jobs retaining the
current glossary dependency,and unchanged four-table library inventory. The
glossary edit deliberately invalidates the original fixture draft,so both its
job and the template-derived draft must finish before asserting readiness.

For each library table,restoring legacy broad DML causes startup inspection to
fail. Explicit local maintenance reconfiguration restores the restricted profile
without business changes. The existing scheduler,permission/fence,approval and
scripted private-audio pipeline tests remain separate regression coverage.

Initial test harness failures were an incorrect expected table count,missing
explicit synthetic preparation mode and checking the second draft after only one
job. The production guard was not relaxed. An unused wrong snapshot field was
also corrected before reaching it. Final focused28pass/0fail,23521.313ms;
isolated new test1pass/0fail,2745.7249ms;TypeScript passes.

Sandbox clean de67c60e-cf2a-4aca-be75-240555d1466f,exec21665 exited1. Offline
install/build passed,but1207tests ended1070pass/133fail/4skip,321764.413ms.
Failures include loopback EACCES,sandbox temporary rename/symlink EPERM andderived
session unavailability;this is not accepted as a passing regression. The failure
breakdown is126EACCES/4EPERM/3session errors. Same-snapshot receipt/permission
checks with loopback/temp access passed17/17,18748.0559ms,actualexit0.
Full unchanged retry6a316e16-71db-4f30-bf19-33ef1afb0a19,exec61661 exited0:
locked offline install/build,1207tests/1203pass/0fail/4native-only skips,
312692.2259ms,43contract/10pipeline checks. Started08:53:13.571UTC,
finished08:58:44.261UTC. Source850files unchanged. This is local scripted
regression,not semantic-quality approval ornative/hosted permission acceptance.
Its850sourcefiles SHA256 is
`689dc6cdce82e0ebd208a000b2cde5f8947d67859cabe01c7b82c5f6ebdea6ad`.

Preservation70897e61-12aa-498a-b211-7edbc6eebd7d confirms original eight table
fingerprints unchanged,integrityOK/FK0,37saved manifests valid,3403selected files
and0configured-secret matches. No required verification process remains running.

## Remaining

No existing Neon role has been reconfigured. A native run of the revised policy
would need fresh bounded authorization; none is inferred from the consumed
three-role retry approval. Larger positive column/verb allowlists,worker access
to other customer records,full task population/failure cases and actual hosted
admission remain separate requirements. This four-table restriction does not
complete least privilege or certify a real-data deployment.

Next investigation:organization/site reads use FOR SHARE in operational and
site-access admission. Existing migration088 has immutable column-lock guards
for those tables,but the worker currently retains broad table UPDATE. A future
positive lock-column policy must inspect the exact guard before replacing these
grants and must exercise populated scheduler/retention/deletion paths. Crew reads
and membership deletion have different dependencies andmust notbe conflated.
This note isnot an implemented restriction orauthorization to alter a target.
