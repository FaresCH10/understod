# Additional sites

Owner-only, synthetic credential workflow; not full site lifecycle or production readiness.

`GET /api/settings/sites` lists only the current organization, with bounded search,
paging, timezone, active-worker count and current-site marker. Demo owners can read
but cannot create. Supervisors, administrators, auditors and workers cannot use
this organization-wide catalog.

`POST /api/settings/sites` accepts a UUID requestId, name, IANA timezone,
English-required generationLanguages and confirmed:true. Exact session context
and same-origin checks are required. No caller-controlled tenant/account/role
fields are accepted. An active credential owner/account creates one site, one
site-local owner linked to their existing account, generation defaults, primary
contact, immutable receipt and origin-site audit atomically. No new password,
invitation, email or worker access is created; the current session is unchanged.

Exact retries return the original IDs without writes. Changed request, actor or
origin conflicts; duplicate organization site names are rejected. Audit failure
rolls everything back. PostgreSQL creation serializes on the organization row.
Migration 054 and the SQLite sidecar use scoped references and immutable receipts;
backup/import preserves creation evidence and account links.

`GET /api/settings/sites/receipts/:requestId` is read-only and restricted to the
original currently authorized credential owner and origin site. Settings retains
bounded metadata in identity-keyed tab storage before sending. Unknown outcomes
lock creation; reload checks only the receipt. A verified missing receipt permits
explicit unchanged retry or cancellation. It never automatically resends. The
existing account switcher reads the new linked membership when opened.

## Evidence

2026-10-09 UTC: 14 focused site/import/embedded migration tests passed, no failures
or skips (10.261 seconds). Strict TypeScript/optimized build passed. These cover
both repositories and credential HTTP, exact-context/origin/role/tenant denies,
replay, rollback, receipt immutability and populated cutover preservation.

Optimized memory-only native browser fixture `scripts/sites-browser-fixture.mjs`
lost the first accepted POST acknowledgement and failed the first receipt read.
Reload recovered "Site created", two catalog sites and the new owner membership
in the account switcher, while Beirut remained current. Fixture counters showed
one POST, one receipt, one audit. Desktop screenshot inspected in tool output;
no saved screenshot artifact or mobile verification claimed. Fixture stopped.
Initial sandboxed listener was unreachable; the explicitly permitted local-socket
rerun was used. Fixture-only browser cleanup navigation was blocked by the browser;
the successful QA tab was closed, but the initial failed-navigation tab could not
be rebound for closure under browser URL policy. No user browser data was cleared.
Reticle has no connected session; no passing verdict claimed.

## Remaining

Worker access pause/resume is now implemented separately; see SITE_WORKER_ACCESS.md.
Archive/restore and dependency validation remain. Real PostgreSQL
wire/concurrency/TLS, hosted browser deployment, broad reference/RTL/accessibility
checks and release gates are unverified. No cloud/provider/mail calls or real
worker data were used. This workflow is not a production-readiness declaration.
