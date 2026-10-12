# Restored Briefing Content Expiry

Migration 082 and privacy ledger v6 implement historical briefing redaction in a
stopped, isolated, fully quarantined restore. This is maintenance, not activation.

## Original Authority

The source must have migration 081's atomically captured original expiry context,
policy receipt and eight content-projection hash groups. An older target may still
have a published version or open case. Replay keeps those states and their honest
clocks intact; it records the original source context separately instead of
inventing target archive, resolution or assessment evidence.

All target copies must match a subset of the original content hashes. Immutable
version, assignment, attempt, recording, case, generated-bundle, job and schedule
identities must bind to the source context. Changed content or extra target
identities fail closed. Original policy receipts must be replayed first. Current
disabled or extended policies stay unchanged.

## Atomic Erasure

The immutable restore journal retains the root source origin and root ledger
capture time. A fresh target purge records the actual target projections and
completion clock; eight content copies are erased in the same locked transaction.
Deferred guards reject a journal without physical redaction. Audit failure rolls
back the journal, purge and erasure. Old/future imported or completion clocks are
rejected. Target generated bundles require actual cleanup/removal receipts first;
a source cleanup success cannot substitute for target cleanup.

A later backup exports the root capsule unchanged, alongside the separate fresh
target purge/journal. A second replay still uses the original source expiry proof,
not the intermediate target cleanup time. Exact durable replay acknowledgement
does not write again, but a fresh operation still rejects changed target evidence.

```powershell
node scripts/postgres-privacy.mjs briefings BACKUP LEDGER NEW-RESULT --writers-stopped --isolated-target --confirmed --state-file=PREVIOUS-RESULT/replay-state.enc --state-kind=replay
```

The distinct target and new private result directory are mandatory. The encrypted
result is `privacy-briefings.enc`, authenticated for this backup, ledger and
operation. All reports keep `activationAllowed`, `productionReady` and
`authoritativeReconciliationComplete` false. Report pending counts describe the
pre-operation inspection; run a subsequent read-only plan for the updated counts.

## Worker History

Content availability is independent of publication state. Fresh typed/audio/help,
conversation, follow-up and repeat admission is denied after expiry. Provider
claims, preparation, reminders and schedules cannot dispatch erased content.
History returns an explicit expiry flag, preserved outcomes and null briefing
content, without speech URLs. The worker view shows an expiry notice instead of
listening/answer controls. Local draft controls cannot initiate new work against
expired content; exact earlier receipt/history lookup remains independent.

## Limits

Disposable PGlite physical copies exercise the actual SQL replay, rollback,
immutable guards, root provenance through another backup and encrypted command
recovery. Worker read-model tests verify preserved accepted outcomes and no
expired text/speech URL. These are not native PostgreSQL, cloud storage, concurrency
or deployment proof. Browser verification is pending: Reticle has no connected
session; direct fixture navigation timed out or was blocked by the browser.

Accepted post-backup input/staging lifecycle, final source cutoff, credential
reprovisioning, native/Neon/private-storage and full release gates remain. No real
worker data is sent to Gemini's free tier; these operations do not invoke AI.
