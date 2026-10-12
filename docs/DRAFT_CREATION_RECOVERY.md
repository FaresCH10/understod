# Draft Creation Recovery

Later checkpoint: optional explicit `generationLanguages` is part of the
canonical creation hash and exact tab recovery. Omitted-field historical
hashes are unchanged. See `DRAFT_GENERATION_LANGUAGES.md`.

Checkpoint: 2026-10-08 17:13 UTC. Local synthetic verification, not a production release.

## Contract

Direct draft creation now commits an immutable `draft_creations` receipt in the
same transaction as the draft and `briefing.created` audit. Migration 039 adds
the PostgreSQL equivalent. Scoped references, UUID identity, SHA-256 format and
update/delete guards protect the evidence. Only the normalized original request
hash is stored in the receipt; it does not duplicate source text or title.

Exact original-request replay uses that hash, not the draft's editable current
text. It returns the original creation acknowledgement (draft, revision 1), even
after subsequent edits or archive. This is historical acceptance, not a claim
that the current draft remains revision 1. Changed intent with the same request
ID conflicts even if it matches the current edited content. Audit failure rolls
back both draft and receipt.

Legacy drafts without creation evidence retain their existing exact-current-text
replay behavior. No original receipt is invented or backfilled. Their post-edit
creation cannot be proven by the new lookup.

`GET /api/draft-creation-receipts/:requestId` rechecks active scoped staff/session
authority, allows owner/supervisor only, rejects query overrides and returns
no-store metadata. Unknown and foreign requests produce scoped absence, not
private content. Infrastructure failures return a sanitized 503. GET does not
change business or audit evidence. The SQLite-to-PostgreSQL importer includes
modern receipts and accepts older backups without the optional table.

## Tab Recovery

The lazy new-briefing form saves one bounded identity-keyed sessionStorage request
before POST, verifies write/readback and fails before sending if storage is
unavailable. A conflicting or malformed pending record fails closed. The record
contains the original title/source and UUID, so it is private tab data, not a
vault. It is not closed-tab recovery or an offline outbox.

Unknown acknowledgements and reload enter GET-only receipt reconciliation.
Acceptance requires the exact UUID, original revision/state and SHA-256 of the
normalized original title/source. An absent receipt enables explicit unchanged
retry, never an automatic POST. A definitive validation/conflict rejection can
return to the form explicitly; uncertain authority/network/server outcomes keep
the pending record. Checked clearance precedes navigation to current detail.

## Verification

- Five focused SQLite/embedded-PostgreSQL/domain/HTTP/client checks cover edit and
  archive replay, changed intent, immutable evidence, audit rollback, scoped
  absence, active authority, no-store and sanitized failures, storage bounds,
  failed readback and exact acknowledgement matching.
- A populated native-backup cutover check preserves every receipt field and
  replays original creation after source edits without reverting revision 2.
- Final full suite 32089: 472 tests, 469 passed, zero failed, three external
  PostgreSQL skips, 268.552 seconds. Early fixture failures omitted archive
  confirmation/standard receipt schema and compared different row prototypes;
  these were corrected, without weakening product guards. An old migration-count
  assertion was updated from 38 to 39.
- Strict build passes. Final entry `index-CVtleDma.js` is 478.36 kB /129.45 kB
  gzip; lazy new form is 6.22 /2.27 kB. All 38 shell hashes match. The final CSS
  containment fix follows the full suite and has strict rebuild/native evidence.
- Memory-only built browser fixture 70141: lost acknowledgement/reload/manual
  receipt lookup resulted in one creation POST, one receipt and one creation
  audit. ID `8b821535-83a7-4527-aa7f-07be67a19223`; three receipt reads.
- The subsequent before-save interruption reset counters, not existing evidence.
  Reload made no extra POST. Explicit retry used identical UUID
  `22bae86b-e181-48cc-90b8-8e900e19b014` and identical body hash on both attempts,
  creating exactly one additional draft/receipt/audit. Two total fixture receipts
  belong to these two separate scenarios.
- Actual 320px screenshot review caught an overflowing retry control. Final
  scoped wrapping places it within the 284px panel (248px button), with page
  scroll width 320. Screenshots: `artifacts/draft-creation/lost-reload-mobile.jpg`,
  `reconciled-mobile.jpg`, `unaccepted-mobile.jpg`, `retried-mobile.jpg`.
- Fixture stopped, temporary tabs closed, viewport reset. Main synthetic/email-
  disabled preview restarted as session 4044 on 3020/3021 and browser-verified at
  original 30 assigned /25 responses /22 matches /3 clarifications /5 pending.
  Eight selected business hashes, integrity and FKs remain unchanged. Main
  creation/schedule/reminder/read-receipt tables are empty; no existing draft was
  created, edited or published during this check.

Approximately 70% planned implementation, not readiness. Reticle has no connected
app verdict. Real Neon TLS/concurrency, cloud/private-storage restore/deployment,
live privacy-approved provider checks, full reference/accessibility verification,
microphone/offline/private recovery and wider missing features remain open.
