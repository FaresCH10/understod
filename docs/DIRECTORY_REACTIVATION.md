# Directory Reactivation

Updated 2026-10-04. Local synthetic checkpoint, not production readiness.

## Contract

`POST /api/people/workers/:id/reenable` accepts only `requestId`, `expectedCode` and `confirmed: true`. `POST /api/people/crews/:id/restore` uses `expectedName` instead. Request IDs are UUIDs; labels use existing bounded directory validation. Both repositories recheck actual active owner/supervisor identity and current organization/site inside the transaction. Foreign targets, workers, auditors, forged/inactive staff, changed labels and unconfirmed requests fail.

Re-enabling a disabled worker keeps old grants and sessions revoked. It does not issue a new link, change membership or create assignments. Restoring a crew admits new membership moves but retains existing membership and does not enable disabled workers or issue access. Frozen publications, assignments, answers, receipts and assessments are untouched.

The action, audit event and immutable scoped `directory_reactivations` receipt commit atomically. Exact retries return the current target state with `duplicate: true`, without performing another action. A retry after a later disable/archive cannot reactivate it again. Reusing a request ID with a different target or expected label conflicts. Already-active targets record a no-op receipt without an action audit. Authorization is rechecked even for replay. SQLite scope/immutability triggers and PostgreSQL migration 010 protect the ledger; backup import includes it and accepts older backups without this optional table. Previous archive/disable protocols have not acquired durable request IDs.

## Verification

Full local suite: 148 tests, 146 pass, zero fail, two external PostgreSQL skips. Strict TypeScript/Vite build passes. SQLite and embedded PostgreSQL cover invalid fields, confirmation, actual authority, scope, stale labels, audit/receipt failure rollback, immutable receipts, replay after later disable/archive and preserved evidence. PostgreSQL additionally simulates lost successful COMMIT acknowledgments. HTTP boundaries and imported receipt replay are covered. These tests do not prove external wire/TLS or real concurrent transactions.

Browser checks did not submit reactivation. Saved disabled Browser QA 900 showed mandatory confirmation, Escape/Cancel focus return and reset; at 320px document and dialog widths are 305/305 and 279/279. A memory-only archived crew fixture checked restore confirmation/reset, forward/reverse keyboard wrap, Escape focus return and Cancel at 320/1440; dialog widths are 279/279 and 558/558, document widths 305/305 and 1425/1425. Screenshots:

- `evidence/worker-reenable-dialog-320-2026-10-04.jpg`
- `evidence/crew-restore-dialog-320-2026-10-04.jpg`
- `evidence/crew-restore-dialog-1440-2026-10-04.jpg`

Disposable rehearsal 43372 stopped; viewport and saved synthetic owner restored. Eight persisted publication/assignment/attempt/receipt/case/audit/crew/membership hashes match, ledger has zero rows, published metrics stay 30/25/22/3/5. Demo profile selection changed session state only. Default service is session 36428 on http://127.0.0.1:3020/. No native-language, full accessibility, Reticle, real-worker or production verdict.
