# Accepted Inputs During Recovery

Privacy ledger v7 includes original submission receipt order (as decimal strings,
not lossy JavaScript numbers), scope, kind and original acceptance timestamps.
Typed answer/result and recording transcript projections are hashes only. No
answer text, assessment explanation, transcript or credential is exported in these
new fields. Hashes are still sensitive metadata; the ledger remains encrypted.

The read-only plan now reports `acceptedInputLifecycle`: missing later operations,
changed immutable identities, staging-to-acceptance clocks, source-audio draft
links, changed answer/assessment evidence, and accepted private objects not
represented in the restored database. Publication/audience, submission, source
audio, generated bundle/audio, case/follow-up/voice and message/review identities
are compared in both directions. Accepted attempts/recordings without matching
original submission receipts are explicitly unbound, not silently certified.
Receipt validation requires the original scoped typed or audio row with the exact
acceptance clock; duplicate/imprecise/out-of-range order and extra content reject.

## Recovery Path

Do not synthesize missing submissions, acceptance order, timestamps or outcomes.
If the source remains available, stop all of its writers/cleanup workers, pause
dispatch and capture a **new full database and private-object backup** using the
existing POSTGRES_BACKUP.md command. Restore that backup into a new isolated
database and private namespace, export a new stopped-source v7 ledger bound to
that backup, and repeat privacy reconciliation. Preserve the previous target and
encrypted reports as evidence. A ledger cannot recover answer/audio content that
is absent from both the backup and the source; that is a recovery incident, not
permission to fabricate it.
Unbound or inconsistent source receipts are also an incident; recapturing the same
invalid source state does not repair them.

The production retention CLI now requires that authenticated ledger:

```powershell
node scripts/postgres-backup.mjs retention D:\private-backups\BACKUP D:\private-scratch\NEW-RESULT --ledger=D:\private-ledgers\SOURCE-LEDGER --state-file=D:\private-scratch\PREVIOUS\replay-state.enc --state-kind=replay --isolated-target --writers-stopped
```

Before any destructive cleanup it compares the stopped-source ledger, verifies
full target quarantine and reads back every currently retained private object
with exact size/hash checks. Conflicts, missing/changed input or missing/corrupt
retained bytes produce `stop:source_input_reconciliation_required`, zero cycles
and no cleanup. The encrypted `retention-result.enc` binds backup, ledger and
fingerprint and includes diagnostic identities; standard output contains only
aggregate counts, never those input identifiers. CLI exit 2 denotes incomplete
reconciliation, not success. Missing ledger/invalid source/target/output is an
admission failure. Output directories remain new-only.

The low-level `sweepRestoredRetention` function still tests only policies present
in an isolated target. It is not a source-authoritative recovery/release API; use
the ledger-gated CLI for maintenance. Target writers must remain stopped between
inspection and bounded cleanup. Each cleanup operation rechecks quarantine and
its own lease/absence evidence. Native concurrent-process proof remains open.

## Evidence And Limits

`tests/restore-input-lifecycle.test.mjs` uses actual local typed/audio acceptance
functions after an older physical PGlite copy. It verifies that cleanup is denied,
an encrypted failure report is recoverable, source audio is unchanged, and a
fresh physical database copy plus real private-byte readback preserve original
receipt order/time, answer and audio. Missing/corrupt retained bytes block even
when relational input coverage matches. Unit comparisons cover all upload-family
acceptance clocks and input/hash mismatches. Embedded physical transport is not
native PostgreSQL, Neon or cloud-storage evidence.

`sourceInputsRepresented:true` is only this comparison at the ledger capture.
The independent `sourceSnapshot` comparison now checks full source inventory,
including tables/sequence changes unrelated to submissions. See SOURCE_CUTOFF.md
for authenticated whole-source/private-byte observations. Zero input gaps alone
cannot certify full source freshness.
It does not establish a final source cutoff, prove full business-state parity,
apply every post-backup decision, or authorize activation. All reports retain
`sourceCutoffEstablished:false`, `activationAllowed:false` and
`productionReady:false`. Final cutoff, separately authorized release, native/cloud
recovery and the complete production acceptance matrix remain open. Gemini free
tier stays synthetic-only; no external/provider/email/deployment operation is
performed by these commands.
