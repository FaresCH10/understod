# Briefing Expiry Provenance

Current continuation: migration 082/v6 now replay this original proof onto a
quarantined restore, with separate fresh erasure and unchanged root evidence
through a second backup. See BRIEFING_RESTORE.md. Earlier next-task statements
below describe the preceding source-capture checkpoint, not the current replay.

Migration 081 records original source eligibility in the same transaction that
expires archived briefing content. It does not replay historical expiry onto an
older restore yet. All restores remain quarantined and activation-forbidden.

## Original Capture

`briefing_content_origins` is immutable and scoped to the actual purge receipt.
It contains the original confirmed policy receipt, original completion and eight
content-projection hash groups, plus minimal eligibility context:

- Briefing revision, next version, state and original creation/update times.
- Original archive author/time, closed publication IDs and a hash of its request.
- Publication version/state/time, assignment identities/language/deadline.
- Attempt identity, receipt time, assessment state/outcome and text-expiry flag.
- Recording identities, byte hashes/sizes, receipt time and status.
- Case identity, creation/state and actual resolution time.
- Generated bundle hashes/state and its actual removal receipt time.
- Preparation jobs and publication schedule identities/states.

It does not duplicate briefing text, snapshots, review/baseline/manifest bodies,
worker answers/transcripts, reasons, notes or archive-request text. The remaining
IDs and operational metadata are still private and have a separate lifecycle.

SQL permits capture only inside the actual new purge's trigger, while every
unredacted content projection still matches the original retained hash. Missing,
ambiguous or content-bearing policy receipts fail and roll the entire purge back.
Completion must belong to the current transaction, not a supplied historical or
future date. Audit failure rolls back capture, purge and physical redaction.

The upgrade deliberately does not backfill previously erased rows. A direct
retrospective capture is rejected. Missing original provenance cannot be repaired
by pretending current metadata was observed before erasure.

## Restore Planning

Privacy-ledger v5 requires this original context for every briefing-content
purge. Export validates exact minimal shapes, scopes, links, hashes, original
policy/completion/capture times and elapsed source eligibility. Missing context,
extra content keys, invalid ages, orphan origins or conflicting authority fail.
Older v1-v4 ledgers lack required bindings and are rejected, not converted.

The current briefing projections are represented only by SQL JSONB SHA-256
hashes. On a stopped quarantined target, a source snapshot hash may differ after
source erasure only when its original purge hash exactly binds the target's
still-present snapshot projection. Publication scope/version bindings remain.
Every target-owned content projection must also match an original source hash;
changed review content and extra target receipts/copies produce explicit
`original_content_unbound` conflicts. An independently created copy retains its
own lifetime.

Planning is read-only. It neither closes an older publication/case nor fabricates
archive, resolution, assessment or cleanup times. It does not erase the target's
matching content. Original-source historical redaction replay, accepted-input
lifecycle reconciliation, fresh target generated-byte cleanup, root provenance
through later backups, final source cutoff and activation are next requirements.
Never interpret a zero-conflict plan as permission to activate.

## Verification Scope

Isolated PGlite tests exercise all eight source copies, immutable capture,
audit rollback, confirmed/ambiguous decisions, completion clocks, upgrade without
fabricated backfill, strict encrypted-ledger validation and unchanged old
published snapshots versus changed/extra target content. Native PostgreSQL and
cloud deployment remain separate prerequisites; no external provider operation
is performed. This checkpoint adds no UI workflow and makes no browser verdict.
