# Restore State Accounting

Initial quarantine, six privacy replays and stage-specific physical cleanup now
have controlled checkpoints. Complete recovery/chain and native/cloud verification
remain open; no checkpoint authorizes release. See RESTORE_CLEANUP_ACCOUNTING.md.

The production restore command still authenticates the original archive, requires
a fresh isolated database/storage namespace, a distinct target connection, trusted
archive confirmation and exact migration/whole-inventory matching. It now passes
the authenticated baseline into `quarantineRestoredDatabase`:

1. Acquire the migration advisory lock and SHARE locks on every discovered table.
2. Recheck every table/count/hash, precise sequence/called state, definition hash
   and private reference against the backup inside the quarantine transaction.
3. Perform the existing access/token/account/mail/provider/tenant quarantine and
   actual per-site audit insertions. Force deferred constraints before capture.
4. Reject changes to definitions, sequences, known private references or any table
   outside the explicit quarantine transformation set. This includes unknown and
   quoted future tables and unexpected deferred trigger side effects.
5. Capture the complete post-quarantine inventory and actual database clock before
   commit. Any mismatch or audit/constraint failure rolls back the transaction.

The exact post-state is an initial controlled-operation checkpoint, not evidence
that an arbitrary source archive is harmless or that trusted database owners
cannot later change data. Keep maintenance writers and external storage writers
stopped. The low-level helper's optional-baseline fixture behavior does not create
an accounted checkpoint; the production restore path always supplies its baseline.

After restoring/verifying retained bytes and definitive retired absence, restore
checks the target inventory against that post-quarantine state again. Drift while
private objects are being copied prevents a successful restore result.

## Encrypted Evidence

The private restore scratch directory now contains:

- `quarantine-state.enc`: format `understood-restore-quarantine-state-v1`, backup
  identity, distinct target database identity hash, actual capture clock, baseline
  inventory hash and full post-quarantine table/sequence/definition/object inventory.
- `restore-result.enc`: existing aggregate restore result plus
  `quarantineStateSha256`, hashing the exact authenticated state payload.

State encryption has purpose `understood:restore:BACKUP-ID:quarantine-state`,
separate from the result envelope's purpose. Wrong-purpose authentication fails.
No table/object diagnostics or inventories are added to console output. Both
files use existing new-only authenticated encryption. Result remains the last
success artifact; a state envelope alone is not completion or release evidence.
Private staging plaintext is still removed in the existing finally block.

The checkpoint remains explicitly inaccessible: `activationAllowed` and
`productionReady` false; authoritative privacy reconciliation is still required.
No source acceptance/outcomes/history are invented or changed. No original local
preview migration, restart or cloud/provider operation was performed.

## Privacy Replay Checkpoints

Every production replay command now requires `--state-file=PATH` and
`--state-kind=quarantine|replay`. Start with the restore command's authenticated
`quarantine-state.enc`, then pass the immediately preceding command's
`replay-state.enc`. Export and read-only plan do not accept state flags.

Inside the existing migration/full-table locks, replay validates the encrypted
backup/target binding and the complete predecessor inventory before any mutation.
It applies the original source decisions, forces deferred constraints, and captures
the complete successor. Definitions, sequences, table identities and out-of-set
table rows must remain unchanged. Only each operation's declared transformation
tables may change. Private references cannot be added, removed, rebound or made
retained again; a retained-to-retired transition needs matching source evidence.
This table-level guard supplements existing source/row receipt checks; it does not
certify arbitrary side effects within allowed tables or every PostgreSQL object type.

The new format `understood-restore-replay-state-v1` includes the predecessor's
exact payload SHA-256, backup/target identity, operation, source ledger/fingerprint,
actual database capture clock, full successor inventory and false activation flags.
Its envelope purpose is `understood:restore:BACKUP-ID:replay-state`. The encrypted
candidate is written and file-synced **before commit**, while target locks remain
held. Encryption/persistence failure prevents commit. Preserve incomplete output.
`privacy-OPERATION.enc` remains the postcommit acknowledgement; stdout adds only
the checkpoint digest, never database/object diagnostics.

A candidate alone does not prove commit. Reuse requires exact current inventory
and a committed operational receipt for every target site, checked under locks.
After a lost acknowledgement, retry the same command into a new output directory
with its candidate as `--state-kind=replay`. It returns the original checkpoint
without changing data. A rolled-back candidate, stale predecessor, unrelated drift,
wrong purpose, wrong backup or wrong target is rejected. Do not manufacture a
checkpoint from today's snapshot to recover legacy unaccounted work. Existing
low-level helpers retain optional unaccounted fixture behavior, but production
commands require the authenticated predecessor. Native commit uncertainty and
power-loss durability still require external verification. PostgreSQL sequences
are not transactional: a rejected unexpected sequence effect may require replacing
the isolated target, not a claim that rollback restored its sequence value.

## Remaining

Cleanup boundaries now have exact authenticated predecessors/successors and
separate irreversible-removal intentions/absence witnesses. Complete chain and
incomplete-intent recovery workflows, cross-phase reconciliation and native proof
remain required.
Unrecognized target changes must not be accepted merely because a later snapshot
looks quarantined. Complete cleanup-state validation, source writer/storage cutoff
authority, native PostgreSQL/Neon Free concurrency/
backup-restore tests, final private readback and separately authorized activation
remain release gates. Existing backup table/sequence/function coverage does not
certify ACLs or every database object type; RUNTIME_PERMISSIONS.md covers the
separate restricted-role boundary.

## Checks

Disposable embedded tests reject a target change between the earlier inventory
check and quarantine, reject deferred out-of-set trigger changes and prove exact
rollback. A physical embedded archive restore checks the captured inventory,
target binding, result digest and purpose separation. This is not native utility,
real database network/password/TLS, cloud bucket or browser proof.
