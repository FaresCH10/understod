# Post-Backup Privacy Reconciliation

2026-10-12 current: all six production replay commands require the exact encrypted
predecessor checkpoint. Use the restore's quarantine state first, then the previous
replay state. A file-synced encrypted successor is prepared under locks before
commit; reuse checks exact inventory plus committed per-site receipts. Missing,
stale, drifted, wrong-target/purpose and rolled-back states reject. Legacy low-level
receipt-only retries do not certify a state chain. Physical cleanup accounting,
native/cloud proof and activation remain open. See RESTORE_STATE_ACCOUNTING.md.

Current source freshness now uses the complete v7 source inventory, not only
accepted-input projections: every table, precise sequence, guard definition and
known private reference is compared against the backup in both directions. Plans
include encrypted `sourceSnapshot` differences; stdout exposes aggregate source
change counts. SOURCE_CUTOFF.md describes an authenticated read-only source
observation with actual private-byte readback/absence. It does not freeze later
source writes, certify target business parity or authorize release.

2026-10-11 current: v7 includes precise original typed/audio acceptance receipts
and hash-only answer/result/transcript evidence. Read-only input lifecycle gaps
cover post-backup submissions and staging acceptance across private families.
Retention CLI requires this ledger and denies cleanup before any cycle on gaps,
conflicts or unverified retained bytes. Missing input requires a fresh full
stopped-source DB/object backup, never invented receipts/clocks/results. See
RESTORE_ACCEPTED_INPUTS.md. Final source cutoff and activation remain closed;
older v6 exports must be replaced by a newly authenticated source export.

2026-10-11 current: v6/migration 082 add confirmed quarantined historical briefing
redaction with separate fresh target erasure and immutable root source provenance.
Second backups preserve the root capsule; eight target projections and original
lineage must match. Policy/version/outcome/case clocks are not rewritten. Fresh
generated cleanup is required, and expired content cannot accept new worker work.
Use the `briefings` command described in BRIEFING_RESTORE.md. Accepted-input/final
source cutoff, native/cloud and activation remain unfinished. Older checkpoint
statements below about briefing replay being next are historical.

2026-10-11 current: v5 adds original briefing expiry context captured atomically
by migration 081, plus all eight current content-projection hash groups. A changed
expired source snapshot can bind an unchanged older target only through its
original purge hash; changed or extra target content still fails closed. Missing
original capture, retrospective backfill and old v1-v4 ledger formats are denied.
Planning remains read-only; historical briefing mutation/root replay is next.
See BRIEFING_EXPIRY_PROVENANCE.md. No activation or readiness promotion.

The preceding v4 checkpoint covers all six current retention policies, including
activity identities and archived briefing content, with exact original receipts.
Migration 080 adds quarantined historical activity redaction replay. It retains
the original minimal event/expiry/policy evidence, creates a fresh target purge,
preserves current disabled/extended policies, and keeps mandatory operational
receipts independent. Failed completion audit rolls back; exact retry is
write-free. A later backup carries the root source expiry proof rather than
inventing an original expiry from its later target-cleanup timestamp.

Use the same stopped-source export and confirmed distinct-target workflow:

```powershell
node scripts/postgres-privacy.mjs activity BACKUP LEDGER NEW-RESULT --writers-stopped --isolated-target --confirmed --state-file=PREVIOUS-RESULT/replay-state.enc --state-kind=replay
```

Replay original activity policy receipts before this operation. The encrypted
result is `privacy-activity.enc`; the immutable operational receipt recovers a
lost acknowledgement. Inspection exposes `historicalContentReplayPending` for
activity and briefing content. Historical briefing-content replay, accepted-input
reconciliation, final source cutoff and activation are still unfinished. An
expired publication with an unbound changed content hash continues to fail
closed, not silently pass comparison. Every result remains activation-forbidden. Older
checkpoint text below is historical when it refers to v3 or four policies.

2026-10-11: migration 078 captures exact mandatory access/restore receipts in a
separate immutable operational lifecycle. The existing v3 `access_audit` fields
and exact replay marker lookup now read these receipts, so activity identity
expiry cannot erase required source restriction/quarantine/retry evidence.
All access fences remain; no activation is authorized. Later source activity
policy/redaction replay remains unimplemented. See OPERATIONAL_PROVENANCE.md.


The database/private-object backup is an older point in time. Its elapsed-policy
sweep cannot discover later deletion requests, revocations, changed retention
policies or content already retired by an earlier policy. Do not activate a
restore on the strength of that sweep alone.

`server/postgres/privacy-ledger.mjs` exports a bounded source ledger, compares it
with an isolated quarantined restore, and atomically replays original worker
deletion decisions, all six current retention policies and historical privacy
retirements and later staff/worker/site/tenant access restrictions. Accepted-input
lifecycle reconciliation and the final activation gate remain unfinished.
Every result has `authoritativeReconciliationComplete:false`,
`activationAllowed:false` and `productionReady:false`.

## Source Export

Stop application writers and cleanup workers on the original backup source.
Pause global jobs/provider dispatch. Use the original encrypted backup and its
backup key; never put the key or database credentials in command arguments or
chat. Configure `UNDERSTOOD_POSTGRES_URL`, `UNDERSTOOD_POSTGRES_TLS` and
`UNDERSTOOD_POSTGRES_CA_FILE` using the same direct-connection/TLS rules as the
native backup command. `UNDERSTOOD_BACKUP_KEY` is the existing backup key.

```powershell
node scripts/postgres-privacy.mjs export BACKUP NEW-LEDGER --writers-stopped
```

Export validates migrations read-only and uses a repeatable-read transaction,
migration serialization and server-quoted locks on every discovered application
table. It requires paused dispatch, no recent live worker and no active lease.
The ledger binds the original database endpoint identity, exact baseline
inventory/archive/object metadata and schema. Capture uses the source server's
clock; table/object/size bounds reject oversize exports rather than truncate.

The new private directory contains AES-GCM encrypted `manifest.enc`. It includes
original scoped decision/cleanup receipts, current policies/restrictions, six
families of object references, immutable content hashes and minimal identity and
redaction metadata. Worker answers/transcripts, publication bodies, staff names,
email addresses and worker labels are not exported. IDs, request payloads and
receipt metadata are still private; protect the file and key accordingly.
Source rows, object bytes and access are not modified. No provider, mail or
private-storage call runs.

The current format is `understood-postgres-privacy-ledger-v8`. It includes
audio/case birth metadata, restored-retirement provenance, original access
receipts and credential change fingerprints. Names, email, salts, password hashes
and session tokens are not exported. Version8 also binds private case audio to
its original worker/staff purpose and staff author/role without exporting audio
or staff labels. Earlier v1-v7 ledgers lack the current required bindings:
re-export from the stopped original source rather than modifying an old ledger.

## Read-Only Comparison

Use a distinct isolated restored database, stop its writers/workers and retain
the matching `backup.restore.quarantined` evidence. Configure the corresponding
`UNDERSTOOD_RESTORE_POSTGRES_URL`, `_TLS` and `_CA_FILE` variables.

```powershell
node scripts/postgres-privacy.mjs plan BACKUP LEDGER NEW-REPORT --writers-stopped --isolated-target
```

The comparison authenticates both manifests, verifies migration and guarded
database definitions, locks all tables and checks quarantine. It compares
immutable publication/assignment/accepted-input/export/import identities before
reporting missing original decisions/actors, policy changes, restrictions,
redactions and object retirements. A redaction marker or absent transcript alone
does not establish deletion authority: an original deletion decision or scoped
retention tombstone is needed. A policy at the same revision with different data
is a conflict, not an update.

`privacy-plan.enc` is encrypted and bound to the backup/ledger purpose. Standard
output contains aggregate counts only, not worker/actor conflict identifiers.
The command exits 2 because reconciliation and activation remain incomplete.
An empty conflict list does not prove reconciliation, physical object absence,
provider readiness or authorization to release the restore.

## Decision Replay

These maintenance-only commands require explicit confirmation, a new result
directory, the distinct target, stopped writers and the full quarantine. They
have no customer HTTP endpoint and never fabricate an authenticated session.

```powershell
node scripts/postgres-privacy.mjs deletions BACKUP LEDGER NEW-DELETION-RESULT --writers-stopped --isolated-target --confirmed --state-file=RESTORE/quarantine-state.enc --state-kind=quarantine
node scripts/postgres-privacy.mjs policies BACKUP LEDGER NEW-POLICY-RESULT --writers-stopped --isolated-target --confirmed --state-file=NEW-DELETION-RESULT/replay-state.enc --state-kind=replay
```

Both operations recheck the comparison under all-table exclusive locks. Any
conflicting immutable input or decision rejects the transaction. Missing actors
are inserted with the original scoped ID/role, a `[Restored privacy actor]`
placeholder name and `active=false`. No credentials, account membership, token,
email or session is created. This identity preserves authorship; it does not
assert that the actor's current role was their role at the original decision.

Deletion replay restores only decisions for workers actually present in the
older target, preserving request ID, actor, fingerprint, reason and timestamp.
It disables the worker and fences processing. Original source redaction,
pseudonym, purge and deletion-completion claims are not copied: restored content
and physical bytes need their own cleanup and absence checks. Run the existing
isolated retention sweep afterward; its success still does not authorize release.

Policy replay preserves the original receipts, including confirmed disables,
and exact current policy revision/days/update time for audio, response text,
resolved-case content and generated audio. Changed policies must have matching
original decision evidence, and older or same-revision conflicting policies are
rejected. It never treats a longer/disabled current policy as permission to
restore content retired under an earlier policy. Those historical tombstones
are replayed by the separate command below, after deletion and policy decisions.

Decision rows, disabled actor placeholders, worker/policy updates and per-site
audit receipts commit atomically. Receipts bind backup ID, ledger ID, full ledger
fingerprint and operation. Exact retry performs no writes; changed content under
the same ledger ID conflicts. Result files are purpose-bound encrypted
`privacy-deletions.enc` / `privacy-policies.enc`. If acknowledgement encryption
fails after database commit, preserve that evidence and retry the same ledger
with a new result directory: the database receipt resolves the accepted operation
without importing it again. Both commands still exit 2 and forbid activation.

## Historical Retirement Replay

```powershell
node scripts/postgres-privacy.mjs retirements BACKUP LEDGER NEW-RETIREMENT-RESULT --writers-stopped --isolated-target --confirmed --state-file=PREVIOUS-RESULT/replay-state.enc --state-kind=replay
```

This operation first requires matching original deletion/policy decisions and
their receipts. Migration 073 supplies a separate immutable
`restore_privacy_retirements` journal. Each proof binds the backup, ledger and
full fingerprint, exact scoped input identity, original source receipt/policy
and capture time. SQL guards recheck full quarantine and original policy receipt,
the original retirement cutoff and case activity. No trigger is disabled and no
case resolution clock, publication, assignment, outcome or current policy is
rewritten. This matters when an earlier shorter policy erased content but the
current policy was subsequently lengthened or disabled.

Original case-resolution evidence stays in the proof journal; an older backup
case may still honestly be `open` with no resolution clock. A later backup of
that restored database carries the original provenance for another restore.
Fresh target tombstones redact attempt answers/reasons/evidence, recording
transcripts and case/conversation/follow-up text, and expire associated exports.
Original completion times are preserved as source evidence, not copied as target
completion claims.

Recording and original/canonical source purge intents are queued anew. Attached
generated bundles, follow-up audio and case voice are fenced for fresh cleanup.
Physical bytes are not deleted by this command, and original `complete`/`cleaned`
claims are not installed as target success. Run the isolated retention sweep to
verify actual target absence across all six private-object families and retained
object integrity. A delete acknowledgement without absence remains retryable.

Proof, redaction, cleanup queue and per-site audit commit atomically; audit failure
rolls them all back. The encrypted `privacy-retirements.enc` result binds the
backup/ledger/operation purpose. Exact retry is write-free and recovers an accepted
operation using a new output directory. The command exits 2, including after a
successful replay: accepted-input lifecycle, final source cutoff and activation
are still outstanding.

Unsupported or changed immutable accepted-input lineage fails closed. In
particular, this operation does not yet reconcile staging-to-acceptance events
that occurred after the backup. Do not
treat a partial replay or a comparison without conflicts as full reconciliation.

## Access Restriction Replay

```powershell
node scripts/postgres-privacy.mjs restrictions BACKUP LEDGER NEW-ACCESS-RESULT --writers-stopped --isolated-target --confirmed --state-file=PREVIOUS-RESULT/replay-state.enc --state-kind=replay
```

Migration 074 adds immutable backup/ledger/fingerprint-bound source and target
access proofs. Restore quarantine now disables all credential accounts and
platform operators, in addition to revoking sessions, grants and links. Read-only
comparison and all replay operations reject an active account/operator target.
Historical secrets are not copied or usable; fresh credentials and a separate
authorized activation workflow are still required.

Replay applies original staff roles/revisions and later staff/worker disables,
preserving original scoped decision receipts, actors and timestamps. It never
reactivates a previously disabled worker/staff member, resumes a paused site or
unarchives a site. Target tenant maintenance suspension stays unchanged; original
source tenant decisions and credential fingerprints remain separate provenance.
Missing original staff actors are inactive placeholders without accounts or
credentials. A cross-site decision whose origin site is absent from the older
backup stays in provenance; no site, credential membership or session is invented.

Updates, original receipts, provenance and audit commit atomically. Exact retry
is write-free; changed contents under the same ledger ID reject. The encrypted
`privacy-restrictions.enc` acknowledgement has its own backup/ledger-bound purpose.
The command exits 2 and keeps reconciliation incomplete and activation forbidden.
It does not prove native/cloud recovery or establish a final source cutoff.

## Remaining Gates

- Reconcile accepted-input/staging lifecycle changes after the backup without
  weakening immutable input or inventing original acceptance evidence.
- Reconcile broader privacy lifecycle not represented by the implemented decisions.
- Verify restored private-object absence and retained-object integrity after
  local cleanup; never substitute source success receipts for target proof.
- Bind a final source cutoff and reconcile newer events while the source is
  stopped, before any separately authorized activation. An old ledger is not a
  perpetual proof that no later privacy request exists.
- Execute native PostgreSQL concurrency/restore, Neon/private-storage and
  deployment/privacy/release gates. Embedded and scripted tests do not prove them.

The source and backup key holder are trusted maintenance authorities. Encryption
detects corruption/wrong purpose and the endpoint/baseline bindings prevent
accidental cross-restore use; it is not independent proof against a malicious
key holder or database administrator. Missing source evidence is a stop condition,
not permission to infer a decision. Keep restores quarantined. Gemini free-tier
processing remains synthetic-only; none of these commands invokes AI.

## Local Evidence

`tests/privacy-ledger.test.mjs` uses disposable physical embedded PostgreSQL
copies and real SQL guards. Only the unsupported snapshot-ID transport is
scripted; no native pg_dump, cloud, mail, provider, real worker data or original
preview database is used. Object cleanup assertions use explicit absence mocks,
not a claim about actual remote byte removal. Authored encrypted backup metadata
tests command binding, not native archive transport. See the dated checkpoint
artifact for actual passing counts and recorded failures.

`tests/restore-privacy-retirements.test.mjs` additionally creates actual synthetic
WAV/original files in distinct owned local storage roots and physically removes
all six source families before extending the policy. It proves fresh target
queues retain bytes until the actual sweep removes them, disabled-current-policy
non-resurrection, atomic rollback, immutable/quarantine guards, encrypted command
admission/retry and another restore's inherited case provenance. Past resolution
is explicitly authored only while constructing the source fixture, then the
clock trigger is re-enabled before operations. It is not proof of a historical
user workflow or native PostgreSQL/cloud byte deletion. No preview data, real
workers, AI, email, hosting or remote storage is used.

`tests/restore-access-restrictions.test.mjs` exercises actual source credential,
staff, worker, site and tenant operations in disposable embedded databases, then
restores the older physical copy. It checks unusable restored credentials,
original receipt preservation, absent-origin provenance, immutable guards,
audit rollback and encrypted exact retry. Snapshot-ID transport and archive
metadata are authored fixtures, not native backup or HTTP/concurrency proof.
