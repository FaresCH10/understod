# Worker Welcome And Language Selection

2026-10-16. S19 local synthetic implementation and browser checks. Task estimate
80%; not full reference, language, accessibility, device or production acceptance.

## Implemented

The worker-link screen now uses visible native Arabic/English/Urdu radio rows,
a localized welcome heading and Continue command, correct page language/direction,
large touch targets and native arrow-key navigation. The unframed layout follows
selected source21/S19 (archive JPEG5.00.41 PM (7)), without inventing the target
worker, company or site from an unredeemed token. It is not pixel-identical proof.

Only an already validated, unexpired current browser session can supply the
displayed name/organization/site. These labels identify the current session,
not the link recipient or the human holding the device. Mixed-direction labels
use bdi and bounded values. Guests see no fabricated identity or organization.
An existing session has an explicit handoff warning.

A supplied token stays volatile/masked in an expandable access-link field.
Manual entry remains available. The new-link action clears only that unsent
field, expands it and focuses it; it does not redeem, log out, switch identity,
send help or claim local storage was erased. Continue is disabled while empty,
busy or blocked. Empty-token Enter is rejected by native required validation.
The existing explicit grant/digest/GET-only uncertain-outcome recovery is retained.
Choosing a language is a presentation choice until exact acceptance; canceling
does not apply it to the existing worker or alter assignment language.

Help is an actual accessible disclosure. It tells the worker to contact the
supervisor in person, clearly says no help request was sent, and does not issue
an unauthenticated help POST. The synthetic-only/real-data-not-approved notice
remains visible. Buttons expose expanded state with persistent controlled targets.

## Local Verification

- Typecheck and ten focused entry/recovery/language tests pass,12543.7586ms.
- Clean2c9bdda4-4c58-46c9-968b-3ca55f4b602e passed locked offline install/build,
  1188tests/1184pass/zero fail/four native skips,294500.9473ms,43contract/ten
  pipeline checks,24scripted/zero external provider requests. All835selected
  source files stayed unchanged with SHA256
  fab91e260f65e2c6066579147ea5d8e6b377939e77c281b302458c86d9a58720.
- Actual built UI was served by the memory-only PGlite fixture on3214, separate
  from the original preview/data. Three guest languages fit320/390/740/1440px,
  with no horizontal overflow. Two readbacks before viewport settling returned
  old widths; those observations were rejected and the missing dimensions were
  rechecked after settled state. No unsupported viewport result is counted.
- Native radio ArrowDown moves Arabic to English to Urdu and updates localized
  headings/commands/direction. New-link clears/focuses the masked field and
  disables Continue. Help expands honestly with no sent-message claim.
- Arabic explicit entry with lost acknowledgement and failed proof reads survives
  reload and keyboard recheck, reaching Worker001's Arabic inbox with the assigned
  EN briefing unchanged. Choosing Urdu on a later empty entry and canceling leaves
  the existing Arabic worker interface active.
- Urdu rejected-before-acceptance remains unconfirmed across reload and keyboard
  recheck. Explicit new-link recovery returns to empty disabled entry without a
  current identity. Guest empty-token Enter opens no workspace.
- Browser console error/warning list was empty at the checked endpoint. This is
  not a claim of complete monitoring or third-party Reticle acceptance.

Screenshots are in `artifacts/worker-entry-s19-*2026-10-16.png`, including Arabic
320px current-session and390px guest views,English390px empty-token/help view,
Urdu1440px framing,Arabic recovered inbox andUrdu unconfirmed recovery.
Browser viewport was reset and its temporary tab closed. Fixture4414 exited0
through its existing fifteen-minute timer. Its final counters were accepted
redeem1/logout1/proof3, rejected-before-acceptance redeem1/logout1/proof0; one
grant redeemed, zero active worker sessions, zero attempts and external calls.
Port3214 was independently confirmed not listening after interruption.

## Remaining

Independent Arabic/Urdu review, screen-reader/full keyboard acceptance, real phone
and shared-device testing, private link delivery, complete expired/revoked/site
access states, all44-reference comparison and hosted/native/cloud integration
remain open. Gemini Free receives synthetic data only. The separate Neon retry
is not evidence of browser or language quality.
