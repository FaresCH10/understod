# Worker Navigation and Help

20 October2026 repeat/review continuation: overall77%; navigation estimate89%
unchanged. Staff repeat/review scoped paging, exact recovery and unsent deadline
guards now pass local client/domain/HTTP/built checks. This is not complete worker
repeat/voice/device/native/hosted acceptance. See CASE_WORKFLOW_RECOVERY.md.

20 October2026 staff-side continuation: overall76%, S20/S24 navigation remains
89%, voice recovery80%. Case root/action contracts now preserve mounted child
conversation drafts through malformed root reads, disable new sends when the
root case resolves, and recover exact owner/resolution receipts without erasing
newer notes. Clean99969805:1,254 tests/1,250 passed/zero failed/four native skips.
Repeat/review recovery and broader release gates remain. See
CLARIFICATION_ACTION_RECOVERY.md. This is not full worker acceptance.

## Previous Voice Checkpoint

19 October2026 voice checkpoint: strict captured assignment/case/digest/context
receipts and exact-byte request guards now pass local client/PGlite/HTTP tests.
Built EN/AR/UR voice controls/notices/text interlock fit four widths without
capture or upload. Recorded-preview recovery/discard remains unverified in the
browser. Clean f35bb4ae:1,237 tests/1,233 passed/four native skips/zero failures.
S20/S24 estimate89%, voice contract/recovery80%, overall75%, not production ready.
See VOICE_CONVERSATION_CONTRACT.md for scope and remaining release gates.

## Previous Text Checkpoint

19 October2026: conversation text reads/receipts now use strict captured session
contracts with localized failure/recovery. Unsent drafts survive unavailable or
closed conversations; checking an older receipt preserves a different draft.
Clear-text confirmation never cancels pending requests or deletes sent messages.
Final EN/AR/UR320/390/768/1440, keyboard/focus and malformed/delayed/context
browser checks pass. Clean e8244a1c:1,231 tests/1,227 passed/four native skips/
zero failures. S20/S24 estimate88% (was85%); overall75%, not production ready.
See CASE_CONVERSATION_RECOVERY.md. Voice/repeat/resolution and wider gates remain.

## Previous Help-History Checkpoint

19 October2026: the assignment Help-history panel now has a captured-session,
exact-version paginated contract on both backends. Own108-case paging,
strict client validation, actual built recovery/session/navigation, EN/AR/UR
responsive controls and one separate long-text Help submission pass locally.
See WORKER_HELP_HISTORY.md for final clean1222-test evidence and remaining limits.
S20/S24 estimate85% (was80%); overall74%, not production ready.

## Earlier Checkpoint

Local acceptance, 2026-10-16. S20/S24 task estimate80%; overall72%, not release.

## Implemented

- Briefings/Help/Device bottom navigation with localized EN/AR/UR labels,
  current-page semantics, shared unsent-work guard and busy-state protection.
- Help reads only current own assignments through the existing scoped API,
  independent of an inbox/history filter. Seven-item paging is bounded.
- Asking about a selected assignment first reads fresh detail, then focuses the
  existing help composer. Opening Help or choosing a briefing sends no help POST.
- Explicit help submission uses the existing case route. A new pending worker
  request is visible in assignment history; it is not a staff response. The
  existing Follow-up conversations subset requires a staff message (or eligible
  repeat request) and correctly remains empty without one.
- Request/session-keyed worker reads hide a different selection immediately,
  abort superseded reads and time out after15seconds. Same-detail transient
  refresh preserves unsent editor data; failures disable sending and authority
  denial invalidates the worker session. Localized failures hide stale lists.
- Header labels use the validated current worker organization/site. Frozen
  assignment language and content are not changed by interface preferences.

## Evidence

Clean df261e27-44df-441d-a5b5-e1bcb2e3dfb5, exec35339 terminal0, offline locked
install/build:1190tests/1186pass/zero fail/four native-only skips,
275260.7615ms;43contract/ten pipeline checks,24scripted/zeroexternal requests.
All839source files unchanged, SHA256
30706687d486e61bd5e839f74c4f2b38ff4e8bf4a47cfe221f07e7eaf4f92f84.

Memory-only PGlite fixture3215 used actual application routes and built assets,
seven own current assignments plus withdrawn/other-worker/foreign decoys.
No original database or root dist was changed. Browser evidence:

- Own current page1/page2 only; no decoy or withdrawn title in Help.
- Eight-second held detail shows loading without an old composer, then focuses
  the chosen current assignment's help heading.
- Unsent draft survives Stay; explicit Discard navigates to Device without POST.
- One explicit synthetic help submit creates one actual pending case. Follow-up
  empty state is truthful; actual staff-reply conversation flow was not tested.
- A fixed503 hides stale cards and totals, shows localized text without the raw
  fixture error, and explicit refresh recovers. Superseded held-list completion
  does not reopen Help after Device navigation.
- EN/AR/UR Help fit actual320/390/768/1440 with correct direction/current-nav
  semantics, no horizontal document overflow or decoy text. Frozen contentEN
  remainsEN when UI changes. Inspected valid captures include
  worker-navigation-help-ar-320-current-2026-10-16.png,
  worker-navigation-help-ar-1440-2026-10-16.png,
  worker-navigation-help-en-390-verified-2026-10-16.png and
  worker-navigation-help-ur-390-2026-10-16.png in artifacts/.

QA resize initially targeted another selected tab: old320px readings were
rejected, not counted as wider acceptance. Selecting the dedicated responsive
view resolved this. Earlier en-390 and en-390-settled captures are actually320px
and excluded. One blank full-page failure capture is explicitly named rejected
and excluded; the replacement failure capture is not an accepted visual proof.
Some label/body-key adapter calls timed out; visible-DOM selector and native UI
state checks were used. No Reticle verdict was obtained or diagnostic uploaded.

Fixture70883 was gracefully stopped, actual terminal0. Final counters:
answerPosts0/helpPosts1/otherPosts0/listReads21/detailReads3; attempts0/cases1/
externalCalls0. Owned tabs2/3/4 closed, viewport reset; user tab3196 untouched.

## Open Gates

Full reference composition, actual staff-reply/repeat journeys from this hub,
independent Arabic/Urdu review, keyboard/AT audit, real-phone safe areas,
microphone/offline behavior, native/hosted session transport and wider authority
transitions remain. No production, actual AI quality or deployment claim.
