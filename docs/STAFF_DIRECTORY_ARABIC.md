# Arabic Directory And Crew Workflows

2026-10-15. Local implementation and synthetic browser acceptance for part of
S27/S28, A09/A14/A17. This is not completion of all S27 reference controls,
all-reference fidelity, all staff localization, or independent Arabic QA.

## Implemented

The existing People page now has an English/Arabic directory-language selector.
It changes presentation only, not the authenticated session, worker language,
tenant/site authority, request IDs, endpoints, publication snapshots or database
schema. Locale changes do not remount the directory or reload its queries.
Unsent worker/crew input, selection and pagination remain in component state.
The preference is held in the current app instance; it is not a durable account
preference and resets on a full page reload.

The directory and crew controls cover translated filters, loading/empty states,
pagination, worker add/edit/disable/re-enable, crew create/rename/archive/restore,
destination search and membership moves, confirmation impact/authorization,
accessible names, tooltips, success messages and error presentation. Existing
captured-request and session-loss fencing remain in place. Arabic error copy
does not print unrecognized raw server messages; uncertain requests are not
relabeled as confirmed failures or successes. Prior success/error messages can
be displayed in the currently selected language without repeating a request.

The surrounding directory shell switches to RTL, with the desktop sidebar on
the right, localized navigation, role/date/site controls, search, notifications,
sign-out and footer. Shared site selection and session-lock components accept a
presentation-language override; the signed authority/session is not rewritten.
Bidirectional isolation is applied to stored names/codes; editable names use
automatic text direction. Directional paging/detail arrows mirror in RTL.

Unrelated routes continue to use their existing English presentation. The
private-link, deletion and worker-assignment-history subpanels inside People
are still explicitly `lang="en" dir="ltr"`, not falsely declared translated.
CSV import and other destination screens are not newly translated. Worker
language selection is a separate existing feature and is unchanged here.

## Executed Evidence

- TypeScript passes. Twenty-eight focused tests pass, including six new pure
  localization tests plus existing directory HTTP, repository, captured-request
  and staff-policy tests. The first restricted run passed 27 and failed its HTTP
  connection with loopback EACCES; the unchanged permitted rerun passed all 28.
- The real production web build was generated in the ignored
  `.tools/crew-rtl-preview/dist`, not over the original `dist`.
- Browser checks used the existing disposable in-memory credential fixture on
  ports 3188/3189 with a paged synthetic crew catalog. No cloud connection,
  Gemini/mail processing or original application data was used.
- Created `فريق بيروت QA-27`, renamed it to `فريق بيروت QA-27 المسائي`, moved
  synthetic `QA Member 000` to it, archived and restored it through normal UI
  controls. Refreshed reads and a full browser reload retained the saved name,
  active worker and crew membership in this fixture. This proves browser/server
  behavior, not a process-restart, native PostgreSQL or hosted rehearsal.
- An unsent worker code `QA Unsaved عامل 027` survived Arabic-to-English
  switching without submission. Arabic validation of an invalid crew name was
  checked, switched to its English error and back without a request replay.
- Archive confirmation was initially disabled; Shift+Tab from Close wrapped
  to Cancel. Escape closed restore and returned focus to its trigger. Confirmed
  archive/restore showed distinct Arabic success states. No deletion or
  access-link operation was invoked.
- Arabic site selection was inspected at desktop and 320px without switching
  sites. Other-page navigation returned to English; coming back to People
  retained the app-instance Arabic preference.
- Viewport/document widths were 320/305, 390/375, 768/753 and 1440/1425.
  Narrow table regions remained bounded at 233/303px with intentional 600px
  inner table scrolling. At desktop the sidebar began at x=1173px and was
  252px wide on the right. Restore/site dialogs were 281px wide at 320px.
- Screenshots were inspected. One immediate site-dialog capture caught a
  viewport paint transition; it was replaced by a settled capture. The four
  saved directory captures were separately opened and inspected where needed.
- The QA tab was closed, viewport override reset, browser visibility restored
  and owned fixture session stopped. No original preview was restarted.
- Reticle verification was blocked by auto-review because it could transmit
  project metadata externally. It is not a passing verification, and no bypass,
  diagnostic upload or external support contact was attempted.

Screenshots under `artifacts/`:

- `crew-rtl-directory-320-2026-10-15.png`
- `crew-rtl-directory-390-2026-10-15.png`
- `crew-rtl-directory-768-2026-10-15.png`
- `crew-rtl-directory-1440-2026-10-15.png`
- `crew-rtl-restore-320-2026-10-15.png`
- `crew-rtl-site-dialog-320-2026-10-15.png`
- `crew-rtl-validation-320-2026-10-15.png`

Fresh verification is tracked in
`.clean-check/9cc91df8-999e-4431-86fe-d34119843f01/result.json`.
It passed,terminal exit0,08:01:52-08:06:23UTC:locked offline install/build,
1092tests/1088pass/zero fail/four native-prerequisite skips,253632.3536ms;
43mocked contract and ten scripted pipeline checks. All802 source-file hashes
remained stable. No secrets or original application data were copied. This is
not live AI accuracy,actual CI,native cloud or hosted verification.

## Still Open

The team-first S27 overview composition, its complete reference controls and
scoped supervisor/activity presentation still need an implementation/fidelity
audit. Translating this directory does not substitute for that audit. Remaining
English subpanels and destination routes, durable staff locale preferences,
independent Arabic terminology/pluralization/font QA, native-language screen
readers, zoom/short-screen/keyboard/device coverage and full cross-session/native
acceptance remain open. No independent review or production readiness is claimed.
