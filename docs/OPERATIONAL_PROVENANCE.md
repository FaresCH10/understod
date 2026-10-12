# Operational Recovery Provenance

Migration 078 separates mandatory operational receipts from user-facing activity
identity retention. The allowlist is deliberately narrow: worker disable,
credential recovery, restore quarantine/elapsed-policy reconciliation and the
four exact privacy-replay operation receipts. Each receipt contains the original
event ID, organization/site, actor type/ID, action, item/marker and timestamp.
It does not contain names, worker labels, answers, transcripts or credentials.

The audit insert captures its exact receipt in the same transaction. A database
guard requires equality with the original activity row and rejects fabrication;
receipt updates/deletes are forbidden. Failure to capture rolls back the audit
insert. Before activity redaction of an allowlisted event, a second guard requires
matching operational proof. The display activity can then physically clear its
actor/item identifiers without destroying mandatory recovery evidence.

Upgrade backfills only identifiers still present in original activity. It never
reconstructs already-erased identifiers or manufactures a quarantine proof.
If a prior schema already lost mandatory evidence, recovery remains fail-closed;
this migration is not an authorization to synthesize missing receipts.

Both application and SQL restore-quarantine checks now use this immutable receipt
source while retaining every other access/account/operator/provider/lease fence.
Privacy ledger v3's existing `access_audit` projection reads the same original
fields from receipts rather than expired display rows. Exact privacy replay lookup
also uses the retained marker, so an aged acknowledgement can be recovered without
another mutation. No account, worker, site or tenant is enabled. All results keep
`activationAllowed:false` and authoritative reconciliation incomplete.

These receipts are a separate private operational lifecycle, not covered by the
activity-identity retention policy. They are not exposed by the normal activity
API or CSV. Retaining them is not complete account erasure, legal certification
or native database-role verification. Later activity-policy/redaction replay,
accepted-input reconciliation, final cutoff and activation remain unfinished.

## Verification

- Related activity/backup/migration/privacy/restriction/retirement/restore suite:
  44 passed, zero failed/skipped, 161.299 seconds, terminal exit 0.
- Migration 077-to-078 fixture: one passed, 2.252 seconds. Exact original backfill,
  exclusion of ordinary/already-expired rows, atomic capture failure rollback.
- Final access-replay suite: eight passed, zero failed/skipped, 36.859 seconds.
  Real source restriction replay after activity expiry and aged synthetic prior
  no-change replay markers survive with exact unchanged receipt recovery; changed
  ledger markers reject. Quarantine and business evidence remain unchanged.
- Strict TypeScript/optimized build, all 63 shell hashes and eight original SQLite
  fingerprints/integrity/FKs pass. No original migration, restart or external call.
- No new UI changed by this prerequisite. Earlier built activity-policy/history
  desktop/320px evidence is in ACTIVITY_RETENTION.md; it predates migration 078.
  No native/cloud/concurrency/Reticle/full release verdict is claimed.

See `artifacts/operational-provenance-checkpoint-2026-10-11.json`.
