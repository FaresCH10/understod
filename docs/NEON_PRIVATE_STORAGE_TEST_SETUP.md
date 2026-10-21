# Private Neon Storage Test Setup

Checked 2026-10-15 against official Neon documentation. This replaces the R2
provisioning request for this project's no-billing synthetic test. Keep Neon Free;
do not add payment details or enable paid services. No public deployment or real
worker data is authorized by these steps.

## Bucket

Use the existing isolated synthetic project, not a customer/production project.
Object Storage is available in Frankfurt, Ohio, N. Virginia and Singapore as of
the check date. On the selected test branch, open Object storage, choose New
bucket, name it `understood-synthetic-test`, and choose Private. Leave it empty.
Do not change the existing PostgreSQL URL, database, role or app settings.

## Credentials

1. On that same project/test branch, open Settings > Credentials, then Create
   credential. Name it `understood-synthetic-storage-test` and select only
   `storage:read` and `storage:write`. Do not add AI, Functions or management
   permissions. These are branch-scoped credentials, not bucket-only credentials;
   use the isolated test project and do not assume bucket-level least privilege.
2. Keep the returned values local: `token_id` is the S3 Access Key ID, and
   `s3_secret_access_key` is the S3 Secret Access Key. Do not use `api_token`, the
   PostgreSQL password or a full-account management API key in their place.
   Store the secret immediately. Do not rely on credential expiry for security;
   Neon's documentation says `expires_at` is not currently enforced. Explicit
   revocation is required after use.
3. Click Connect in the sidebar and open Storage > Parameters only to obtain the
   branch's `AWS_ENDPOINT_URL_S3` and `AWS_REGION`. Do not rotate another
   application's credential or replace the separate credential created above.
4. Fill the existing ignored `D:\understod\.env.neon-storage-test` fields:

   | Local field suffix | Value from Neon |
   | --- | --- |
   | `ENDPOINT` | `AWS_ENDPOINT_URL_S3`, the HTTPS branch storage endpoint |
   | `REGION` | `AWS_REGION`, for example `eu-central-1` for Frankfurt |
   | `ACCESS_KEY_ID` | `token_id` from the dedicated credential |
   | `SECRET_ACCESS_KEY` | `s3_secret_access_key` from the dedicated credential |

   All local field names begin `UNDERSTOOD_NEON_STORAGE_TEST_`. Keep `ISOLATED=true`
   and `BUCKET=understood-synthetic-test`. The endpoint is not the PostgreSQL host
   or the Neon dashboard URL. Never put keys in the example file, source, browser
   code, screenshots or chat. No global AWS environment variables are needed.
5. Reply `Neon storage credentials are ready`. Do not paste any values. The
   isolated check will use only the dedicated settings file, not auto-enable
   storage on the running app. A configuration-only result does not prove live
   connectivity, private access, overwrite protection or deletion behavior.

## Important Production Limits

Neon's S3 API is a subset. It does not enforce stored lifecycle/versioning
configuration, and DeleteObject soft-deletes on the branch. Branches can inherit
older objects. A successful GET/PUT/DELETE smoke test is not proof of irreversible
privacy erasure or an independent off-host backup. Conditional writes, private
access and all six application storage families still need explicit verification
before hosted use. This test setup never silently changes the app's hosted
adapter or the running preview's storage selection.

Neon Free currently includes 5 GB Object Storage per project without a credit
card; that is a quota, not unlimited production capacity or an availability SLA.

## Dedicated Compatibility Probe

The implementation is separate from the app's cloud-storage selection. It does
not import or connect a database or AI provider, create a bucket, change access
levels, provision credentials, enable billing or deploy an application.

```powershell
# Optional explicit import if the four standard AWS_* fields were put in .env.
# Copies only those fields; leaves .env byte-identical and makes zero requests.
node scripts/neon-storage-check.mjs --import-from-env

# Local validation only: zero network requests or evidence writes.
node scripts/neon-storage-check.mjs --check-config

# Only after the isolated private empty test bucket and local keys are ready:
node scripts/neon-storage-check.mjs --confirm-synthetic-private-bucket
```

The live mode requires exactly the dedicated synthetic bucket name, a supported
Neon HTTPS branch endpoint with matching region, and explicit isolated settings.
It first requires an empty bucket, creates one UUID-scoped generated tone WAV,
checks authenticated readback, requires anonymous GET denial, tests
`If-None-Match: *` rejection with unchanged original bytes, and removes only its
own metadata-marked object. A failed/unknown write acknowledgment still triggers
ownership-checked cleanup. It does not recursively remove objects or delete a
bucket. Failed ownership, response, conditional-write or cleanup checks stay
failed. No retry loop silently replaces an ambiguous outcome.

Commands have ten-second request limits and the main probe has a two-minute
budget, followed by separately bounded cleanup. The anonymous request follows no
redirect and sends no credentials. The AWS SDK uses path-style addressing,
explicit credentials and one attempt. Evidence in `artifacts/neon-storage-*.json`
retains only a target fingerprint and bounded outcomes, never keys, private
endpoint, raw provider errors or object contents. An interrupted process can
leave its synthetic probe; inspect the retained evidence and dedicated bucket
before a rerun rather than clearing arbitrary data.

Passing this probe establishes only narrow live S3 compatibility, not all six
application storage families, endpoint authorization, backup custody, permanent
erasure or production readiness.

## Executed Checkpoint

2026-10-15 06:00:42-06:00:45 UTC: live probe passed. Evidence:
`artifacts/neon-storage-3f438b0c-a899-420a-b5ed-a51cefef89d0.json`.
The operator entered standard AWS_* fields in ignored `.env`; explicit import
copied only those four settings to ignored `.env.neon-storage-test`. The source
`.env` was verified byte-identical during import. Local config validation made
zero network requests before the separately authorized live probe.

The actual S3 check verified authenticated WAV byte readback, anonymous GET
denial, conditional overwrite rejection, unchanged original bytes and removal
from the current branch. No database writes, AI calls, real data, access-level
changes, billing activation, app storage switch or public deployment occurred.
This is not permanent-erasure or all-family application acceptance.

Final focused local tests: 19 passed, zero failures/skips, including existing R2
adapter regression. The import fixture initially hit Windows sandbox EPERM for
atomic rename; with normal approved file-replacement permission all 14 Neon tests
and then the combined 19 tests passed. No assertion was weakened. The tests and
source edits were not part of the earlier full clean-install suite. A read-only
scan of 1041 selected source/evidence files found zero current Gemini/Neon
database/storage credential values; both private env files are Git-ignored.

### Application Adapter Follow-Up

The application now has an explicit `neonAudioStore` using the same scoped
WAV/original integrity and conditional-create implementation as R2. Hosted API
and worker launchers select it only through `UNDERSTOOD_STORAGE_ADAPTER=neon`
with separate server-only `UNDERSTOOD_NEON_STORAGE_*` settings. Standard AWS_*
fields and dedicated test settings cannot auto-enable it. Migration087 adds a
distinct Neon identity to the immutable optional health journal. No existing
database or preview was migrated/restarted for this change.

Forty-seven focused local tests passed across the Neon probe, application
adapter, existing R2 regression, hosted HTTP/configuration, storage health and
migration/upgrade checks. That is not a live all-family application workflow or
production release. A fresh isolated full install/build/regression is a separate
checkpoint; do not substitute the earlier 1036-test clean result for new source.

Fresh clean verification subsequently passed06:11:07UTC in
`.clean-check/e40616ec-6d21-4ee4-abe7-bb80e27dbe3b/result.json`: offline locked
install/build,1062 tests/1058pass/zero fail/four skips,43mocked contract checks and
nine scripted pipeline checks. All794 selected source hashes stayed unchanged.
This run did not inherit cloud configuration and did not copy original data.
Read-only preservation then verified all eight original table hashes unchanged,
integrityOK/FK0 and all three55-file shell manifests matching.1133selected files
had zero current Gemini/Neon database/storage credential matches. Native cloud
database evidence predates the new migration087; it is not a new native087 pass.

### Six-Family Application Follow-Up

2026-10-15 06:55:11UTC: the separately approved live application test passes all
six families/nine scoped objects through the actual Neon adapter,ten backend
workflow checks,authenticated readback,anonymous denial,conditional PUT412 and
unchanged bytes. Exact owned objects removed,current branch empty. The DB was
PGlite and providers scripted;no cloud DB writes,realdata,AI/mail,billing,
application switch or deployment. See NEON_APPLICATION_STORAGE_REHEARSAL.md.
Fresh clean1084tests/1080pass/zero fail/four skips and both evaluations pass.
Native87migration/API-worker role proof now also exists separately in
NEON_LOGIN_REHEARSAL.md;earlier native086 limits above are historical.
Storage readiness55%,overall71%,not production ready. Permanent-erasure/history/
backup accounting remains explicitly open in NEON_STORAGE_PRIVACY_GATE.md.

Sources:
- https://neon.com/pricing
- https://neon.com/docs/storage/overview
- https://neon.com/docs/storage/buckets
- https://neon.com/docs/storage/authentication
- https://raw.githubusercontent.com/neondatabase/website/main/content/docs/storage/authentication.md
- https://neon.com/docs/storage/s3-compatibility
