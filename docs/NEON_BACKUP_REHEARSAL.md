# Native Neon Backup Drill

The user authorized official portable client tools and two temporary synthetic
Neon Free databases. No Windows service, PATH change, paid database, public
deployment, existing-database migration or real-worker/provider test is allowed.

## Portable Clients

The official Windows download page links to EDB's binary archives. The downloaded
`postgresql-18.6-5-windows-x64-binaries.zip` is 384,620,317 bytes, with SHA-256:

`e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2`

This matches the checksum supplied by EDB's contributor on its installer tracker:
[EDB checksum](https://github.com/EnterpriseDB/edb-installers/issues/733),
[PostgreSQL Windows downloads](https://www.postgresql.org/download/windows/),
[EDB archives](https://www.enterprisedb.com/download-postgresql-binaries).
The bounded initial download timed out; the resumed file was verified in full
before any executable ran. Only three client executables and adjacent DLLs were
extracted (32 files), under ignored `.tools/postgresql-18.6-5/clients/pgsql/bin`.
Both archive tools report PostgreSQL 18.6. Server executables were not installed
or launched, and PATH was not modified. The runner rechecks the ZIP checksum.

## Isolation

```powershell
node scripts/neon-synthetic-backup.mjs --confirm-synthetic --confirm-two-temporary-databases
```

The default-off wrapper uses the existing isolated direct Neon configuration and
read-only preflight. UUID-derived databases use template0, the existing owner and
a six-connection limit. Each database gets an exact ownership marker and OID;
resource names/phases are journaled before effects. It creates no LOGIN role.

The scratch parent `.tools/neon-backup-private` has inheritance disabled and one
explicit current-user full-control rule. The wrapper checks its Windows ACL before
creating a fresh child. Native credentials exist temporarily in the existing
backup helper's passfile under this restricted parent, not argv or `PGPASSWORD`.
Only Node's bundled trusted certificate roots are supplied to libpq; remote TLS
uses verify-full. Keys, database URLs and provider configuration are not logged.

The existing native test executes the real custom-format `pg_dump`/`pg_restore`,
encrypted database/object archive, complete relational/definition/sequence
inventory comparison, synthetic recording readback, quarantine and immutable
publication check. No hand-maintained JSON-row substitute or mocked native utility
is used. The synthetic test key and payloads are discarded after the test.

The child receives only ordinary OS execution settings plus the exact dedicated
test connections/tool paths. No Gemini, storage, mail, default application DB or
Neon maintenance configuration is inherited as an application setting. Node test
diagnostics are distinct from native-utility warnings: the existing inner native
runner still rejects pg_dump/pg_restore warnings, errors and timeouts.

Cleanup compares existing database ACLs, roles/memberships, original-database
schema/table/function identities/ACLs and defaults against the preflight baseline.
It removes only exact marked/owned/OID-matched databases with zero client sessions;
DROP uses neither FORCE nor CASCADE. Lost CREATE acknowledgements, unknown markers
or outside drift refuse removal. This is catalog/ACL comparison, not a row hash of
every other database. Forced interruption requires journal/scratch reconciliation.

## Evidence

- `artifacts/neon-backup-449b6e85-e38c-4d68-91c4-f6f3a15d344d.json`: first run
  05:12:44-05:18:46 UTC failed, not credited. Both databases were verified removed,
  outside catalog/ACL matched and passfiles were removed. The fixture exceeded its
  previous three-minute test budget; the original generic wrapper did not retain
  an exact child failure diagnostic, so that is not asserted as the only cause.
- Remote fixture budget is now nine minutes, inside a ten-minute owned-process
  bound. SQL/data/encryption/authorization assertions and inner native utility
  failure checks are unchanged. The Node fixture wrapper retains only redacted
  failure status and requires one passed, zero failed, zero skipped test.
- Nine orchestration-focused tests pass, including exact admission, environment
  isolation, owned cleanup, skipped/error rejection, lost acknowledgement, outside
  drift, checkpoint failure and Node/native diagnostic separation. These mocks
  are not actual native backup proof.
- `artifacts/neon-backup-162031cf-aee7-4630-9d43-7d9c4b976a34.json`: second run
  passed, 05:19:18-05:25:34 UTC, terminal exit zero. The real native fixture
  passed one test with zero failures/skips: encrypted native round trip, full
  relational inventory/immutable guard parity, private recording byte readback
  and access quarantine with activation denied. Both marked databases were
  verified removed, outside catalog/ACL matched, and passfiles were removed.

Final focused orchestration verification: 19 tests pass (nine backup and ten
clean-verification tests). The latest full clean snapshot predates the new backup
wrapper: 1,036 tests / 1,032 pass / zero fail / four explicit native-prerequisite
skips. These are separate scopes, not an invented combined full-suite count.
Original eight table hashes match between 05:22 and 05:26 observations, integrity
is OK and foreign-key violations zero. Original and isolated-build manifests each
verify 55 assets; selected source/log/build scan finds zero current credentials.
See `artifacts/clean-backup-preservation-3dee9a71-30cb-4a7a-9b61-e2f0a77f0032.json`.

## Remaining Gates

This fixture covers one synthetic local private recording; all six object families
have embedded coverage, not a complete native/R2 matrix. Private R2 storage,
off-host encrypted backup custody/key rotation, interruption across every backup
phase, source cutoff/privacy replay/retention reconciliation, target activation,
service-specific roles, hosted release and real-worker privacy approval remain
open. Successful restore must stay quarantined, with activation denied.
