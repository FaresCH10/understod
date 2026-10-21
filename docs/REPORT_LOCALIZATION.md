# Report Interface Localization

## Current Local Scope

21 October 2026. Reports now has EN/AR/UR controls, surrounding scoped staff
shell, publication search/date filters/paging, response/assignment-language
labels, export statuses, loading/failure/expiry/retry copy, exact-request recovery,
success notices, accessible meter labels and lazy/error-boundary fallback copy.
Activity/Audit is a separate English route, not included in this language scope.

Language changes do not remount the report, refetch its data, alter filters or
rewrite pending export commands. Success keys and stored errors are translated
at render time. Unknown transport diagnostics are not displayed. Titles, crew
names, IDs, filenames, original evidence and CSV contents stay as data; mixed-
direction values use isolation. Times include exact UTC offsets, and export
history uses the frozen export timezone when available.

Export history now distinguishes loading/failed/verified-empty states and hides
unverified rows after failure. Busy copy does not claim a receipt GET is queuing
an export. Publication paging/manual refresh focuses a persistent heading before
removing controls; passive reads do not force focus. Locale selection keeps the
current publication page and unsubmitted search/date fields.

## Evidence

- Focused25 report/export checks passed before the final focus regression was
  added. That regression then failed on the observed missing target and passes
  after repair. The current11 client/recovery checks pass; complete clean results
  cover the wider backend/HTTP tests.
- Built15 locale-width report checks and15 pending-retry checks pass at320/390/
  768/1440/1586 CSS pixels. Each actual width matches its requested value; report
  controls stay inside the viewport without text/button overflow. The existing
  narrow sidebar intentionally scrolls horizontally and was measured separately.
- EN/AR/UR held publication paging keeps H2 focus, removes unverified rows and
  restores the actual3-row second page. Search draft, selected version and return
  focus work. Loading/failure/manual recovery do not invent empty histories.
- One immutable saved CSV was downloaded in all three languages: three200
  responses,2107 bytes each, identical SHA-256. Application locale does not
  become an export filter or rewrite the file.
- Real browser create and retry flows each exercise committed/lost ACK, receipt
  outage/missing response, later rejected retry and exact GET recovery on reload.
  Each pair of explicit POSTs has the same request ID/body; newer crew filters
  and locale changes do not replace the original intent. One create row and one
  retry receipt remain. Success notices retranslate; Arabic auditor reads pass.
- Native date-field actions set the actual ISO values, retained across locale
  changes and captured in the server command. Generic date fill left empty
  values and formatted fill failed; those attempts are not acceptance evidence.
- Raw evidence: `artifacts/reports-locale-browser-final-2026-10-21.json`,
  `reports-locale-first-final-2026-10-21.json`, `reports-native-date-entry-2026-10-21.json`,
  `reports-locale-ur-reference-2026-10-21.png` and
  `reports-locale-recovery-ur-390-2026-10-21.png`.
- Preliminary parent16123/PID17252, read/layout parent55452/PID20748 and corrected
  recovery parent96129/PID25284 all observedexit0 after owned stop. Their memory
  publications/attempts remain unchanged; no external requests or real mic/data.
- Initial fixture logging incorrectly put the incoming stream into flowing mode
  before the real API parser. The app rejected one request and its missing
  receipt allowed clearing; this is not a lost-ACK recovery pass. The corrected
  observer forwards parser pushes without starting a reader. Its actual commits
  and exact retry bodies were then verified. All rejected evidence is retained.
- Clean3061dd72 parent43012 observedexit0:1,342 tests/1,338 pass/zero fail/four
  native-only skips, offline build/evaluations,915 stable source files. This
  accepted UI snapshot predates only the test-observer correction. Corrected
  cleana16e0668 parent71025 observedexit0, same counts/build/evaluations,
  source SHA324a09c9ab3886f60ac9465d843ccda4c160cca3a7e1ebac3dd6bdfb15f5dfa9.
  Source stayed unchanged. Current preservation/guarded checkpoint follows.

## Progress And Limits

Engineering estimate: overall82% (previous81%; uncertainty74-87), report/export
task90% (previous85%), whole-interface localization63% (previous60%). Other task
estimates are unchanged. These are not test-pass percentages or release approval.

This is not full S16 pixel/reference acceptance. Five metric cards/real filters,
current dates, UUID filenames and additional true states differ from the image.
Overall30/24/21/3/6 and80% are correct, but this fixture's per-language response
counts12/10/2 differ from the selected reference10/8/6; do not relabel or alter
historical assignments to manufacture a match. A canonical reference fixture
still needs reconciliation. Independent language/AT/real-phone/current-native/
hosted/privacy gates remain. No provider/mail/cloud/billing/deployment changes.
