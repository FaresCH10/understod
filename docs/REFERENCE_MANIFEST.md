# Reference manifest

Spec: `Understood_AI_First_Engineering_Team_Prompt.md`, version 2026-10-02. This manifest is an inventory and acceptance map, not visual verification or implementation evidence. Routes below are proposed contracts for the new app and may be reconciled with the router by the lead engineer.

## Asset and evidence status

Latest S16-local delta: EN/AR/UR report/export controls and30 built locale-width
checks, exact command recovery and identical CSV downloads pass locally. This
is not full matched-reference acceptance: current five-metric/filter layout,
dates/UUID names/extra states and fixture language distribution differ. See
[evidence and explicit deviations](REPORT_LOCALIZATION.md).

Latest narrow S15 delta: the new generated staff composer now matches the500-
character reference limit while ordinary/pending-command compatibility remains1000.
Over-limit text is preserved, not truncated. This is not full matched-reference
acceptance; see [scoped evidence and limits](CONVERSATION_COMPOSER_LIMITS.md).

- The user's `C:/Users/Fares/Desktop/images/images.rar` (SHA-256 `7DD60001E01C64DB24710941EA0FE60D940CB3C22293EDCC097AEAD141EB47A9`) was listed before extraction: exactly 47 flat `.jpeg` entries and no traversal paths. Copies were extracted without replacing existing data to `references/archive-2026-10-03/`. All 47 extracted JPEGs were visually identified; #14-47 also matched their chat attachments by exact SHA-256. Pixel dimensions below are from the extracted JPEG files.
- The spec's original PNG directory, `C:/Users/User/Documents/Codex/2026-09-30/files-pasted-by-the-user-you/outputs/understood-ui-mockups`, does not exist on this host. The original PNGs, their dimensions, font identities and exact design tokens remain unverified. The extracted JPEGs are stable local reference copies, not original PNGs.
- The 44 selected targets are S01-S44. Use `13-briefing-detail-history-v2.png`, `16-reports-exports-v2.png`, and `23-worker-submission-status-v2.png`; older chat previews #13, #16 and #24 are superseded. Chat preview #32 is selected S13, #18 is selected S16, and #25 is selected S23.
- No running-app comparison, overlay, screenshot, responsive check or accessibility check has been run. Those evidence cells remain open. The extracted JPEGs permit a practical visual comparison now, while the absent PNG originals remain a fidelity limit. Capture app screenshots at each reference's viewport plus 320, 390, 768 and 1440 CSS-pixel widths. Keep fixture date/timezone deterministic; do not copy contradictory mockup years as real data.

## Selected screen index

`Preview` is the chat attachment number and extracted **JPEG** size, not the source PNG size. The exact extracted filename crosswalk follows the screen table. `C` is the canonical synthetic shelf-color fixture (30 assigned, 24 unique responses, 21 matches, 3 clarifications, 6 pending, 80% response completion). `D` is a deterministic synthetic variant for the specific state. Routes are provisional. Each control group is expanded into atomic acceptance items in [reference-inventory.md](agent-notes/reference-inventory.md).

| ID | Selected source PNG | Preview (px) | Role; proposed route/state | Fixture | Principal controls / acceptance |
| --- | --- | --- | --- | --- | --- |
| S01 | `01-supervisor-overview.png` | #1; 1586x992 | Supervisor; `/app` | C | Site, dates, search, notifications, metrics, actionable rows and create; A01/A15/A17 |
| S02 | `02-landing.png` | #2; 1586x992 | Public; `/` | D | Demo/example, sign-in, walkthrough, pilot CTA, responsive navigation; A11/A17 |
| S03 | `03-product-walkthrough.png` | #3; 1587x991 | Public; `/walkthrough` | D | Process steps, example playback/language, validated pilot inquiry and actual receipt; A11/A17 |
| S04 | `04-sign-in.png` | #4; 1586x992 | Staff; `/sign-in` | D | Sign-in/out, recovery, failed/disabled/expired session states; A06/A11 |
| S05 | `05-accept-invitation.png` | #5; 1585x992 | Invitee; `/invite/:token` | D | Scoped invitation acceptance, expiry/reissue/revocation/reuse; A11 |
| S06 | `06-account-recovery.png` | #6; 1586x992 | Public; `/recover` | D | Generic reset request, actual delivery state, one-use reset; A11 |
| S07 | `07-pilot-onboarding.png` | #7; 1585x992 | Owner; `/onboarding` | D | Resumable organization/site/provider/worker/first-briefing setup; A11/A18 |
| S08 | `08-briefing-library.png` | #8; 1586x992 | Supervisor; `/app/briefings` | C | Search, filter, sort, page, create, detail, duplicate, archive/withdraw; A02/A17 |
| S09 | `09-create-briefing.png` | #9; 1586x992 | Supervisor; `/app/briefings/new` | D | Record/type/upload, draft, preview, recovery and step navigation; A10/A17 |
| S10 | `10-source-and-question-review.png` | #10; 1586x992 | Supervisor; `/app/briefings/:id/prepare` | C | Source/facts/question/private rubric, optional edit/regenerate, continue; A02/A03 |
| S11 | `11-language-coverage.png` | #11; 1585x992 | Supervisor; `/app/briefings/:id/languages` | C | Language choice, artifact readiness/error/retry and technical block; A04/A09 |
| S12 | `12-assign-and-publish.png` | #12; 1586x992 | Supervisor; `/app/briefings/:id/publish` | C | Audience, deadline, schedule, preview, confirmation, immutable publish; A12 |
| S13 | `13-briefing-detail-history-v2.png` | #32; 1586x992 | Supervisor; `/app/briefings/:id` | C | Overview/responses/languages/history, immutable v3 and draft v4; A02/A12 |
| S14 | `14-clarification-queue.png` | #14; 1586x992 | Supervisor; `/app/clarifications` | C | Owner/status filters, due, row/detail, new clarification, reason legend; A13 |
| S15 | `15-clarification-detail.png` | #15; 1585x992 | Supervisor; `/app/clarifications/:id` | C | Original audio/transcript, timeline, follow-up, in-person record, notes/resolution; A13 |
| S16 | `16-reports-exports-v2.png` | #18; 1586x992 | Supervisor; `/app/reports` | C | CSV export/history, status bar, language breakdown, denominator warning; A15 |
| S17 | `17-reviewer-queue.png` | #17; 1586x992 | Supervisor; `/app/processing` | D | AI job tabs/selection, status/pipeline, details/retry; old filename does **not** imply human reviewer; A04/A08 |
| S18 | `18-language-artifact-review.png` | #19; 1586x992 | Supervisor; `/app/processing/:jobId/artifacts` | C | Text/audio/question/glossary tabs, copy/play/preview, regenerate/optional edit; A02/A04 |
| S19 | `19-worker-entry.png` | #21; 740x1600 | Worker; `/w/entry/:grant` | D | Arabic RTL language selection, current worker confirmation, help/invalid link; A06/A09 |
| S20 | `20-worker-briefings.png` | #20; 736x1600 | Worker; `/w/briefings` | C | To-do/completed tabs, own assignment cards, listen/open, help/device nav; A05/A09 |
| S21 | `21-worker-listen-question.png` | #22; 821x1600 | Worker; `/w/assignments/:id` | C | Actual play/pause/replay/seek/speed, text, question audio, record/help; A03/A10 |
| S22 | `22-worker-record-answer.png` | #23; 780x1600 | Worker; `/w/assignments/:id/respond` | C | Mic/elapsed/waveform/stop/cancel/type, later preview/rerecord/send; A07/A10/A17 |
| S23 | `23-worker-submission-status-v2.png` | #25; 740x1600 | Worker; `/w/attempts/:id` | C | Uploaded vs AI-pending, answer playback, own briefings/help; outcome states must be truthful; A07/A17 |
| S24 | `24-worker-help.png` | #26; 740x1600 | Worker; `/w/help/:caseId` | C | Conversation/audio, record/type/attach reply, history and in-person guidance; A13 |
| S25 | `25-worker-session-controls.png` | #28; 738x1600 | Worker; `/w/device` | D | Language, offline/shared-phone toggles, install, clear audio, end session; A07/A09 |
| S26 | `26-organization-sites.png` | #27; 1586x992 | Owner/admin; `/app/settings/sites` | D | Organization fields, site add/edit, timezone, primary/deputy, status; A14 |
| S27 | `27-site-crews.png` | #29; 1586x992 | Supervisor/admin; `/app/crews` | C | Arabic RTL teams, create/add, selection, membership and activity; A09/A14 |
| S28 | `28-worker-directory.png` | #30; 1586x992 | Supervisor/admin; `/app/workers` | C | Import/add, search, language/access filters, row/select/detail/actions, pagination; A05/A14 |
| S29 | `29-csv-import.png` | #31; 1586x992 | Admin; `/app/workers/import` | D | Upload/replace, validate, row errors, download errors, confirmed import; A14 |
| S30 | `30-staff-roles.png` | #47; 1585x992 | Owner/admin; `/app/settings/staff` | D | Staff invite/role/site, detail, resend/cancel, permission summary; A05/A14 |
| S31 | `31-language-readiness.png` | #33; 1586x992 | Owner/admin; `/app/settings/languages` | D | Language readiness, provider/target/audio config, processing checklist/start; A04/A09 |
| S32 | `32-templates.png` | #34; 1586x992 | Supervisor; `/app/briefings/templates` | D | Template tabs/list/preview/new/use draft, version/edit/archive; A02/A14 |
| S33 | `33-glossary.png` | #35; 1586x992 | Admin; `/app/settings/glossary` | C | Pair/search/list, suggestion/override/example/version, add/save/regenerate; A02/A14 |
| S34 | `34-plan-usage.png` | #36; 1584x993 | Owner; `/app/settings/usage` | C | Plan/usage, caps/pause/alert threshold/contact, cost caveat; A04/A15 |
| S35 | `35-manual-invoices.png` | #37; 1585x992 | Owner; `/app/settings/invoices` | D | Invoice list/preview/download, audited payment form; A14 |
| S36 | `36-privacy-retention.png` | #38; 1586x992 | Owner/admin; `/app/settings/privacy` | D | Retention selectors/save, data request, support, queued-deletion caveat; A16 |
| S37 | `37-audit-history.png` | #39; 1585x992 | Auditor/owner; `/app/reports/audit` | C | Date/site/actor/action filters, CSV, event/detail/paging; A05/A16 |
| S38 | `38-system-jobs.png` | #40; 1586x992 | Operator; `/ops/jobs` | D | Job filters/detail/retry, recent activity, failure diagnostics; A08 |
| S39 | `39-integrations-spend.png` | #42; 1586x992 | Operator; `/ops/providers` | D | Provider config/verification, usage/caps, pause/kill switches; A04/A16 |
| S40 | `40-tenant-operations.png` | #41; 1586x992 | Operator; `/ops/workspaces` | C | Tenant access/status, scoped worker listing, pause modal/confirmation; A05/A06 |
| S41 | `41-recording-connectivity-states.png` | #43; 1586x992 | Worker components, not separate route | D | Mic denial/absence, interrupted/empty, local outbox, retry/version conflict; A07/A10 |
| S42 | `42-access-recovery-states.png` | #44; 1536x1024 | Public/worker/staff components | D | Expired invitation/session/link, suspension, forbidden, cleared-device paths; A06/A11 |
| S43 | `43-lifecycle-feedback-states.png` | #46; 1536x1024 | Cross-role components | D | Empty/failed/received/paused/immutable/new-version/queued states; A02/A04/A07 |
| S44 | `44-answer-preview-outcome-states.png` | #45; 1586x992 | Worker components | D | Listen-before-send, explicit send, match with limits, clarification/unassessable/help; A03/A07 |

## Exact archive crosswalk

Every key in this table denotes an exact filename under `references/archive-2026-10-03/`: `40` means `WhatsApp Image 2026-10-02 at 5.00.40 PM.jpeg`, and `40 (n)` means `WhatsApp Image 2026-10-02 at 5.00.40 PM (n).jpeg`; likewise `41`/`42` use `5.00.41 PM`/`5.00.42 PM`. The archive JPEGs are byte-identical to the corresponding chat JPEGs where a chat attachment path was available (#14-47). #1-13 were identified by visual content and sequence. `Excluded` means retain the file for provenance but do not use it as the visual target.

| Chat # | Archive key | Screen | Selection |
| --- | --- | --- | --- |
| 1 | 40 | S01 | Selected |
| 2 | 40 (1) | S02 | Selected |
| 3 | 40 (2) | S03 | Selected |
| 4 | 40 (3) | S04 | Selected |
| 5 | 40 (4) | S05 | Selected |
| 6 | 40 (5) | S06 | Selected |
| 7 | 40 (6) | S07 | Selected |
| 8 | 40 (7) | S08 | Selected |
| 9 | 40 (8) | S09 | Selected |
| 10 | 40 (9) | S10 | Selected |
| 11 | 40 (10) | S11 | Selected |
| 12 | 40 (11) | S12 | Selected |
| 13 | 40 (12) | S13 | Excluded; obsolete human review |
| 14 | 41 (1) | S14 | Selected |
| 15 | 41 (2) | S15 | Selected |
| 16 | 41 (3) | S16 | Excluded; superseded report |
| 17 | 41 (5) | S17 | Selected |
| 18 | 41 (4) | S16 | Selected v2 |
| 19 | 41 (6) | S18 | Selected |
| 20 | 41 (8) | S20 | Selected |
| 21 | 41 (7) | S19 | Selected |
| 22 | 41 (9) | S21 | Selected |
| 23 | 41 (10) | S22 | Selected |
| 24 | 41 (11) | S23 | Excluded; superseded receipt |
| 25 | 41 (12) | S23 | Selected v2 |
| 26 | 41 (13) | S24 | Selected |
| 27 | 41 (15) | S26 | Selected |
| 28 | 41 (14) | S25 | Selected |
| 29 | 41 (16) | S27 | Selected |
| 30 | 41 (17) | S28 | Selected |
| 31 | 41 (18) | S29 | Selected |
| 32 | 41 | S13 | Selected v2 |
| 33 | 42 (1) | S31 | Selected |
| 34 | 42 (2) | S32 | Selected |
| 35 | 42 (3) | S33 | Selected |
| 36 | 42 (4) | S34 | Selected |
| 37 | 42 (5) | S35 | Selected |
| 38 | 42 (6) | S36 | Selected |
| 39 | 42 (7) | S37 | Selected |
| 40 | 42 (8) | S38 | Selected |
| 41 | 42 (10) | S40 | Selected |
| 42 | 42 (9) | S39 | Selected |
| 43 | 42 (11) | S41 | Selected |
| 44 | 42 (12) | S42 | Selected |
| 45 | 42 (14) | S44 | Selected |
| 46 | 42 (13) | S43 | Selected |
| 47 | 42 | S30 | Selected |

The three excluded JPEG dimensions are #13 `1586x992`, #16 `1586x992`, and #24 `740x1600`. All three remain in the extracted archive; none was deleted or overwritten.

## Evidence still required

Latest21 October S15 action/focus continuation: actual Generate/send and private
record controls now share the desktop row and wrap at320/390 without overlap.
Proof: `artifacts/staff-actions-aligned-en-1585-2026-10-21.png` and
`staff-actions-aligned-ur-390-2026-10-21.png`;13 actual locale-width measurements
and three-language history focus/draft/submission checks are retained. This is
qualitative action placement, not a matched reference. The current1000-character
message contract differs from the reference500-character staff counter and still
needs reconciliation. Typed original/no original audio, seeded history, dates,
worker language, draft interlocks and other geometry differ from the reference.
Full44-reference/A17 and independent language/AT/phone acceptance remain open.

Latest21 October worker-voice follow-up supersedes the missing-array limitation
below: all twelve fresh preview widths are retained in
`artifacts/worker-voice-purpose-layout-2026-10-21.json`; actual notice gates,
storing/received and failed recovery are in the matching browser-final report.
`worker-voice-purpose-ur-390-2026-10-21.png` shows the new candidate. This still
does not prove full matched references, physical devices or independent language/AT.

21 October 2026 S22/S24 continuation now includes synthetic preview/send,
unknown-ack local clear/reload/GET recovery, exact reply replay and recovery
after explicit supervisor closure. EN/AR/UR notice/capture and draft interlocks
work with English profile/assignment. Images:
`artifacts/worker-voice-final-en-320-2026-10-21.png`,
`worker-voice-final-ar-390-2026-10-21.png`,
`worker-voice-final-ur-320-2026-10-21.png`.
Twelve width checks observed, raw array lost; not full matched-reference,
physical-mic, independent language or AT acceptance. Purpose fallback copy and
rendered failure matrix remain. See VOICE_CONVERSATION_CONTRACT.md.

21 October2026 S15 staff-recorder continuation: the inspected selected JPEG#15
now has an actual private staff-purpose recording action and bounded history,
with explicit capture/preview/save and receipt recovery. Final local proof:
`artifacts/staff-recording-final-en-desktop-2026-10-21.png`,
`staff-recording-final-ar-390-2026-10-21.png`, and
`staff-recording-final-ur-320-2026-10-21.png`. All12 locale-width combinations
fit. The action is inside the follow-up panel, not yet side-by-side with Generate
as in the source. A dedicated private recorder dialog is used; no waveform or
spoken-language quality is fabricated. Fixed tones and synthetic history are QA
data, not a matched visual fixture or physical recording proof. Pagination focus,
full reference composition, independent languages/AT/phones and A17 remain open.
See STAFF_CASE_RECORDINGS.md and the current checkpoint/browser evidence.

20 October2026 S15 local timeline continuation: selected JPEG#15 was inspected
again at1585x992. Actual timeline now sits beside the original response; facts
remain in a disclosure. Saved current-build viewport screenshot:
`artifacts/case-timeline-final-en-1585-2026-10-20.png`; mobile panels:
`case-timeline-panel-ar-390-2026-10-20.png` and
`case-timeline-panel-ur-320-2026-10-20.png`. EN/AR/UR320/390/768/1440 containment,
keyboard scroller, paging/drafts/fault/context checks pass locally. This is a
qualitative composition check, NOT a matched-reference acceptance: typed
synthetic original (no fabricated audio), many seeded history events, actual
current dates, expanded evidence and pending in-person recorder differ from
the source fixture. Full S15/44-reference/A17 acceptance remains open. See
CASE_TIMELINE.md and production-case-timeline-2026-10-20.json.

1. If available, obtain the 44 original selected PNGs, measure source dimensions, record hashes/licensing, and compare them with these JPEG copies. Preserve originals. All 47 JPEGs have now been visually inspected.
2. Reconcile proposed routes/control IDs with implemented routes and `docs/FEATURE_REGISTER.md` without treating page presence as completion.
3. At deterministic viewports, compare each running page/state to its source PNG; save app screenshots and observations/diff paths. Inspect Arabic RTL and worker flows on 320/390/768/1440 CSS-pixel widths.
4. Run keyboard/focus/contrast/automated accessibility and real device/audio checks separately. Do not mark A17 complete from this inventory.
