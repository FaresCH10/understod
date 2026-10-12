# Activity identity retention

2026-10-11 current: privacy-ledger v4 now captures activity policy decisions and
historical identity-purge receipts. Migration 080 and the confirmed maintenance
`activity` command freshly redact the restored event in full quarantine, retain
root source decision/expiry evidence, preserve current disabled/extended policies,
and atomically audit completion. Exact replay uses independent immutable
operational receipts, even after display identifiers expire. A second-backup
test preserves root provenance. No restore activation is authorized; historical
briefing replay, accepted-input/final-cutoff and release gates remain open.
Older source-replay gap statements below are historical.

Migration 077 adds a separate, default-disabled site policy for identifiers in
activity history. Owner/administrator saves require explicit confirmation,
current revision and an exact immutable request receipt. Supervisor/auditor
reads cannot change the policy. Worker, foreign-site and revoked sessions are
denied. The credential PostgreSQL settings page supports receipt-only reload
recovery and unchanged explicit retry, using the existing scoped tab journal.

The scheduled `activityRetention` stage selects one elapsed event under a locked
enabled policy. In one transaction it records exact policy provenance, physically
clears `audit.actor_id` and `audit.object_id`, and audits completion. A deferred
constraint refuses a completion marker unless both fields are actually empty.
Ordinary audit updates, deletion, changed event evidence and identifier
restoration remain forbidden. Failed completion audit rolls back the redaction
and marker. Fresh events, other sites/organizations and immutable response and
publication records remain unchanged. Disabling cleanup cannot restore data.

This is **identifier redaction, not deletion of all activity metadata**. Event
ID, scope, action, actor type and timestamp remain as minimal evidence. The read
model/search/detail/CSV cannot reconstruct cleared names or identifiers from the
directory. The UI labels the retained event as `Expired actor`, `Expired item`
and `Cleared by retention`. Other operational ledgers and policy acceptance
records have separate lifecycles. This is not complete account erasure or a
legal retention determination. Backups, downloaded reports and disconnected
device copies are not remotely erased.

The isolated restored-retention inspector counts `activityIdentity` work and
its bounded maintenance sweep executes this same cleanup stage without AI/mail
dispatch. Quarantine is retained and `activationAllowed` stays false. **Later
source-authoritative activity policies and historical identity redactions are
not yet reconciled by privacy ledger v3.** A current restored policy alone does
not prove later source erasure. Source access-restriction replay may also require
provenance independent of identifiers erased from its activity rows; unresolved
proof must fail closed. Migration 078 now preserves mandatory access/quarantine
provenance separately before activity expiry; see OPERATIONAL_PROVENANCE.md.
Later activity policy/historical redaction reconciliation is still unfinished.
Do not activate a restored target on this checkpoint.

## Local Verification

- Focused activity/recovery: six passed, zero failed/skipped, 6.136 seconds.
- Related activity/restore/audit/runtime/privacy-ledger/retirements/audio/text/case
  regression: 51 passed, zero failed/skipped, 135.765 seconds, terminal exit 0.
- Backup/domain/embedded migration/recovery: 55 passed, zero failed/skipped,
  107.803 seconds, terminal exit 0. An earlier 54-pass/one-failure run exposed an
  explicit migration-list expectation ending at 072; it was updated through 077,
  preserving all receipt/tenant/snapshot/audit assertions, then rerun in full.
- Strict TypeScript/optimized build passes with existing chunk-size and mixed
  offline-import warnings. All 63 generated shell hashes match.
- Disposable in-memory PostgreSQL, real built credential API and CUA browser:
  confirmed 7-day enable with an intentionally interrupted first acknowledgement,
  blocked unknown outcome, reload receipt recovery without a resend, actual one
  event cleanup, 320px confirmed disable, preserved redaction and history/detail.
  Final fixture: two POSTs, two receipts, revision 2/disabled, two request records,
  one physical identifier redaction, zero external calls, terminal exit 0.
- At 320px the document is 305px and the activity policy/detail panels are
  267px with identical scroll widths. Screenshots in `artifacts/activity-*`.
- Original eight SQLite business fingerprints match; integrity OK and no FK
  violations. Original database/preview were not migrated or restarted.

The interrupted fixture acknowledgement surfaced as `Failed to fetch`; this is
the deliberate unknown outcome, not a successful HTTP acknowledgement. Receipt
recovery and final database counts are the evidence of commit/no duplicate.
Reticle had no connected session; no Reticle verdict is claimed. No native
PostgreSQL concurrency, cloud, real-worker/provider, legal or full release gate
is certified. See `artifacts/activity-retention-checkpoint-2026-10-11.json`.
