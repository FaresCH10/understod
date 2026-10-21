# Briefing Request Fencing

Requirements: A06, S09-S13, S18 and S42. This extends the captured Staff & Access
boundary without claiming every staff helper is migrated.

## Implemented

- Scoped briefing transport captures the original full staff authority and owns
  a view/mount generation. There is no unbound exported request helper remaining
  in the migrated briefing family.
- JSON transport accepts explicit GET/POST/PATCH, checks before dispatch and
  after response parsing, and holds mutation completion during session checking.
- Guarded completion rechecks authority after asynchronous receipt/hash validation
  before clearing saved records, reporting success, selecting a new view or
  navigating. Existing exact request IDs, receipt validators and explicit retries
  remain intact; context denial is not treated as a discardable business rejection.
- Creation, source editing, copy, archive, exact-version withdrawal, publish,
  scheduling/cancellation, creation/publication receipt lookup and recovery use
  the scoped contract. Worker/crew recipient reads carry captured context too.
- Source upload dispatch and receipt callbacks retain their existing binary/hash
  protocol and 30/45-second deadlines, while checking view authority at dispatch
  and before completion. Upload bytes are not added to receipt storage. This does
  not promise cancellation of a request already received by the server.
- Briefing library/detail reads carry captured context. New/detail views remount
  on a changed context; withdrawal retains the exact selected version.
- Shared SQLite/PostgreSQL middleware requires context for the mapped briefing
  JSON routes. Native private-byte audio URLs are deliberately excluded from a
  custom-header requirement: ordinary audio elements cannot supply that header.
  Existing cookie/principal/site/version/storage authorization still applies.
- PostgreSQL now preserves a context mismatch as 409 before route-specific error
  handlers; schedules previously mislabeled that denial as a generic 503 outage.

## Verification

- Corrected test-first fixtures demonstrated 200 instead of required 409 for
  missing library headers on both SQLite and embedded PostgreSQL.
- Dedicated real HTTP tests cover missing/malformed/wrong/rotated context before
  reads, all mapped mutations and exact receipts; complete briefing/publication/
  assignment/job/audit preservation and positive create/receipt/PATCH are checked.
- Pure transport tests cover explicit PATCH and asynchronous completion holds.
- The first full run exited 1: 864 tests, 856 passed, four failures, four native
  prerequisite skips (296213.8941 ms). One fixture baseline included an intended
  later sign-in audit; three older metadata reads omitted the newly required
  header. Repairs preserve assertions and do not loosen server enforcement.
- Normal loopback test clients capture once per cookie; explicit stale/missing
  header tests stay raw. Separate tests ensure deliberate bad headers are not
  overwritten and native audio requests receive no automatic custom header.
- Final five-file related regression: 49 passed, zero failed/skipped, terminal
  exit 0, 218576.0915 ms. Includes real native-byte cookie-authenticated reads
  without an automatic custom header, and preserved review/version behavior.
- Final full suite: 163 files, 866 tests, 862 passed, zero failed, four native
  prerequisite skips, terminal exit 0, 263140.3901 ms. Local log:
  `artifacts/briefing-request-full-test-final-2026-10-13.log`.
- TypeScript/production build pass (2038 modules, 579.48 KB entry). Existing
  chunk-size and mixed offline static/dynamic import warnings remain.
- All 68 shell hashes match; eight protected SQLite fingerprints match,
  integrity OK, FK violations 0. All owned test/build sessions are terminal.
- No new browser verdict is claimed: the preceding browser runtime startup
  failure has not been resolved or bypassed. All diagnostics remain local.

Task estimates: core briefing boundary 75%, whole staff request fencing 40%,
overall full-production scope about 60% (55-65% uncertainty).

## Remaining

- Built browser stale-view/expiry/Strict Mode/keyboard/RTL and native playback
  acceptance. The browser runtime was unavailable at the preceding checkpoint;
  no screenshot or browser pass is inferred from helper tests or a bundle.
- Optional review/regeneration now has separate local evidence in
  OPTIONAL_EDIT_FENCING.md; its rendered/native acceptance remains open.
- Other older staff helpers, billing, invitations,
  people/import/access, settings/privacy, templates/glossary and reports/exports.
- Independent live AI/language/audio evaluation, native database/device checks,
  all-reference/accessibility coverage and hosted/release/activation gates.

No original database migration or preview restart, external service operation or
external diagnostic upload is part of this checkpoint. Production remains unproven.
