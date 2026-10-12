# Worker Access Checkpoint

Updated 2026-10-04. Synthetic local credential rehearsal only; not production access or completed S19/S28.

## Contract

- Active scoped owner/supervisor identity is rechecked for issue, revoke and status. Worker, auditor, forged/inactive staff and foreign worker/grant requests are denied.
- `GET /api/people/workers/:id/access` accepts only bounded `page`/`pageSize`; returns complete counts, availability dates and derived status. Disabled-worker history stays readable. Explicit fields exclude tokens and hashes; responses are private/no-store. Profile-demo cannot use this route.
- Issue accepts only `workerId` and integer `expiresInMinutes` (5..1440; undefined defaults to 240, null fails). Replacement revokes older links and all current worker sessions. Revoke accepts an empty object and invalidates associated sessions. Assignments and evidence remain unchanged.
- Writes and audit commit together. Repeated revoke does not duplicate audit; audit failure rolls back. An uncertain issue result cannot recover plaintext: inspect status, then explicitly issue a replacement if needed.
- People requires an impact checkbox, resets confirmation on validity changes, masks the one-time link and clears it on dismissal/close. No token is persisted to local/session storage or status metadata. Links use validated fragments, never query/server paths. Entry removes the token from the visible URL into volatile state, requires explicit redemption and ends an existing session first. An in-flight guard prevents repeated sign-in submissions.

## Verification

Full suite: 140 tests, 138 pass, zero fail, two external PostgreSQL skips. SQLite/embedded PostgreSQL and credential HTTP tests cover paging beyond 100, private status whitelist, scope/strict input, single-use redemption, session invalidation, replay and rollback. Strict TypeScript/Vite build passes; real wire/TLS/concurrency remains unverified.

Browser used a separate localhost:3030 in-memory credential fixture and existing synthetic test credential. Issued/replaced two disposable Worker 001 links, observed old-link revocation, explicitly revoked the current link and observed both revoked. Expiry changes reset confirmation; Escape returns focus; narrow controls are keyboard-reachable and fit at 320px without horizontal overflow. Screenshots contain no token. Clipboard copy was not tested.

Opening the token-bearing URL was rejected by browser security. No workaround or browser redemption success is claimed; redemption has isolated API tests only. The sign-in in-flight guard was build-checked, not delay-injection browser-tested. Rehearsal stopped and its in-memory database discarded; original profile-demo browser and viewport restored.

- `evidence/worker-access-confirm-320-2026-10-04.jpg`
- `evidence/worker-access-revoked-1440-2026-10-04.jpg`

Persistent publication/assignment/attempt/receipt/case/audit/crew/membership hashes are unchanged. Dev session 96742 replaces stopped 24277; web http://127.0.0.1:3020/.

## Remaining Gates

Private delivery, initial language selection, invite/recovery, device/session policies, entry localization, full browser token handoff/redemption, native-language/a11y review, live PostgreSQL and deployment remain open. Real worker data is forbidden on Gemini free tier.
