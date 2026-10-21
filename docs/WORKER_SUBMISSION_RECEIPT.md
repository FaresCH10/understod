# Worker Submission Receipt

2026-10-19 local checkpoint. S23 receipt/history task85%; overall73% unchanged.
Not a production-readiness verdict.

## Implemented

Both backends expose a scoped GET for one exact accepted submission UUID, with
the frozen assignment version/language, original own answer and server receipt
time. The response does not borrow the latest attempt's outcome. Existing
authorization, tenant/site/session checks and private metadata restrictions apply.
No migration, permission or provider change is involved.

The client captures assignment/version/language/request/kind before sending.
Its exact DTO reader rejects unexpected fields, changed identity/context and
wrong selection, and bounds the server duration. A confirmed acknowledgement is
displayed separately from a pending, failed, paused or actual assessment result.
The visible page refreshes pending exact reads only; it does not resend answers.
Read errors clear protected answer/outcome metadata but retain truthful confirmed
receipt status. A same-selection refresh preserves the mounted audio player.
Direct Help opens the existing composer and focuses its heading without sending.

Own-recording playback uses existing scoped private WAV routes, now supporting
validated single-byte ranges only after integrity/authorization checks. Typed
receipts have no invented audio, waveform or duration.

## Verification

- Focused12 tests passed2991.046ms and final TypeScript check passed.
- Exact DTO/context/selection and SQLite plus embedded PostgreSQL HTTP tests
  cover earlier-versus-later outcomes, own text/audio metadata, byte ranges,
  foreign/anonymous/staff/extra-query/stale-session denial, withdrawal, disabled
  worker and corruption rejection. Some older rows are explicitly seeded metadata,
  not proof of a normal repeated-answer workflow.
- Clean74f4475c-897c-4aef-a76f-21914c4a0249 ran08:22:48.031-08:29:13.026UTC.
  Actual exec19659 exit0; locked offline install/build;1206 tests/1202 pass/0 fail/
  4 native-only skips,350733.6369ms; contract/pipeline evaluations passed.
  All850 source files unchanged; source SHA256:
  `87f31d0b5d14e70dab33a6f812ddcc354a76bdeb642a0ec416ffe1583f25d852`.
- Built memory-only fixture49458 exited0, with four deliberate typed-answer POSTs,
  four attempts, no help/other POSTs, no cases or external calls. Exact reads25,
  history reads13,list reads5,detail reads9. One real synthetic assessment-worker
  step completed. The receipt updated to matched without another POST; this is
  not live Gemini or independent semantic-quality evidence.
- Actual browser showed the exact own text, server time and v1/EN content binding.
  Arabic and Urdu interface preferences did not relabel frozen EN content.
  Malformed and503 reads hid prior private metadata and internal markers; manual
  refresh recovered. A changed clientContext locked and cleared the private page.
  Held same-selection refresh retained own metadata; navigation removed the old
  receipt from another own briefing. Direct Help focused an empty composer and
  created no case.
- EN/AR/UR DOM layouts fit320/390/768/1440 widths without horizontal overflow.
  Settled screenshots include `worker-receipt-pending-en-740-2026-10-19.png` and
  `worker-receipt-pending-ur-740-2026-10-19.png` in artifacts. Earlier screenshots
  immediately after viewport changes are not relied on for exact raster sizing.

## Limits

No real microphone or own-audio browser journey, independent Arabic/Urdu review,
assistive-technology/phone acceptance, native/hosted transport or live AI quality
is proved. Additional reference states and narrow history layouts remain; separate
rendered paging/fault/localization checks are in WORKER_SUBMISSION_HISTORY.md.
Main detail/history snapshots can lag the refreshed exact receipt
until explicitly refreshed. A match is not proof of understanding or permission
to start work. No real data, cloud mutation, provider/mail call, billing change or
deployment occurred. Original database and root preview build were not modified.
