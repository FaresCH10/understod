# Staff Request Fencing

Requirements: A06, S30 and S42. Current scope includes Staff & Access directory,
changes and saved-request receipt/retry; core briefing-family continuation is
documented in BRIEFING_REQUEST_FENCING.md. Broader staff helpers remain unfinished.

## Implemented Contract

- The transport captures an immutable staff authority snapshot and always sends
  its exact client-session context. It never reads a global latest context to
  adopt a new cookie/identity into an old view.
- Only local `/api/` paths are accepted. Requests use included cookies, no-store,
  redirect rejection and a 15-second abort signal; captured scope does not
  authenticate without the HttpOnly cookie.
- Identity/liveness/expiry/abort are checked before dispatch and after transport
  and JSON parsing. Mutations are held during session checking. A response from
  an old view cannot be returned as successful new-view data.
- Each React view owns a mount generation and abort controller. Cleanup fences
  its in-flight callbacks, including development Strict Mode effect cleanup.
  Rendered Strict Mode/browser behavior still needs browser acceptance.
- Staff & Access directory, detail and recovery views use the scoped transport.
  Unmounted/changed views cannot clear their saved request or announce success.
  Receipt lookup is read-only; retry remains an explicit unchanged action.
- Known 401/context-409 denial invalidates only the still-current guard, without
  requiring a readable 401 body. Unknown transport/malformed success remains
  uncertain; old recovery records are preserved rather than silently discarded.
- Post-change session refresh must retain the exact original identity. Changed,
  ended or unavailable authority opens the guard, not another staff account.
- Shared SQLite/PostgreSQL middleware requires the header for every
  `/api/settings/staff` directory, mutation and receipt route. Existing cookie,
  origin, current principal, role, site, last-owner and domain protections remain.

## Evidence

- Test-first HTTP missing-header checks failed (200 instead of 409) on SQLite
  and embedded PostgreSQL before implementation.
- Final combined six-file regression: 28 passed, zero failed/skipped, terminal
  exit 0, 6602.6455 ms. Covers immutable context, no dispatch for invalid/held
  authority, transport/parse races, known denials, abort/expiry, preserved saved
  recovery, both HTTP backends, role boundaries and existing staff recovery.
- TypeScript passes after correcting the required bootstrap-read signal.
- Full synthetic suite: 161 files, 860 tests, 856 passed, zero failed, four native
  prerequisite skips, terminal exit 0, 277645.6768 ms. Local log:
  `artifacts/staff-request-full-test-2026-10-13.log`. It began before the final
  pending-session completion guard; the final 28-pass regression covers that
  adjustment, including held mutation completion as well as held dispatch.
- Final strict build: pass, 2038 modules, 581.64 KB entry. Existing chunk-size
  and mixed static/dynamic offline-import warnings remain. All 68 shell hashes
  match; eight protected SQLite fingerprints match, integrity OK, FK violations 0.
- All owned test/build sessions are terminal. No original preview restart or
  migration, external provider/mail/cloud operation or diagnostic upload occurred.
- Two current browser inventory attempts failed at trusted Node runtime startup,
  including the tool-requested retry after reset. No rendered browser verdict,
  screenshot, Strict Mode interaction or real-device acceptance is claimed.

Estimated progress: this Staff & Access boundary 75%; whole staff request-fencing
task 25%; overall full-production scope remains about 60% (55-65% uncertainty).

## Still Open

- Browser proof of stale-tab/Strict Mode cleanup and saved-receipt behavior.
  The Windows browser runtime was unavailable at the preceding checkpoint;
  no external diagnostic upload or bypass is authorized.
- Migrate remaining older helpers and require captured headers at their routes:
  workspace/retention/privacy settings, glossary,
  templates, reports/exports/notifications and privacy/settings operations.
  Core briefing creation/edit/copy/archive/withdraw/publish/schedule and exact
  recovery continuation now has local evidence in BRIEFING_REQUEST_FENCING.md.
  Optional review/regeneration and billing continuation now have local evidence
  in OPTIONAL_EDIT_FENCING.md and BILLING_REQUEST_FENCING.md. Whole task estimate
  is 80%; invitations, worker/crew management, CSV imports and private worker/
  response controls have local evidence in INVITATION_REQUEST_FENCING.md,
  PEOPLE_REQUEST_FENCING.md, IMPORT_REQUEST_FENCING.md and WORKER_CONTROL_FENCING.md.
  The earlier 25% above records the historical Staff & Access checkpoint.
- Fence App-owned read/action callbacks and account/site transitions as needed;
  verify every relevant route against the inventory, not just component presence.
- Native PostgreSQL roles/TLS/concurrency, actual devices, complete references,
  localization/accessibility, approved live AI and hosted/release gates.

This is one implemented production boundary, not universal staff-session
coverage, native PostgreSQL certification or production readiness.
