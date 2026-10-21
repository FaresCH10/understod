# Worker Identity Permissions

20 October 2026 continuation: the current139-table worker profile also narrows
case_reviews to UPDATE(reason), case_repeats to UPDATE(status), and case_voice
to lifecycle/cleanup columns only, with no review sequence or staff audio
authorship/receipt authority. It now has84 ordinary-DML tables,ten column-restricted,
34 read-only and11 hidden. API/operator grants are unchanged. See
WORKER_CASE_WORKFLOW_PERMISSIONS.md and STAFF_CASE_RECORDINGS.md. The migration092
checkpoint below is historical; no current migration095 native acceptance is claimed.

## Scope

The worker must lock staff/account rows while issuing synthetic recovery and
invitation mail, checking publication schedules and export authority. It does
not need direct identity administration. Current source therefore grants:

| Table | Worker permission |
| --- | --- |
| staff | SELECT, UPDATE(id) for locks only |
| staff_accounts | SELECT, UPDATE(id) for locks only |
| staff_credentials | SELECT, UPDATE(staff_id) for locks only |
| staff_access_revisions | SELECT, UPDATE(staff_id) for locks only |
| staff_account_memberships | SELECT only |

Migration092 adds four invoker triggers backed by
`restrict_identity_runtime_update()`. A column-restricted runtime can execute
an unchanged-row update, but every actual row change raises42501. Existing
application/maintenance table-level UPDATE continues to use its existing
business guards. No new security-definer function or elevated runtime role is
introduced. Original migrations and application/operator grants are unchanged.

Worker admission verifies the exact normalized guard body SHA256
`38eaa5c1a9d3cb4a626fd7179b25a333a64aab24145a31748e443718e5f8a54e`,
invoker/function attributes and all four unconditional enabled BEFORE UPDATE
triggers. Positive column ACL inspection rejects missing locks, broad/extra
columns, PUBLIC/delegated grants and unexpected future columns. Owned sequences
are not granted for these tables. Source fencing removes their lock grants.

The full137-table worker policy now has87 ordinary-DML tables, seven
column-restricted tables,34 read-only and nine hidden. The seven include the
verification-job result columns and six immutable identity/scope lock tables.
The94 write-capable count does not mean94 unrestricted-DML tables.

## Focused Local Evidence

- Populated identity records, required SHARE/UPDATE locks and no-op lock-column
  updates remain available; direct password/email, role/active/name, revision,
  account and membership writes fail without changing those records.
- Broad, extra-column, delegated, PUBLIC, membership and sequence grants fail
  admission. A future-column write also fails at the immutable guard before
  admission detects the unwanted grant. Guard disable/drop/replacement fails
  admission and configuration; restoring the exact policy recovers.
- Distinct API/worker identities issue recovery and invitation mail through an
  injected local sender. Worker delivery leaves all identity records unchanged.
  API password reset and invitation signup still work; the worker then sends
  the password-change notice. No actual mail or provider calls occur.
- The populated91-to92 upgrade leaves identity rows unchanged and is repeatable.
  Existing actual scheduled-publication/retention and expanded mixed-role fence
  checks pass. Focused50-check regression passed, and three final
  upgrade/schedule/fence checks passed after the fixture expansion.

Fresh clean verification `b8ad7ba7-38a4-41b3-8800-1be5b67ef396` finished
2026-10-19T09:32:56.405Z, exec63134 exit0: offline locked install/build,
1,215 tests /1,211 passed /zero failures /four native-only skips,
302056.8915ms. All43 contract and ten scripted pipeline checks passed, with
24 scripted and zero external provider requests. All853 selected source files
remained unchanged, SHA256
`e838db8a08edcfaa2487f8bf619a28b01d5ba1f39c215d97a21698eeb75dddcc`.
The UI shell manifest matches the preceding accepted clean build.

Preservation evidence `clean-backup-preservation-22992542-0493-4065-b4b0-a9a5a2243085.json`
confirms the original eight table fingerprints match baseline, integrity is OK,
foreign-key violations are zero, and all39 saved build manifests validate.
3,538 selected files had zero configured-secret matches. Initial focused runs
exposed a guard-hash construction mistake and a test restoration-SQL typo;
both were corrected before the accepted focused/full runs, not counted as passes.

## Limits And Rollout

This is direct-write isolation, not password-material confidentiality or complete
account-compromise isolation. The worker still reads credential material and
has intentionally trusted recovery/invitation token issuance. Metadata-only
credential reads and further positive verb/column restrictions remain open.
PGlite role tests do not prove native locking/concurrency or hosted separation.

No existing Neon schema/ACL was changed. The historical native91 acceptance
does not cover migration092 or the newer worker library/scope restrictions.
An authorized rollout must stop writers, preserve backup/evidence, apply current
migrations through the maintenance owner, explicitly reconfigure runtime
profiles, and prove read-only admission before restarting services. Old broad
worker grants fail current admission; startup never repairs ACLs automatically.
No cloud test, billing change or public activation is authorized by this change.
