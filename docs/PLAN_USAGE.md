# Plan and usage

`GET /api/usage` is a staff-scoped read model for the current site. It derives assigned workers, responses, matches, clarifications and pending responses from the latest published publication. Bar denominators are its assigned workers, not invented plan limits or monthly usage. Both database adapters select published versions consistently.

Verification: `node --test tests/usage-model.test.mjs` passes the assignment-size and empty-artifact regression checks. The client cancels stale requests and displays refresh errors even when previous data remains visible.

Estimated and actual provider spend remain `unknown`; the plan remains illustrative, with no live entitlements. These readings cannot authorize real worker data or billable requests.

## PostgreSQL Request Allowance

The credential PostgreSQL read model now projects the authorized organization's actual default-closed provider policy and current UTC-day reservation ledger, under the same repeatable-read scope. It shows configured request-slot limit, reserved and remaining organization slots, accepted/rejected/started/uncertain request counts, UTC midnight reset, and actual global job/provider pause flags. Global allowance is consulted only to derive a coarse closed/paused/exhausted/available state. Other organizations' usage, global counts/limits, operation identities, claim tokens, private input and model configuration are not returned.

Reservations are conservative admission slots, not invoices, token/audio units, proof of provider readiness or a guarantee that the remaining global allowance fits a job. Publication activity is still site-scoped and separate from organization-wide request allowance. The legacy SQLite preview retains its honest unavailable-controls fallback.

## Change And Contact Requests

Migration 076 adds immutable site-scoped request records. Credential PostgreSQL owners, administrators and supervisors can POST an exact confirmed plan/quota/contact request to `/api/usage/requests`. GET lists ten records per page: owners see their site inbox; other allowed roles see only their own requests. An exact actor-scoped GET receipt at `/api/usage/requests/:requestId` recovers an uncertain acknowledgement. Atomic audit and request-ID locking prevent duplicate accepted writes; changed bodies or reuse by another actor conflict. No subscription purchase, payment, quota change, provider call or email is performed.

The view saves the exact pending request in expiring session-scoped tab storage before sending. Reload checks receipts read-only. Corrupt storage, unknown receipt or mismatched receipt blocks new submissions; absent receipts require explicit confirmation to retry unchanged. The site owner inbox is the destination, not an external support-delivery guarantee. Request resolution, notification/email delivery and broader request-message retention are not implemented in this checkpoint.

## Verification

Final focused command: `node --test tests/usage-requests.test.mjs tests/usage-request-recovery.test.mjs tests/usage-allowance.test.mjs tests/usage-model.test.mjs tests/provider-controls.test.mjs`: 14 passed, zero failed/skipped, 11.171 seconds, terminal exit 0. Covers conservative quotas, private-data isolation, exact replay, owner/author/site/tenant access, immutable requests, audit rollback, authenticated origin/session/revocation checks, input bounds and client receipt/storage checks. Native concurrency and the complete release suite are separate gates.

Built synthetic desktop/320px journeys record quota/contact/plan requests and show the owner inbox; reload preserves the accepted record. The final styled mobile view measures 305px document width at a 320px viewport. Final fixture ends with two usage reads, one POST, one plan request and zero external calls. Earlier fixture ends with two POSTs/two requests. Screenshots are under `artifacts/usage-*2026-10-11.jpg`. Full-page screenshot capture failed during request verification; viewport captures were used. Actual browser lost-acknowledgement/retry and all-reference/accessibility verification are not claimed.

Strict build and 63 shell hashes pass; all eight saved original SQLite business fingerprints match, integrity is OK, foreign-key violations zero. Existing bundle/offline-import warnings remain. No original preview restart or database migration, live provider, mail, cloud, billing or real-data operation occurred. This is local application progress, not production readiness.
