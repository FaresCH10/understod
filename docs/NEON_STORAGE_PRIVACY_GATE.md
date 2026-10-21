# Neon Storage Privacy Release Gate

Status: open,2026-10-15. Synthetic-only staging remains the permitted hosted
mode; no real-worker data or production activation is authorized by storage tests.

## Verified Boundary

The live six-family application test proves current-branch byte retrieval,
private anonymous denial,conditional creation and owned current-branch removal.
It does not prove permanent erasure,history expiry or another branch's state.

Official Neon documentation rechecked2026-10-15 says `DeleteObject` soft-deletes
on the current branch and lifecycle configuration is stored without enforcing
expiration. Branches inherit objects; deleting on a child does not change its
parent. Those documented guarantees are narrower than permanent deletion.

Sources: [S3 compatibility](https://neon.com/docs/storage/s3-compatibility),
[Objects and branching](https://neon.com/docs/storage/objects).

## Current Application Finding

`server/postgres/deletion-completions.mjs` checks redaction/pseudonym/job/export
state and `storage.exists(...)===false` for recordings,voice and follow-up audio,
then writes `worker_deletion_completions` and `worker.deletion.completed`.
`server/postgres/deletions.mjs` projects that application journal as `complete`.
The S3 adapter's definite404 check is correct for the current key view,not an
account of storage history or independent backups. No claim is made that this
function proves irreversible erasure on any cloud adapter.

This is a confirmed distinction to resolve before real hosted rollout,not a
failure of the synthetic nine-object compatibility test. The existing
`hostedSyntheticConfig` rejects non-synthetic data classes,so that rollout is not
currently enabled. Do not remove that guard to make the build appear ready.

## Required Follow-Up

- [x] Project application cleanup separately from unverified provider/history/
  backup/device/final erasure in both backends' directory/detail/acknowledgement
  DTOs and privacy UI. See DELETION_CLEANUP_SCOPE.md. This is explicit lack of
  external proof,not an implemented external-disposition journal.
- [x] Preserve existing deletion requests,original timestamps,redaction receipts,
  completed application journal and audit history without a migration or rewrite.
- [ ] Integrate independently verified external disposition and restore/privacy-
  ledger accounting. Do not relabel current404 as permanent erasure.
- Establish a provider-supported retention/history disposition contract and
  verify it before allowing a final privacy-erasure claim or real hosted use.
  A green lifecycle-configuration response is not enforcement evidence.
- Test retries,revocation,unknown storage errors,branch/backup restoration and
  fresh verification after cleanup. Keep free-tier AI synthetic-only and do not
  create/change branches,delete history or enable paid resources without approval.

No account settings,data,storage contents or permissions were changed for this
read-only investigation. Production readiness and final erasure remain false.
