# Restore Cleanup Accounting

The production retention command now records actual transaction and private-byte
boundaries. It is still an isolated maintenance operation, never activation or
complete production certification. Use a fresh encrypted backup/ledger for the
current migration contract, including migration 083. Do not migrate the protected
SQLite preview or rewrite an older backup's migration ledger to make it pass.

## Admission

Retention requires the exact encrypted predecessor, stopped writers, distinct
isolated target, v7 source ledger, complete quarantine and verified retained bytes.
Replay original privacy decisions before starting physical cleanup.

```powershell
node scripts/postgres-backup.mjs retention BACKUP NEW-SCRATCH --ledger=SOURCE-LEDGER --state-file=PREVIOUS/replay-state.enc --state-kind=replay --writers-stopped --isolated-target
```

Use `--state-kind=quarantine` with the restore's `quarantine-state.enc` only when
no privacy replay has intervened. Resume with `--state-kind=cleanup` and the latest
verified `cleanup-NNNNNN-state.enc`. Never adopt a snapshot of today's database
to compensate for missing history. The scratch directory must be new.

## Database Boundaries

Seventeen existing cleanup workers plus the final observation use their existing
transaction boundaries. A maintenance-only pool wrapper checks complete target
inventory and quarantine under full-table/migration locks when each transaction
begins, then forces deferred constraints and verifies its successor before commit.
Only the stage's explicit tables and audit receipts may change. Definitions,
sequences, table identities, unrelated/future tables and private-object bindings
must stay unchanged. Hashes of nonmutable columns protect acceptance clocks,
outcomes, IDs, scopes, languages, content hashes and case/version history even
inside known transformation tables. Existing SQL receipt guards still apply.

A changed transaction writes actual per-site `backup.restore.cleanup.transition`
audits. Migration 083 captures these into immutable operational receipts and
requires their preservation before display identity expiry; it creates no old
receipts or success backfill. The exact encrypted successor is file-synced before
commit. Postcommit acknowledgement follows separately. A no-change transaction
does not append a manufactured transition.

Persistence, unaccounted drift or uncertain commit halts further stage operations.
The candidate can be reused only when current inventory matches and all actual
per-site operational receipts exist. A rolled-back candidate fails; preserve the
last verified predecessor and failed output. Native commit/network/power-loss
behavior still needs native verification. Sequence effects are nontransactional;
an unexpected sequence change can require replacement of the isolated target.

## Private Removal

The storage wrapper accepts only the current stage's exact scoped, retired object
reference. It denies accepted/retained objects, another family, changed hashes/
sizes/IDs/scopes and private writes. Before removal it locks the database, rechecks
the predecessor and writes a file-synced encrypted intent with the prior checkpoint,
reference and actual presence observation. Absence must return the boolean `false`;
unknown or failed observations never count as success.

After removal, database inventory must remain unchanged and a fresh absence check
must pass before writing a successor with a monotonic removed-object witness list.
Previously witnessed absence is rechecked before subsequent transactions and on
resume. Reappearing bytes halt reconciliation. If bytes disappeared but the
acknowledgement or successor persistence failed, the durable intent and last
committed database checkpoint survive. No rollback claims to restore bytes. Resume
from that verified predecessor after normal lease/retry deadlines; an already
absent object is observed without calling remove again. No early lease theft or
invented purge-completion clock is performed. Automated journal recovery/inspection
of incomplete intents remains an operator-workflow gate, not a release claim.

## Source Inputs

At initial admission the source comparison must prove every original accepted
input is represented and retained bytes read back correctly. The cleanup state
carries this encrypted backup/target/ledger-bound admission and predecessor hash.
After legitimate cleanup, the raw source comparison still shows text/transcript
and retained-object differences. Those differences are not hidden or relabelled
as exact source parity. Only those three known reason classes may be accounted
when the same admitted ledger and exact guarded cleanup successor are verified.
Missing input, changed identity/clock/order/scope, newer/different ledger admission,
other reasons and immutable receipt conflicts still block cleanup. Results include
both original gaps and `unaccountedInputGapCount`/`accountedCleanupInputChanges`.

Late privacy replay after a cleanup checkpoint rejects before any mutation. Full
cross-phase reconciliation of later source changes is unfinished; preserve the
cleanup chain instead of discarding its byte/input witnesses.

## Evidence

New-only encrypted files have purposes `understood:restore:BACKUP-ID:cleanup-KIND`:

- `cleanup-NNNNNN-run.enc`: authenticated initial predecessor and ledger scope.
- `cleanup-NNNNNN-state.enc`: `understood-restore-cleanup-state-v1`, complete state,
  predecessor hash, actual DB clock, stage/transition identity, admission and absence witnesses.
- `cleanup-NNNNNN-ack.enc`: committed state digest and transaction identity.
- `cleanup-NNNNNN-removal-intent.enc`: exact retired reference and pre-removal evidence.
- `retention-result.enc`: v3 aggregate result plus the final controlled state.

No inventory, private identifier, row value or object diagnostics reach stdout.
Records are bounded to 16 MiB and 100,000 events; failures stop rather than silently
drop evidence. File syncing is not a certified filesystem/cloud disaster-recovery
guarantee. The key, private directory permissions, complete chain retention and
external storage writer controls remain operator responsibilities.

## Verification Limits

Synthetic disposable embedded tests exercise six real private-byte families,
text/case expiry, archived briefing/activity redaction, original worker deletion,
exact encrypted successor chains, resume, drift, lost acknowledgement, retained
object denial, persistence failure, deferred side effects, outcome/directory
immutability, missing audit receipts, rolled-back candidates and resurrected bytes.
No real worker data, live AI, external mail/cloud/native utility or original
preview migration/restart was performed. Native Neon Free/roles/TLS/concurrency/
storage proof, complete chain/recovery validation, source cutoff authority,
cross-phase reconciliation, full reference/device/accessibility/security checks
and separately authorized activation remain open. All release flags stay false.
