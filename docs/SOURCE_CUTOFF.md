# Stopped-Source Cutoff Observation

RUNTIME_PERMISSIONS.md now provides separate persistent ACL revocation for every
explicitly listed restricted API/worker role. Use that fence only after stopping
all source writers; maintenance/bucket authority remains separate. Optional
`--runtime-roles=understood_web,understood_worker` checks those roles before and
after private verification inside the locked source snapshot. Their names/check
are bound into the encrypted backup/source-identity observation; stdout reports
only their count and verification flag. Unsafe or drifting roles abort the
observation. Omission explicitly reports runtimeWriteFenceVerified false, never
infers a fence. Even a matching fenced observation does not certify omitted
writers, continuing privileged quiescence, target activation or production readiness.

This read-only maintenance command compares the **whole source snapshot** with an
authenticated encrypted backup. It supplements the accepted-input comparison;
zero submission gaps cannot certify later staff, schedule, audit or other table
changes. It does not activate a target or establish continuing source quiescence.

## Command

Stop every original-source API, worker and maintenance writer, pause global
jobs/providers, and wait for outstanding leases and worker shutdown. Use the
original direct database identity, verified remote TLS/CA, private source storage
and existing backup key configured as in POSTGRES_BACKUP.md. Do not run this on
the preserved SQLite preview or use a restored target as the original source.

```powershell
node scripts/postgres-cutoff.mjs D:\private-backups\BACKUP D:\private-ledgers\NEW-SOURCE-OBSERVATION --writers-stopped
```

The output directory must be new. The command authenticates the backup manifest,
verifies every encrypted archive/object file checksum, confirms source identity,
and checks current migrations. It uses the existing repeatable-read snapshot,
all-discovered-table locks, global pause, heartbeat and lease gates. While that
snapshot remains locked, it captures a privacy/acceptance ledger and reads back
all retained references by exact hash/size; every non-retained reference must be
definitively absent. Unknown absence, storage errors, missing/corrupt bytes or
unbound submission receipts prevent a candidate. No private-error detail is saved.

Full coverage includes every table's count/hash (including future/quoted tables),
all sequence values/called flags as precise decimal strings, guarded schema
definitions, and every known private reference's scope/hash/size/format/retained
state. Comparison is bidirectional. No table allowlist or submission-only shortcut
is used for source freshness. Inventories reject duplicate identities, imprecise
sequence numbers, unsupported fields and missing migration metadata.

The directory contains an authenticated v7 `manifest.enc` ledger and
`source-cutoff.enc`, purpose-bound to backup and ledger IDs. The latter binds the
ledger fingerprint, source identity, database capture/verification clocks,
complete inventory hashes/differences and private verification counts. Detailed
table/object identities remain encrypted. Standard output contains aggregate
counts and flags only. The v7 ledger can be used by the existing privacy plan and
ledger-required retention commands; it is not a substitute for DB/object restore.

Exit 0 means a matching **point-in-time candidate** was observed, not release.
Exit 2 saves a valid non-matching observation (changed source state, unbound input
or unverified objects); preserve it and take a fresh full stopped-source backup
or repair the underlying source incident. Admission/fatal failure exits 1. No
output is overwritten; partial output cannot become an accepted cutoff receipt.

## Release Remains Closed

`cutoffCandidate:true` means the authenticated backup represents this locked
source capture and all known object references were verified at inspection.
The command does **not** freeze future writers or private-storage changes after
its transaction, enumerate unreferenced namespace objects, prove target state
after quarantine/privacy cleanup, or validate native PostgreSQL/Neon/R2 recovery.
Keep the source stopped through any separately reviewed cutover window. A later
source write invalidates use of this observation as the final source state.

All observations explicitly retain `sourceCutoffEstablished:false`,
`activationAllowed:false` and `productionReady:false`. A durable source write
fence, complete target-state accounting, fresh private verification, native/cloud
concurrency and separately authorized release still remain. No provider request,
mail, account provisioning or deployment is made. Gemini free stays synthetic-only.

## Local Evidence

`tests/source-cutoff.test.mjs` exercises actual PGlite full-schema inventory and
local private bytes with a physical embedded archive substituted for native
`pg_dump`. Source inspection is read-only. A later future-table mutation and a
sequence above JavaScript's safe integer range are detected, including in an
older physical restore with **zero accepted-input gaps**. Missing/corrupt retained
bytes and unknown retired absence cannot promote a candidate. Encrypted purpose,
source identity, new-only output and corrupt archive denial are checked. These
tests do not execute native utilities or prove external database/cloud behavior.
