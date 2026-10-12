# Operator Tenant Access

2026-10-12: S40.2 scoped access listing, local synthetic verification only.

The separate operator console's Manage access view now lists the selected
tenant's worker references and sites in bounded 20-row pages, including complete
counts beyond 100 workers. Search is literal and case-insensitive over reference
and site name. Worker enabled/disabled state is independent of tenant suspension,
site archive/admission pause, current credential sessions and unused access links.
Recorded sign-in time is the latest retained grant redemption, not last activity,
attendance, verified identity, guaranteed current connectivity or comprehension.

`GET /api/ops/tenant-access` requires the separate current operator cookie and
exact context, revalidates operator authority inside its read transaction and
uses the shared operations gate. One SQL statement captures tenant state, count,
page and credential observations. Grants/sessions are joined by exact worker,
organization and site; unredeemed, revoked or expired evidence cannot certify a
current credential session. Restricted states remain visible to the operator
without enabling customer access. Unknown tenants, ambiguous duplicate query
keys, caller-supplied site overrides and unbounded filters are rejected.

The response contains only the strict metadata projection. No source/answer/
audio/rubric/language, credential, session token/hash, grant identifier or raw
database/provider failure appears. No impersonation or per-worker mutation is
added. Existing confirmed, revision-bound tenant suspend/resume is unchanged.
The browser rejects foreign scope, wrong page, malformed/duplicated rows and
unexpected fields; it hides previous rows while loading or after a failed read.
Switching tenants remounts the scoped reader and drops previous filters/results.

## Verification

- Final full local synthetic regression: 156 files, 831 tests, 827 passed, zero
  failed, four native database prerequisite skips, 272.456 seconds, terminal exit
  0. External database URLs were explicitly disabled. This does not promote
  semantic AI, native/cloud/device or production readiness.

- Final eight-file operations/runtime/provider/access regression: 36 passed,
  zero failed/skipped, 16.531 seconds, terminal exit 0. Providers were mocked;
  PostgreSQL was embedded and HTTP servers disposable/loopback-only.
- New five checks cover parser bounds, strict browser projection, all 129 workers
  over seven pages, exact counts/filtering/empty pages, read-only snapshots,
  foreign and missing scope, current/unused/expired/revoked credential evidence,
  site/tenant restrictions, revoked operator, cookie/context/no-store HTTP
  denials, duplicate query keys and safe database failures.
- Initial nine-test run had two fixture SQL failures: the snapshot UNION used
  an expression in its ORDER BY. It was corrected with an outer SELECT; no
  permission, metadata or persistence assertion was removed. Rerun: nine passes.
- Built browser verifies seven-page navigation beyond 100, enabled/disabled and
  literal search, credential and site restrictions, explicit refresh, failed
  read with no stale worker table, recovery through changed search, and switching
  to an empty tenant without retaining prior rows.
- 1440px and 320px final views inspected. Narrow tables scroll within their
  container; names have stable minimum column widths and the refresh icon remains
  beside its wrapping heading. No page-width overflow. Inspected final images:
  `artifacts/operator-tenant-access-desktop-2026-10-12.jpg`,
  `artifacts/operator-tenant-access-mobile-2026-10-12.jpg` and
  `artifacts/operator-tenant-access-mobile-failure-2026-10-12.jpg`.
- Three memory-only fixture runs stopped gracefully at terminal exit 0. Their
  12/4/4 access reads left worker/session/grant/customer/operator audit/request
  fingerprints unchanged. External calls: zero. Temporary tab closed and viewport
  reset. Strict 2028-module build and all 66 shell hashes pass; existing bundle
  size/offline-import warnings remain.

Reticle change verification was blocked by auto-review because it may disclose
local QA metadata externally, contrary to the user's local-only decision. No
diagnostic was sent, no Reticle verdict is claimed and no workaround attempted.

Native concurrency, larger-history performance, full reference/accessibility
comparison, hosted private deployment and real-data production acceptance remain
unverified. No existing preview or database was restarted or migrated.
