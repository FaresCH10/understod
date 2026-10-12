# Restored Retention Sweep

2026-10-12 current: production retention now requires an exact encrypted state
predecessor and accounts each database commit/private removal separately. V3
results retain raw source-input gaps plus narrowly bound authorized-cleanup counts.
Migration 083 preserves actual per-site transition receipts. Lost/uncertain
acknowledgements, drift and reappearing bytes cannot release the target. See
RESTORE_CLEANUP_ACCOUNTING.md for evidence, recovery order and remaining gates.

Current production CLI admission also requires a stopped-source privacy/acceptance
ledger v7. Missing/changed accepted inputs or unverified retained bytes block all
cleanup before the first cycle. See RESTORE_ACCEPTED_INPUTS.md. The low-level sweep
below remains an elapsed-policy operation, not authoritative release evidence.

This is an isolated maintenance operation, not restore activation or production
readiness. It executes the policies and worker-deletion requests **already present
in the restored database**. Authoritative post-backup deletion/revocation requests,
policy changes and retirement/redaction evidence still require a separate
reconciliation mechanism. An old backup alone cannot prove their absence.

## Admission

Stop every target API, worker and maintenance writer. Keep the restored database
and private namespace isolated. Use the matching trusted encrypted backup manifest
and the same backup encryption key, supplied through the environment rather than
command arguments. No existing preview, source database or real-data provider
operation is authorized by this command.

The command uses the `UNDERSTOOD_RESTORE_*` database/TLS/private-storage variables
documented in POSTGRES_BACKUP.md. For local storage, select the **existing restored
audio directory**, not a new empty directory. The target database identity must
not equal the original source identity. Native tools are not run for this sweep.
Remote connection configuration still requires verified TLS and explicit CA.

```powershell
node scripts/postgres-backup.mjs retention D:\private-backups\BACKUP D:\private-scratch\NEW-RETENTION-SCRATCH --ledger=D:\private-ledgers\SOURCE-LEDGER --state-file=D:\private-scratch\PREVIOUS\replay-state.enc --state-kind=replay --isolated-target --writers-stopped
```

The scratch directory must be new. The encrypted manifest supplies the schema and
backup identity. A matching quarantine audit must exist for every restored site;
all tenants must remain suspended, jobs/providers paused, sessions/grants/unused
links revoked, pending invitations cancelled, queued private mail expired and
provider requests no longer dispatching. Current migrations are checked read-only.
A session advisory lock prevents a second sweep of the same schema. The command
does not migrate, seed, reactivate access, send email, publish or call AI.

## Cleanup And Evidence

The bounded sweep uses the existing application operations for:

- Interrupted staged worker recordings.
- Worker recording audio and supervisor source original/canonical audio expiry.
- Response-answer and recording-transcript expiry.
- Resolved-case content expiry, preserving recent/open cases.
- Generated briefing audio retirement and physical cleanup.
- Follow-up and worker-case voice audio cleanup.
- Expired report exports and worker import payloads.
- Existing worker-deletion redaction, pseudonymization and completion.

Disabled policies remain disabled. Published snapshots, assignments, assessment
outcomes, minimal receipts and provider provenance are not rewritten. A cleanup
attempt or an empty claim queue is not completion. Deferred retries, cleanup
leases, outstanding operation leases and unfinished deletion receipts remain
visible in the final pending counts. Stage exceptions produce redacted stage
names, not secret-bearing error strings.

Final inspection locks every discovered schema table against writes while checking
current quarantine, pending work, strict absence of all retired private references
and exact size/hash readback of all retained references. Storage errors, unknown
absence and corrupt/missing retained objects prevent reconciliation. Recording
purge and interrupted staging completion also require physical absence and a
still-owned, unexpired cleanup lease. Purge completion and its audit are atomic.

Defaults are 100 cycles and a 120-second scheduling budget. A started storage or
database operation is awaited, not abandoned on a timer; its duration and final
inspection can exceed that scheduling budget. No retries are forced early and no
cleanup lease is stolen. Large restores or outages can require later bounded runs
with new scratch directories after normal retry/lease deadlines. Preserve failed
reports for incident diagnosis; do not delete or reuse prior evidence.

The encrypted `retention-result.enc` records pending/verification counts, attempted
work per stage, errors and `stop` (`reconciled`, `waiting`, `bounded` or
`source_input_reconciliation_required`). Source/receipt/object gap identities are
encrypted only; CLI output is an aggregate projection. Work counts
are attempts, not completed-object counts. Pending results exit CLI status 2;
admission or fatal failure exits 1. An elapsed-policy success exits 0 and appends
an audit observation. Repeated clean observations may append another observation,
but do not repeat completed immutable cleanup transitions.

Every result still states `authoritativePrivacyReconciliation:'required'`,
`activationAllowed:false` and `productionReady:false`. There is no release command.
Source-ledger export/comparison and original deletion/current-policy decision
replay are documented in `PRIVACY_LEDGER.md`. They preserve quarantine and do not
copy historical physical-cleanup success claims into the restore.
The complete authoritative post-backup reconciliation/activation gate, broader
activity/briefing retention, native PostgreSQL concurrency, Neon Free/R2, real
hardware and full release checks remain unfinished.

## Local Verification Limits

`tests/restore-retention.test.mjs` uses fresh isolated PGlite schemas and private
temporary directories. Explicit authored historical rows isolate elapsed-policy
behavior; the case-resolution trigger is disabled only while constructing its
past-resolution fixture, then reenabled before operations. Those rows do not prove
a historical end-user workflow, model quality or native PostgreSQL behavior.

Checks cover six private families, text expiry, disabled policies, existing worker
deletion, immutable publication/assignment preservation, quarantine admission,
concurrent-sweep denial, future retries/leases, storage/audit failure, retained
object integrity and encrypted backup-bound command output. No cloud service,
live AI, email or real worker audio/response is used. Gemini Free remains
synthetic-only.
