# Customer And Worker Control Boundaries

2026-10-15. Local implementation checkpoint,not production readiness.
Overall remains about71%;service-role hardening70% (was65%). The narrower
control-plane permission/embedded-workflow task is85%,with native/deployed gates
still open. Operator-service isolation remains70%;its column profile is unchanged.

## Changed Authority

- [x] Application SELECT retained but INSERT/UPDATE/DELETE removed from
  `tenant_controls`,`system_controls`,`provider_policies`,`provider_verifications`
  and `operator_requests`. Customers cannot suspend a tenant,pause all jobs,
  increase provider quota,forge provider verification or insert operator receipts.
- [x] `operator_audit` hidden from both application and worker roles,including
  all DML. Operator identity/session/throttle tables remain hidden. Real operator
  actions and maintenance provisioning use their own separate authority.
- [x] Required application control reads remain. In particular,customer retry
  generation counts actual operator assessment-retry receipts read-only,so old
  customer intent cannot be replayed after an operator retry. The three-role test
  preserves global dispatch pauses and confirms that only the worker claims work.
- [x] Startup inspection rejects legacy whole-table and column write grants on
  the newly read-only controls. Existing directly connected role,owner,membership,
  DDL,future-object,sequence,grant-option and durable source-fence checks remain.

| Profile | Tables With Some Write Authority | Read-Only Tables | Hidden Tables |
| --- | ---: | ---: | ---: |
| Application | 118 | 12 | 4 |
| Worker | 97 | 28 | 9 |
| Operator | 15 | 20 | 99 |

The catalog remains134 tables and88 migrations;no new migration is added here.
Operator counts include three no-change lock-only tables. Application and worker
are still broader table-based policies,not complete positive verb/column profiles
or per-tenant RLS. API access to worker-health/storage journals remains unchanged
pending removal of the legacy combined-role rehearsal dependency;this checkpoint
does not claim all worker-only writes have been removed.

## Actual API Pipeline Evidence

The fixed scripted pipeline now configures a distinct application LOGIN role as
well as the existing worker role. All ten customer stages execute under actual
application ACLs. Each entire awaited worker task runs under the worker identity,
then restores the application caller before continuing. Identity is checked on
entry,exit and restoration. There is no per-query role switch or owner fallback.

Four explicit fixture-only maintenance actions remain:workspace bootstrap,
initial provider policy setup,provider pause and provider resume. These establish
test inputs/control states,not fabricated business outcomes. Source upload,
grants/redemption,transcription,preparation/translation/four speech tracks,
publication/private playback,typed/recorded answers,clarification follow-up,
case voice and reports still use normal application/worker functions.

The report adds `apiPermissions` with profile/counts,ten executed stage names,
the four maintenance action names and explicit embedded/not-native identity.
The worker report no longer labels the API as a schema-owner fixture. Fifteen
worker task executions,24 scripted requests,16 operations,nine objects/all six
audio families and all original business/scope/privacy assertions are retained.
No Google request or cloud storage write is made by local verification.

## Upgrade And Evidence Limits

Old application roles with the previous control writes or audit access,and workers
with old operator-audit grants,fail current admission. With approved dedicated
targets and stopped writers,use the existing explicit maintenance configuration
procedure for every runtime profile. No cloud ACL or existing local database is
changed by editing this policy. Do not bypass inspection or switch service mode
to preserve old grants. The separate operator profile remains required.

Focused seven-file regression:57pass/zero fail/zero skips,21018.5325ms,
87349terminal0. Final five-file regression includes true three-role customer
retry,all ten restricted API stages and the mocked S3 six-family runner:
47pass/zero fail/zero skips,36070.3477ms,72375terminal0.

First full clean493d367d-40ca-4b44-9ddb-536f28fb77d0 failed:1115total,
1110pass/one failure/four native-prerequisite skips. Windows returned UNKNOWN
while opening016_draft_reviews.sql from the copied source before a restore-domain
assertion. Both original/copied file hashes matched. The unchanged snapshot's
entire15-test restore-retention file then passed,73965.9913ms,27941terminal0.
The filesystem cause is not established;the full failure is retained/uncredited,
and no assertion,permission or file-read retry was weakened to hide it. The new
full clean rerun d95947b4-ac0d-41d1-8ac8-b93ef550bb22 passed at13:45:24UTC:
1115total/1111pass/zero fail/four native-prerequisite skips,265936.7204ms;
43mocked contract/ten scripted pipeline checks pass. All814source files remained
unchanged, SHA256 b97eeaf7bd25f7ee563e1920da18320ae9e5161ac9ce170df4e0cb1055a3c752.

PGlite uses SET SESSION AUTHORIZATION on a single initial owner connection.
Effective SQL ACLs are exercised,but this is not three independent native LOGIN
authentications,TLS,pooling,concurrent processes or deployed service isolation.
Earlier native87/two-role and live storage tests used older profiles and are
historical,not new-policy proof. Native88/three-role acceptance requires a
separately prepared,explicitly bounded authorization. No such cloud test ran here.

## Rendered Work Resumed

Supported Cua browser access recovered during this checkpoint. A separate
in-memory SQLite fixture on3192/3193 served the new optimized build;no original
data or preview was used. Actual navigation,member paging006-010,selection of
office members027-030 and EN-to-AR/RTL switching were observed. Header counts
remained30/24/21/3/6. At320px,the page had no horizontal overflow while the table
had its own680px scroll region. These are partial observations,not full S27,
matched-reference,keyboard/assistive-technology or four-width acceptance.

New confirmed defects to fix next:English table headings split within words at
1440px and contact names split within words at320px. Arabic1586x992 and English/
mobile initial screenshots are saved under artifacts/site-crews-*-2026-10-15.jpg.
The first mobile capture was unsettled;the later observed capture shows the
actual wrapping defect. Full-page screenshot was unavailable;the supported
viewport capture worked. A label locator and nonfocusable-main key action failed;
the visible combobox and a focusable button worked. No Reticle verdict is claimed
or external diagnostics sent. No crew/worker domain mutation was performed.
The owned QA tab closed,viewport reset,fixture64194 stopped terminal interrupt;
an unsuppressed OS query confirmed zero listeners3192/3193. Other tabs were kept.

## Still Required

- [ ] Fix and verify the newly observed S27 desktop/mobile wrapping defects,
  then complete create/edit/membership/frozen-report/reference/keyboard journeys.
- [ ] Native88/three-role and new-policy workflow/denial/fencing/cleanup proof.
- [ ] Remaining API/worker positive column/verb restrictions and worker-only writes.
- [ ] Dedicated operator default entry and provider-test delegation;actual host/
  proxy/browser/service separation. All previous privacy,backup,device,language,
  accessibility,live-quality,CI and authorized release gates remain open.
