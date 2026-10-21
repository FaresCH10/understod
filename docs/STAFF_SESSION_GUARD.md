# Staff Session Protection

Current status: implemented and partially browser-verified. Updated2026-10-14
16:23 UTC; estimated task progress80% (was65%), overallabout67%. This is not
complete native/device/accessibility or production acceptance.

## Latest Browser Acceptance

- Built actual cross-tab signal locks/unmounts an unsent editor and focuses the
  lock heading. Same-account recovery explicitly performs stable observations
  and final verification before reopening the overview; it does not restore
  unsent text after an actual lock or repeat a sent request.
- Different cookie/account/site shows the exact new identity with Open disabled
  until confirmation. Rotation or revocation between observation and final
  fresh read fails closed. Guest is explicitly observed; no silent staff restore.
-503 and malformed session responses stay locked with localized errors.
  Actual30-second session expiry locks/unmounts workspace controls without clicks.
- Fixture-held periodic session GET: shell aria-busy true,inert and visibility
  hidden; exact unsent source text remains mounted. Release after same authority
  verification restores that text unchanged. Second held GET times out and locks,
  leaving zero text editors and no private shell. No saved action replay.
- Keyboard recheck/open/table focus; EN/AR/UR lock/recovery copy; Arabic and Urdu
 320px documentwidth320 with no page overflow and focused lock heading. These
  checks are not an independent linguistic or full assistive-technology review.
- Focused `node --test tests/staff-session-recovery.test.mjs
  tests/staff-session-http.test.mjs tests/session-state.test.mjs
  tests/staff-request.test.mjs`:23 pass/zero fail,602.5722ms,terminal exit0.
  Application code/build unchanged from provider-history full996/992 pass/zero
  fail/four native skips. Only synthetic fixture controls/port/HTTP stop changed.
- Final memory fixture25402,port3221,terminal exit0:17 session reads,zero app
  POSTs,six controls,two held reads/one release,nine business/audit fingerprints
  unchanged,zero external calls. Old88254/port3220 had closed stdin/noHTTPstop;
  stopped only after exact PID/script check,exit1. No final preservation verdict
  is claimed for that old fixture. Original3020/3021/database never touched.
- Temporary tabs closed and viewport reset. Evidence JSON
  `artifacts/staff-guard-checkpoint-2026-10-14.json`; screens
  `staff-guard-editor-continuity-2026-10-14.png`,
  `staff-guard-identity-confirmation-2026-10-14.png`,
  `staff-guard-arabic-320-2026-10-14.png`,
  `staff-guard-urdu-2026-10-14.png`,
  `staff-guard-expiry-320-2026-10-14.png`.

Broader held mutation completion/StrictMode/account/site/role/policy/cross-tab
matrix, native database and actual devices remain. Captured staff request fencing
has since advanced98%; broader read-key/authority acceptance remains separate.
Older verification entries below are historical, not current task status.

## Behavior

The existing page-session guard now checks staff as well as workers. Staff
identity includes account/site/principal scope, role, site lifecycle state,
session context, access mode and exact expiry. Display-name changes alone do
not rotate authority. Invalid or unavailable observations lock the workspace.

Expiry, foreground/online checks and cross-tab change signals participate in
the guard. During a pending staff check, the workspace remains mounted but is
hidden and inert; this is intended to retain an unsent editor on a successful
same-session observation. That continuity still requires built browser proof.
An actual lock unmounts private workspace controls. Already-sent requests may
complete; the screen does not promise cancellation.

The lock screen makes no automatic mutations. Explicit recheck requires two
stable bounded no-store session GETs. Opening the verified identity requires
another fresh GET. A different account/site/policy requires confirmation;
guest and worker observations do not silently restore staff authority.
The recovery helper does not replay or remove saved request-recovery records.
Recovery copy and role/fallback labels cover EN/AR/UR.

Main-shell actions reject invalid/locked/checking sessions before dispatch and
cannot report saved success after a context change. This is not universal
request fencing: older staff helpers still omit captured-context headers, and
the server does not yet require those headers on every relevant staff action.
That remains a separate task on the progress board.

## Verification

- Full synthetic suite before the final label/test additions: 851 tests,
  847 passed, zero failed, four native prerequisite skips, terminal exit 0,
  276345.2939 ms. Local log: `artifacts/staff-session-full-test-2026-10-13.log`.
- Final five-file affected regression: 23 passed, zero failed/skipped, exit 0,
  2838.5314 ms. Actual memory-only HTTP tests cover staff identity/cookie
  rotation, revoked/expired/disabled sessions, archived policy changes and
  races at confirmation, with unchanged business/audit fingerprints.
- Two initial new HTTP-fixture failures used the wrong seeded organization
  name and an absent createSession return field. Corrected the fixtures using
  the actual seed and SHA-256 token hash; behavioral assertions remain intact.
- Strict build passes, 2036 modules; all 68 public-shell hashes match. Existing
  entry chunk size and mixed static/dynamic offline-import warnings remain.
- Original eight-table SQLite fingerprints match, integrity OK, FK violations 0.
- Browser tool failed twice at runtime startup with Windows sandbox error
  `CreateProcessSecurityEnvironment` HRESULT 0x80070020, including after reset.
  No browser verdict, screenshot or cross-tab/expiry/viewport pass is claimed.
- Owned localhost 3220 memory fixture stopped gracefully: zero session reads,
  zero application POSTs, zero QA controls, unchanged business/audit hashes,
  zero external calls. No original preview restart or migration occurred.

## Still To Do

- Built expiry, foreground, interruption/malformed response and cross-tab checks.
- Same-session unsent-editor continuity, changed-identity unmount and no replay.
- Keyboard/focus and complete EN/AR/UR RTL mobile/desktop browser acceptance.
- Full captured-context client/server fencing across older staff helpers.
- Native PostgreSQL, actual devices, full-reference/accessibility and release gates.

Overall full-production estimate is now about67%; this checkpoint does not
enable live real-data AI, cloud deployment or activation.
