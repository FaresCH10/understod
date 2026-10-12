# Site worker access

Credential-owner workflow for pausing worker server admission, not site archival
or a production-readiness declaration. Staff access, saved responses, published
versions and background processing are preserved. Already cached device data is
not remotely erased.

## Contract

`GET /api/settings/sites` includes workerAccess, accessRevision and the caller's
canManageAccess for each site. Management requires an active owner membership
linked to the same credential account in that site and current organization.
Demo owners may read the catalog but cannot change access.

`POST /api/settings/sites/access` requires exact session context, same origin,
requestId, siteId, current revision, state (active/paused), an allowlisted reason
(pilot_review/operational/security) and confirmed:true. Unknown fields are denied.
Policy revision, immutable receipt, worker-session/grant revocation and audit
commit atomically. Pausing revokes all current worker links and sessions for the
target site; resuming does not revive them. Fresh links must be issued.

`GET /api/settings/sites/access/receipts/:requestId` is read-only and limited to
the original currently authorized credential owner and origin site. An exact
replay returns the original receipt without changing a later policy. Changed
payload, foreign target, stale revision and audit failure cannot mutate access.
Missing or foreign sites return Forbidden, not a pause-state disclosure.

SQLite enforces admission at authentication and worker domain boundaries.
PostgreSQL additionally takes a shared site-row lock for worker admission and
an exclusive target-site lock for policy updates. Policy is read separately after
the lock resolves, avoiding a pre-lock snapshot. Migration 055 and populated
backup/import preserve both policy and immutable request evidence. Actual wire
concurrency remains a release gate, not established by embedded tests.

## Client recovery

Settings uses an explicit reason and impact checkbox. Bounded, session-keyed tab
metadata is persisted and read back before dispatch. Unknown outcomes lock the
form. Reload only reads the receipt, never repeats a command. A verified missing
receipt permits an explicit unchanged retry. Dismissal requires an explicit
server rejection plus a verified missing receipt; an uncertain request cannot
be silently abandoned. Other site settings and creation are frozen during this
workflow. The current staff identity/site are unchanged.

## Evidence

2026-10-09 UTC: site/import/migration run passed all 22 tests (10.933 seconds).
Authorization/recording/clarification/domain run initially passed 63 of 67; four
checks caught a missing-site error-contract regression. The shared guard was
corrected, and all 15 site/notice/response checks then passed (4.858 seconds),
including the four failures. Strict TypeScript/optimized build passed; its
509.43 kB entry chunk still needs the deferred performance pass.

Built memory-only native browser fixture verified cancel without a command,
confirmed pause, lost acknowledgement plus failed receipt read, reload recovery
with one command/receipt at revision 1, and resume with two commands/receipts at
revision 2. Owner stayed signed in and Beirut remained current. Desktop screenshot
was inspected in tool output; no saved image artifact or mobile proof claimed.
Disposable identity signed out, QA tab closed and fixture stopped. Reticle has no
connected browser, so no Reticle passing verdict is claimed. No provider/cloud/
mail calls or real worker data were used.

## Remaining

Site archive/restore is implemented separately in `SITE_LIFECYCLE.md` with
dependency checks, operational admission guards and restore remaining paused.
Full regression, 44-reference/mobile/RTL/accessibility review, actual PostgreSQL
wire/concurrency, hosted Neon/R2/TLS and privacy-approved live processing remain
open. This control alone does not make the application production-ready.
