# Multi-site staff accounts

This checkpoint is local/synthetic and partial. It implements linked account identities and site selection, not invitation acceptance, new organization onboarding or production access management.

## Contract

- `staff` IDs remain site-local grants with independent roles and access revisions. Existing publication, audit and staff references are not moved or rewritten.
- One additive `staff_accounts` identity retains its original credential anchor. Immutable `staff_account_memberships` link grants by exact organization/site and allow at most one grant per account/site. Public reads do not expose account IDs, credential anchors, email, hashes or tokens.
- Provisioning an existing staff credential creates its account/home membership if absent. Rotating through a linked grant updates the original credential, not a second password. Private linking primitives require an authenticated acceptance workflow and caller-owned transaction; there is no public linking/provisioning route.
- Credential login chooses the active original grant, or a stable active linked grant if the original is disabled. Session authority uses the selected site's role only; permissions are never merged across sites. Account and credential availability are checked again for each session.
- `GET /api/account/sites` returns only active memberships for the authenticated credential account, with bounded pagination. Demo and worker sessions cannot use it. `POST /api/account/site` accepts only `staffId`, enforces origin and current account authority, rotates/revokes only the originating session and audits atomically. Remaining expiry is preserved rather than renewed.
- Password maintenance/recovery revokes all linked account sessions, leaving other accounts alone. Recovery fingerprints bind the canonical credential, selected site's role/access revision and account revision. Account disable/restore increments its revision and revokes old sessions permanently, so restoration does not revive them.
- PostgreSQL lock order is account, staff, credential/token, then session. Switching locks only source/target grants belonging to the same account in stable ID order. The account lock serializes competing selection and credential changes; actual server concurrency still requires execution.
- SQLite uses a savepoint-backed additive upgrade. PostgreSQL migration 021 adds equivalent guards. Both invalidate pending older-format recovery links/mail, because those fingerprints did not bind account revisions. Existing credentials remain private and unchanged during schema upgrade.
- Synthetic backup import preserves account/membership structure while omitting passwords, recovery tokens/mail and throttle state. Reprovisioning a linked imported grant still uses the preserved original credential anchor. Imported sessions remain revoked.

## Browser

The credential-only topbar picker uses a native dialog, radio choices, ten-row paging, current-site state, refresh and explicit leave-site confirmation. Unsaved edits close only after confirmation; tab-local pending receipts remain in their original scope. Old-site content is unmounted during rotation and keyed by the fresh staff scope/role afterward. Navigation is unavailable while the session is unverified.

A lost POST acknowledgement is resolved by reading `/api/session`, never automatically retrying the rotation. If that read fails, private views stay closed until an explicit GET-only recheck succeeds. A rejected or competing switch cannot be reported as confirmed merely because the POST returned success. Administrator selection routes to settings and auditor selection removes write affordances. The public `staffScope` is a UI invalidation key, not an authorization capability.

## Evidence

- `tests/accounts.test.mjs`: 13 passing SQLite/embedded PostgreSQL upgrade, membership scope/immutability, paging, rotation/expiry, audit rollback, group credential/recovery invalidation, inactive-home fallback, account restore and HTTP origin/cookie/privacy checks.
- `tests/account-site-client.test.mjs`: three passing lost-acknowledgement, wrong/signed-out/worker scope and unavailable/malformed session checks. Existing import tests additionally verify membership preservation and credential omission/reprovisioning.
- Full suite, 2026-10-06: 236 tests, 234 passed, zero failed, two external PostgreSQL skips; strict TypeScript/Vite build passes. Real-server concurrent same-cookie selection and linked credential rotation checks are written but not run. PGlite fixtures serialize connections and are not pool concurrency evidence.
- Memory-only browser fixture `scripts/accounts-browser-fixture.mjs` starts pre-authenticated and does not verify login. Thirteen memberships page correctly; first switch loses its acknowledgement, second switch loses session verification, third selects administrator settings. Exactly three selection audits and the original publication snapshot remain intact. Escape returns focus; mobile confirmation has 279/279 client/scroll width, inside a 320px viewport. Desktop and mobile captures are listed in `evidence/browser-check.md`. No Reticle tools/verdict, full reference/a11y, browser password entry or deployed PostgreSQL proof.
- Native pre-upgrade backup: `data/understood.sqlite.accounts-a7022156-7648-486a-b37a-62cd9ca4c40f.sqlite`. After restart, nine saved business/audit/staff hashes and the empty credential hash match; integrity is OK and foreign-key violations are zero. Saved account/membership/recovery tables remain empty. Main synthetic dev session 39600 runs at 3020/3021 with email disabled; disposable fixture 54767 stopped.

## Open Gates

Invitation issue/reissue/cancel/acceptance, existing-account proof and new-account credential setup, exact replay under delivery/acceptance uncertainty, owner onboarding, site lifecycle, global account administration, concurrent cross-tab view invalidation, pending-request conflicts/closed-tab recovery, real-server contention, production runtime/restore/database roles, delivery privacy/budgets/key rotation and full reference/accessibility verification remain. No selected screen or production acceptance criterion is promoted to complete.
