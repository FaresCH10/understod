# Conversation Recovery

Local implementation, 19 October 2026. Requirement slices S15/S24/S44 and
A05/A06/A09/A13/A17/A18. This is not complete conversation, language-quality,
real-device, native PostgreSQL or hosted release acceptance.

## Implemented

- SQLite and PostgreSQL HTTP conversation pages and message receipts identify
  the exact case and current client session. PostgreSQL generated follow-up
  receipts carry the same captured context. Domain receipts remain compatible.
- The client accepts only exact bounded DTOs, supported languages, coherent
  pages/capabilities, ordered unique messages and case/message-scoped audio
  URLs. Unexpected private fields, malformed acknowledgements, foreign cases
  and changed sessions fail closed rather than producing an empty conversation
  or a successful-delivery notice.
- PostgreSQL list totals and rows share a repeatable-read transaction.
- Requests capture context/expiry, use same-origin scoped routes, no-store
  credentials, bounded waits and live selection/authority checks before and
  after asynchronous work. Worker and staff parents supply their current
  authority callbacks. This checkpoint did not migrate the root staff case
  page; its later read/action recovery is in CLARIFICATION_ACTION_RECOVERY.md.
- Recovery preserves only the original UUID, text digest and command kind in
  scoped session storage, never plaintext. Receipt checking is GET-only;
  resending is an explicit exact-command operation, not an automatic retry.
- Drafts remain visible and selectable during unavailable or closed reads.
  Sending is disabled until current reply authority is available. Drafts block
  navigation/paging, while recoverable pending metadata alone does not strand
  the user in a screen.
- Clearing local unsent text requires a keyboard-trapped confirmation with
  Cancel first. It does not remove pending metadata, cancel server work or
  delete a sent message. Closing the dialog restores focus to its trigger,
  remaining composer or refresh control as appropriate.
- Recovering an earlier receipt clears only a matching draft, never different
  text entered afterward. Queued/processing generation is not delivered;
  failed/delivered notices follow verified server stages.
- EN/AR/UR notices, fallback author labels, RTL paging arrows, isolated names
  and site-time-zone timestamps are implemented. Independent language review
  remains outstanding.

## Focused Evidence

- Client DTO/transport, recovery and scripted follow-up suite: 19 passed,
  zero failed, 24,194.2588 ms. Includes hashing-time identity/selection changes,
  malformed/unknown receipts, diagnostic redaction, authority changes and
  conservative generation stages. No external provider requests.
- SQLite/PGlite conversation and private voice regressions: 13 passed,
  zero failed, 15,857.9926 ms. Actual loopback HTTP responses pass the captured
  client reader, including queued follow-up receipt replay. Original attempts
  are unchanged; this is not live native PostgreSQL evidence.
- Initial built English QA fixture on port3217: both pages and Enter paging,
  actual320/390/768/1440 wrapping (including an unbroken180-character token),
  failed-read draft visibility/disabled send, Cancel/Shift-Tab/focus return,
  two explicit unverified acknowledgements recovered by two receipt GETs,
  preservation of a different draft and pending metadata after clear,
  and closed-thread draft visibility/disabled send pass.
- That fixture finished with 23 seeded messages plus exactly two explicit
  messages, two receipt GETs, eight conversation reads, zero answers, zero Help
  POSTs, zero attempts, nine seeded cases and zero external calls. It was
  explicitly stopped; exec29809 actually exited0. The lost-ack fixture replaces
  the success body, not a proven network interruption or HTTP503.
- QA found a focus fallback gap after confirming text clearing, when the
  trigger disappears. The implementation repairs it. Final-built checks below
  verify both composer and refresh-control fallback paths.

## Current Verification

Final source snapshot e8244a1c-bea9-4325-8280-75013d359f83 passed the offline
locked-install/build/test/evaluation gate; exec77750 actually exited0.
1,231 tests/1,227 passed/zero failures/four native-only skips,509459.1198ms;
43 contract/ten pipeline checks,24 scripted/zero external requests. All857
source files unchanged, SHA
08d3c375860702a240b52a1758b640ee360cc07a04ae1953ccae4eda52c5c8ae.
The final customer-DWAFuK0s preview matches the clean build. Initial browser
work used customer-CRD5tnpL; its only subsequent UI change was focus fallback.

Final port3218 browser checks: loaded20-message pages at all12 EN/AR/UR x
320/390/768/1440 samples fit without document/control/text overflow. AR/UR
Enter paging loads the three older messages. Arabic confirmation clears only
local text and focuses the remaining composer. Urdu Escape preserves text and
returns focus to the clear control; clearing during a failed read removes the
composer and focuses Refresh. Urdu errors remain localized with selectable
read-only drafts. Malformed DTOs hide old messages without private fields or
false empty results; GET refresh recovers. An eight-second old-case read cannot
replace the newly selected empty case. A changed client context locks the root
worker UI and removes the conversation. Final fixture made zero business POSTs,
11 conversation GETs, zero attempts;23 seeded messages/nine cases unchanged.
Explicit stop completed; exec33930 actually exited0, tab closed, viewport reset.

Artifacts: conversation-responsive-final-2026-10-19.json contains actual loaded
measurements. Accepted screenshots are conversation-clear-ar-390-dialog and
conversation-failed-read-ur-320, both dated2026-10-19. Earlier native-wrapper
and immediate pre-paint screenshot captures are retained but not modal proof.
Preservation dcb6b4ee: all eight original table fingerprints exactly match the
previous checkpoint, integrity OK/FK0;45 saved manifests valid,3,902 files and
zero configured-secret matches. Original root data/dist remain unchanged.

Two attempts to attach a separate final Arabic QA browser tab timed out while
the full local suite was running. The later attachment succeeded and the actual
checks above then ran; the failed attachments are not rendered passes. Reticle's
previous source verification was refused by auto-review for possible external
metadata egress; no diagnostics were sent and local QA is not Reticle proof.

## Remaining

Complete voice-recorder captured requests/recovery and repeat/resolution/review
controls, whole staff clarification DTO/request migration, generated-stage
browser/reload/authority acceptance, all selected reference states, independent
EN/AR/UR and assistive-technology review, real phones, native current-policy
permissions, privacy-approved real-worker AI and authorized hosted acceptance.
Gemini Free remains synthetic-only. No cloud activity is needed for this local
checkpoint and no production-ready claim is made.
