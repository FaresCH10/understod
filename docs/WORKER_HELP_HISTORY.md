# Worker Help History

Local checkpoint, 19 October 2026. Requirement slices: S24; A05/A06/A09/A13/A17/A18.
This is bounded Help-history acceptance, not completion of the entire Help or
conversation workflow, independent localization review, or release approval.

## Implemented

- Both backends expose authenticated
  `GET /api/worker/briefings/:assignmentId/help-history?page=1&pageSize=5`.
  Scope is the current worker's organization/site/assignment and frozen
  publication version/language. The response includes the captured client
  session context, exact assignment metadata, minimized cases and paging totals.
- Five-row pages replace the UI's old truncated100-row history. Page bounds are
  1 through5,000; forged filters, non-scalar pages and other page sizes fail.
  PostgreSQL uses the established repeatable-read snapshot helper. Existing
  legacy Help GET callers remain compatible; the UI uses the stronger contract.
- Strict client validation rejects extra/private fields, incorrect assignment,
  version, language or context, malformed/duplicate/out-of-order rows and
  inconsistent totals. Requests carry the captured session header, no-store,
  cancellation and a15-second timeout. Late selection/session/expiry changes
  cannot populate the current view. Authority failure locks the worker UI.
- History paging has localized EN/AR/UR labels and directional controls. Text
  uses automatic direction, supervisor names use bidi isolation, and timestamps
  use the worker site's time zone. Conversation buttons expose expanded state
  and focus the selected conversation region.
- A same-assignment history refresh clears the list while retaining the own
  open conversation and its unsent text. Paging/case switching are disabled
  while that conversation is dirty. Ordinary history read failure does not
  silently discard an independently opened own conversation.

## Verified Evidence

Focused checks:11 client/backend/routing tests passed. Both backends enumerate
all108 synthetic own cases across22 pages, including resolved Help and historical
follow-up without Help text. GETs leave case/help/routing/attempt/audit/receipt
inventories unchanged. Private notes are not projected. SQLite's four Help
tests and the PostgreSQL HTTP Help test passed after correction.

Fresh clean `57a2adc2-8d30-4829-97c4-708c22b0f687`, exec42035 exit0:

- Offline locked install/build;1,222 tests /1,218 passed /zero failed /four
  native-only skipped;329915.6314ms.
- All43 contract and ten scripted pipeline checks passed;24 scripted and zero
  external provider requests. All855 selected source files unchanged, SHA256
  `5c57f663a7c297e919f96dfbde835705f1191f6cf0b053f72d830489ca1e9c65`.
- Browser-tested `.tools/help-history-preview/dist` shell manifest is identical
  to this final clean build, not merely an older root build.

Browser evidence `artifacts/worker-help-history-browser-2026-10-19.json`:

- Own first/second pages, keyboard Enter paging, focus/expanded semantics,
  same-selection unsent continuity,503 and malformed-read clearing/recovery,
  held prior-assignment rejection and mismatched-context lock pass.
- Actual320/390/768/1440 viewports in EN/AR/UR show no measured horizontal,
  header or button overflow. Arabic and Urdu panels use RTL. Screenshots include
  `worker-help-history-ar-390-2026-10-19.png` and
  `worker-help-history-ur-390-2026-10-19.png`.
- Read-only fixture:17 Help-history reads, zero business POSTs, zero attempts,
  nine seeded cases unchanged, zero external calls; exec59717 exit0.

Separate browser evidence
`artifacts/worker-help-history-long-text-browser-2026-10-19.json`:

- Exactly one explicit synthetic Help POST adds one case (nine to ten), zero
  answers/other POSTs/attempts/external calls. The new Help case remains after
  reload without another POST.
- English/Arabic/Urdu text with an180-character unbroken word wraps at320px
  without measured paragraph or document overflow. See
  `worker-help-history-long-ur-320-2026-10-19.png`. Final exec92872 exit0.

Preservation `clean-backup-preservation-c114dd1c-3e64-4a76-81ca-18669c4fa2c1.json`:
original eight table fingerprints match baseline, integrity OK, zero foreign-key
violations, all42 saved build manifests valid,3,722 selected files scanned with
zero configured-secret matches. The original SQLite database/root build remain
unchanged. Temporary browser tabs were closed and viewport overrides reset.

## Non-Passing Attempts And Limits

The initial client error class used TypeScript parameter-property syntax that
Node strip-only mode rejects; it now follows the existing explicit-field style.
Initial SQLite test assertions were corrected for null-prototype database rows
and synchronous throws. A real HTTP mismatch was fixed: unavailable assignments
on the new SQLite read now return404, matching PostgreSQL. No denial was weakened.

Premature clean `b76d74fc-9d3e-4af7-95c0-c86a32846fad` was stopped by its inspected
owned process tree after the focused HTTP failure, exec97274 exit1. Its original
files/journal and separate `interrupted.json` remain. It is not counted as passed;
the original result file's stale running state is not a live-process signal.

Reticle verification was blocked by auto-review because it may transmit local
source/diagnostics externally. The user's local-diagnostics choice was preserved;
no diagnostic egress or bypass was attempted. Local browser evidence is separate
from a Reticle verdict.

Open: complete CaseConversation DTO/captured-read/localized-error acceptance;
all translated/voice/repeat/resolution branches; very-large history limit
presentation; full selected-reference comparison; independent language and
assistive-technology review; real devices; native concurrency and hosted checks.
No real worker data, live Gemini/mail calls, cloud changes, billing or deployment
occurred. The latest user instruction is to continue locally for now.

## Temporary Preview

A separate background preview was intentionally left for the user after QA:
`http://127.0.0.1:3216/api/qa-navigation?language=en`, PID18452 at launch,
20-minute automatic expiry. It uses a fresh in-memory synthetic database and
the browser-tested build, not the saved original database or root dist. HTTP200,
exact customer asset and initial nine-case/zero-attempt fixture were checked.
Choose the first assignment and scroll to Help history. This limited UI preview
is not a hosted deployment, worker-job service or complete production system.
