# Staff Case Localization

## Scope

20 October 2026 accepted local-only checkpoint. The clarification queue,
staff-created case form, detail, owner/resolution actions, repeats, reviews,
deadline choices and local-clear dialogs have English, Arabic and Urdu copy.
The surrounding staff shell, site picker and search follow the case language.
Other staff destinations retain their existing language scope. This is not a
claim that the entire staff application supports all three languages.

The language selection is in-memory UI state. Changing language does not
remount a case, clear an unsent draft, change session authority, rewrite private
content or alter a canonical request hash. A full reload defaults to English.
Worker answers, publication questions/key facts, evidence quotes, private notes
and unknown provider reasons remain original data, not generated translations.
Known reason codes and lifecycle states have translated labels. Unknown state
values are unavailable, not silently treated as pending. Unknown operational
errors use a localized uncertainty warning without exposing transport details.

`CaseTime` keeps the original UTC instant in the semantic time attribute and
isolates the technical UTC offset in an unbroken left-to-right element. Civil
deadline selection still uses the site's timezone and explicit repeated-hour
choice. Locale selection cannot change the requested instant.

## Queue Composition

The selected S14 reference was inspected at 1586 by 992. The local queue now
groups the current filtered case count with owner/status controls, places owner
under worker ID, and displays full language, topic/version, reason, received,
due and status. Listen-first guidance and a visible reason legend sit beside
the table on desktop and stack at narrower widths. The count is scoped to the
current filters, not an invented global open count. The table deliberately
scrolls horizontally inside its own container on narrow screens.

S15 was inspected separately. A timestamped case timeline and the staff
in-person clarification recording control are still absent. Existing worker
Help/reply voice recording is not a substitute. Full matched-reference,
independent Arabic/Urdu, assistive-technology and real-phone acceptance remain.

## Local Evidence

Six focused tests cover translation/placeholder completeness, shell parity,
exact route scope, unchanged private intent/hash, safe unknown states/errors,
timezone/DST validation and isolated GMT offsets. Strict typechecking and the
separate candidate builds pass. Clean50987288-24b1-47b0-8f98-c60a50af566d,
exec40194 observedexit0, finished2026-10-20T17:51:41.730Z: offline locked
install/build,1,290 tests/1,286 passed/zero failed/four native-only skips,
304943.0671ms,43 mocked contract cases,ten scripted pipeline checks and24
scripted/zero external requests. All890 source files unchanged, SHA
ee2b833090b166848bbd53eb3f128639e3bc3604f88578f264fbadffd8fb777a. The candidate
browser asset manifest exactly equals the clean build's manifest.

Overall estimate79% (72-85 uncertainty), queue/creation80% (was70%) and
application-wide localization60% (was57%). These are engineering estimates,
not test pass rates. Case localization is a bounded local slice, not full
application localization or production readiness.

Corrected candidate browser fixture session4794 exited0. Actual browser actions:

- English draft survives a switch to Urdu; one disagreement saves with exact
  original private text and leaves original assessment unchanged.
- Repeated New York 2026-11-01 01:30 selects the second occurrence in Arabic;
  the server stores exactly 2026-11-01T06:30:00.000Z and displays GMT-5.
- A selected assignment/private reason survives Urdu-to-Arabic switching;
  one independent case is created with truthful original staff provenance.
- A malformed post-commit owner reply remains uncertain. Switching Arabic to
  Urdu retains the guard; one explicit GET receipt verifies the original save
  without a second owner mutation.
- Urdu local-reset dialog starts on Cancel. Cancel retains notes; confirmed
  local reset restores editor focus without undoing the server action.
- Creation controls fit 320/390/768/1440 viewports. Queue has no document
  overflow at those widths; off-screen detail buttons are inside its deliberate
  840px table scroller. These are containment checks, not complete accessibility.

Counters: one creation POST, one owner POST, one owner receipt GET, two review
POSTs, zero repeat/message POSTs or provider calls. Original attempt hash is
unchanged. There are three cases, one worker help request, fourteen attempts,
fourteen reviews (twelve seeded plus two deliberate), thirteen seeded repeats
and zero messages. The `otherPosts` count includes the one creation POST.
Both current-phase required fixtures exited0; their temporary tabs are closed
and the viewport override is reset. No microphone was used.

Evidence files:

- `artifacts/clarification-locale-browser-counters-2026-10-20.json`
- `artifacts/clarification-locale-queue-ar-2026-10-20.png`
- `artifacts/clarification-locale-queue-ur-1440-2026-10-20.png`
- `artifacts/clarification-locale-create-ar-320-2026-10-20.png`
- `artifacts/clarification-locale-detail-ur-390-2026-10-20.png`

The initial fixture found a bidirectional timestamp/offset display defect;
the corrected candidate separates and isolates those values. Its saved
screenshots show GMT-4/GMT-5 as unbroken offsets. This is local CUA evidence,
not Reticle, native PostgreSQL, independent language or deployed acceptance.
Schema remains94. No original database/dist, cloud grants, storage, provider,
mail, billing, hosting account or deployment was changed.

Preservation523d7e94-53a7-4778-823a-ed2d49dd7c47, exec19725 observedexit0:
original eight table fingerprints equal preceding986edabb, integrityOK/FK0,
all63 saved manifests valid,5,054 selected files/zero configured-secret matches.
Guarded summary artifact: production-staff-case-localization-2026-10-20.json.
