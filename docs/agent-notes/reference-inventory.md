# Reference/control inventory notes

Scope: S01-S44 from spec version 2026-10-02. This is the product/reference analyst's handoff. No app behavior or visual fidelity is claimed. All 47 JPEGs from the user-provided RAR were extracted to `D:\understod\references\archive-2026-10-03` and visually inspected. Source PNGs are still absent. The exact filename/selection crosswalk, proposed route, fixture and measured JPEG dimensions are in `docs/REFERENCE_MANIFEST.md`.

## Control groups to split into feature-register entries

Each dot ID denotes a distinct action or state family; implement/test individual variations within the family. Every operation must be authorized server-side and yield loading/empty/success/error/conflict feedback. The acceptance IDs below point to the spec's A01-A18, not executed tests.

| Screen | Atomic control groups and acceptance focus |
| --- | --- |
| S01 | S01.1 site/date selection; .2 search; .3 notifications; .4 metric drilldown; .5 briefing/clarification/processing rows; .6 create/navigation (A01/A15). |
| S02 | S02.1 mobile navigation; .2 example/demo entry; .3 walkthrough; .4 sign-in; .5 pilot CTA; .6 supported-language and claim accuracy (A11). |
| S03 | S03.1 step navigation; .2 language/example playback; .3 inquiry validation; .4 dedupe/throttle/store; .5 actual delivery/failed state (A11). |
| S04 | S04.1 credential sign-in/out; .2 recovery; .3 throttling; .4 disabled/expired state; .5 authorized return route (A06/A11). |
| S05 | S05.1 invite scope display; .2 signup/sign-in; .3 atomic accept; .4 expiry/revoke/reuse/reissue; .5 duplicate membership handling (A11). |
| S06 | S06.1 generic reset request; .2 actual delivery status; .3 one-use expiring reset; .4 used/invalid link; .5 session handling (A11). |
| S07 | S07.1 persisted/resumable org/site/timezone; .2 supervisor/language/provider config; .3 worker access; .4 first briefing; .5 unavailable prerequisite/support contact (A11/A18). |
| S08 | S08.1 search/filter/sort/page; .2 status rows/detail; .3 create; .4 duplicate-as-draft; .5 archive/withdraw preserving history (A02). |
| S09 | S09.1 record/type/upload; .2 mic/device/codec/empty/limit states; .3 elapsed/stop/preview/rerecord/cancel; .4 draft save/recovery; .5 processing notifications/steps (A10). |
| S10 | S10.1 source playback/transcript; .2 facts/question/private rubric; .3 optional edit/regenerate; .4 dependency invalidation; .5 continue when technically ready (A02/A03). |
| S11 | S11.1 language selection; .2 translated title/body/question/audio readiness; .3 unsupported/missing/failed state; .4 safe retry/regenerate; .5 prevent incomplete-language publish (A04/A09). |
| S12 | S12.1 site/crew/worker audience; .2 exact language/version preview; .3 deadline/reminder; .4 immediate/scheduled mode; .5 atomic confirmation and assignment snapshot; .6 concurrency/unsupported-recipient conflict (A12). |
| S13 | S13.1 overview/responses/languages/history tabs; .2 playback/source/key facts; .3 version timeline/draft v4; .4 immutable published v3; .5 new version/supersede/withdraw/archive (A02/A12). |
| S14 | S14.1 owner/status/search/page filters; .2 due/overdue/reason rows; .3 case detail; .4 new case; .5 deputy/escalation; .6 retry dedupe (A13). |
| S15 | S15.1 original response playback/transcript/assessment/evidence; .2 timeline/assignment; .3 follow-up text/generate/send; .4 in-person record; .5 private notes/resolution; .6 rebrief/new attempt/disagreement; .7 original evidence preserved (A13). |
| S16 | S16.1 site/crew/time/version filters; .2 exact denominator/status/language breakdown; .3 async bounded CSV request; .4 queued/ready/download/expiry; .5 audit/formula neutralization; .6 completion-not-comprehension caveat (A15). |
| S17 | S17.1 AI-only queue tabs/status filter; .2 scoped job selection/details/provenance; .3 pipeline/step status; .4 safe retry; .5 failures/pending truthfulness (A04/A08). |
| S18 | S18.1 text/audio/question/glossary tabs; .2 exact source/target comparison; .3 private rubric access; .4 playback/copy; .5 regenerate translation/audio; .6 optional edit and dependency invalidation; .7 technical checks/provenance (A02/A04). |
| S19 | S19.1 scoped link redemption/current worker; .2 Arabic RTL and language choice; .3 continue/help; .4 expiry/revocation without enumeration; .5 notice that link is not identity proof (A06/A09). |
| S20 | S20.1 own-assignment to-do/completed tabs; .2 translated cards/status/due; .3 open/listen/respond; .4 help/device navigation; .5 no coworker data (A05/A09). |
| S21 | S21.1 briefing play/pause/replay/seek/speed/progress; .2 translated text alternative; .3 separate question playback; .4 record/help; .5 no rubric leak or attention claim (A03/A10). |
| S22 | S22.1 mic activation/elapsed/waveform/stop/limits; .2 cancel/discard; .3 actual preview/rerecord; .4 explicit send; .5 typed alternative where enabled; .6 assignment/version binding (A07/A10). |
| S23 | S23.1 saved-here/upload/server-received/AI-pending/outcome distinctions; .2 own answer playback; .3 retry without duplicate attempt; .4 conflict/next action; .5 back/help (A07/A17). |
| S24 | S24.1 pre/post-answer independent help; .2 conversation/audio; .3 record/type/attach reply; .4 translated follow-up; .5 history/status/in-person guidance; .6 no fake answer success (A13). |
| S25 | S25.1 identity/language; .2 offline cache and shared-device toggles; .3 install; .4 clear saved audio; .5 end session/reset with unsent-work warning; .6 cross-worker isolation (A07/A09). |
| S26 | S26.1 org/support-contact edit; .2 site add/edit/archive; .3 timezone/status/dependency validation; .4 primary/deputy/languages (A14). |
| S27 | S27.1 Arabic RTL site/team selection; .2 create/edit/archive crew; .3 add/move worker; .4 membership/supervisor scoping; .5 activity/history and mixed-direction text (A09/A14). |
| S28 | S28.1 bounded search/filter/page/select; .2 worker create/edit/archive; .3 scoped detail/response action; .4 issue/reissue/revoke private link; .5 import entry; .6 no excess identifiers (A05/A14). |
| S29 | S29.1 bounded CSV upload/replace; .2 encoding/schema/duplicate/language/site validation; .3 preview/error download; .4 explicit confirm; .5 atomic/partial policy and idempotent retry matching writes (A14). |
| S30 | S30.1 staff invite/role/site grant; .2 detail and permissions; .3 resend/cancel/revoke; .4 last-owner protection; .5 no reviewer/translator role (A05/A14). |
| S31 | S31.1 language/provider/UI/content capabilities; .2 connection/transcription/translation/speech checks; .3 error/retry/checklist; .4 actual readiness evidence; .5 no mandatory per-briefing human gate (A04/A09). |
| S32 | S32.1 template tabs/search/filter; .2 preview; .3 create/edit/archive/version/duplicate; .4 use as new draft reprocessing dependencies (A02/A14). |
| S33 | S33.1 pair/search/term selection; .2 AI suggestion/override/example; .3 add/save/edit/remove/regenerate; .4 provenance/version; .5 draft invalidation, published history immutable (A02/A14). |
| S34 | S34.1 plan/capabilities/usage periods/units; .2 caps/alert/pause/reset; .3 cost unknown vs estimated vs actual; .4 contact request; .5 quota enforcement (A04/A15). |
| S35 | S35.1 invoice list/detail/preview/download; .2 amount/currency/total/balance; .3 audited manual payment form; .4 draft/issued/partial/paid/void state; .5 no automatic-collection claim (A14). |
| S36 | S36.1 recording notice; .2 retention selectors/save; .3 data export/deletion confirm/jobs; .4 purge/pseudonymization/audit; .5 support; .6 backup/local limits (A16). |
| S37 | S37.1 date/site/actor/action filter/page; .2 actual event detail; .3 scoped redacted CSV; .4 read-only append-normal-role policy; .5 no tamper-proof claim (A05/A16). |
| S38 | S38.1 operator-only jobs/backlog/health/filter/detail; .2 safe diagnostics/retry; .3 kill switches; .4 distinct from S17 customer queue (A08). |
| S39 | S39.1 credentials presence/config without key exposure; .2 authorized verification; .3 capabilities/models/status; .4 estimated vs actual usage; .5 caps/pause/kill switches (A04/A16). |
| S40 | S40.1 tenant search/status; .2 scoped access listing; .3 pause/resume confirmation/reason/audit; .4 enforce suspension on sessions/jobs; .5 no universal content impersonation (A05/A06). |
| S41 | S41.1 denied/absent mic recovery; .2 interruption/empty capture; .3 local-saved-not-received; .4 disconnect/retry; .5 superseded/withdrawn conflict, wired into real worker controls (A07/A10). |
| S42 | S42.1 expired/revoked invite/session/link; .2 suspended tenant; .3 forbidden page; .4 cleared-device identity; .5 genuine authorized recovery paths (A06/A11). |
| S43 | S43.1 true empty/loading; .2 AI failure/retry; .3 response received/check delayed; .4 quota pause; .5 immutable v3/new v4; .6 export/deletion queued (A02/A04/A07). |
| S44 | S44.1 unsent answer preview/re-record; .2 explicit send; .3 match limited to key facts; .4 clarification/unassessable/help; .5 delayed feedback/no rubric before submission; .6 preserved attempts (A03/A07). |

## Visual observations from available chat JPEGs

- S01 (#1) places four compact metrics above a briefing table, clarification list, recent activity and a small audio panel. S02 (#2) is a full-width public hero with product-flow imagery, not a split-card landing page. S03 (#3) puts five process steps and example playback left of a pilot inquiry form; the form's footer itself warns that submission requires a configured contact service.
- S04-S06 (#4-6) use sparse account layouts: split wordmark/sign-in; centered invitation form; centered generic recovery confirmation. The invitation's primary-language field is context, not a language-review role. Recovery copy must remain generic even when delivery is unavailable.
- S07 (#7) shows a six-step onboarding progress indicator and technical language-provider states. S08 (#8) is a dense filterable briefing table. S09 (#9) shows the source recorder and a four-step drafting flow. These preview states do not prove that recording/provider work is active.
- S10 (#10) has transcript/facts/question/private rubric/audio side-by-side. Its pictured rubric includes the **unasked walkway fact**, which conflicts with the spec's A03: assessment of the shelf-placement question must require only blue/finished and yellow/unfinished. Preserve the layout, correct the rubric logic and displayed criterion.
- S11 (#11) shows per-language translation/question/audio status and blocked publish. Its copy says v4 will **automatically publish** when ready, but the spec requires a separate customer publish/schedule action; correct that copy and behavior. S12 (#12) is the audience/publication confirmation view, with readiness summary and explicit checkbox.
- The excluded old S13 (#13) displays `Language review`, named reviewers, a different fact set and a mandatory correction/signoff concept. It is not a target. Selected S13 is #32 with AI processing and the canonical shelf facts.
- Shared desktop shell (#14-19, #27, #29-42, #47): dark midnight-teal left rail about 16% of a 1586-pixel preview, ivory canvas, ~80-pixel top toolbar, white bordered panels, emerald commands, amber attention states, neutral blue-gray secondary data, compact tables. This is observational, not a measured token specification.
- Selected S13 (#32): published v3 with five compact counters across top, source/key-point/processing blocks left and version timeline right. Draft v4 is visibly separate; published content is read-only.
- Selected S16 (#18): four counters, single segmented status bar, 80% labeled **response completion**, language breakdown and export history; warning says response status is not proof of safe work or internal understanding. Older #16 has an incorrect adjacent `Not understood` caption, so do not use it.
- S17 (#17) and S18 (#19): AI processing is the navigation label and workflow. S18 has optional edit/regenerate and automatic checks; green checks cannot become mandatory human signoff.
- Worker phone layouts (#20-26, #28): large touch targets, sparse single-column flow, emerald primary buttons, black headings, gray helper text, amber caution. S19 (#21) is Arabic RTL. S23's selected #25 says **AI check in progress** after upload, avoiding premature review completion; old #24 says only review pending.
- S27 (#29) mirrors the desktop shell RTL, including right-side navigation, while worker S19 uses a distinct phone layout. Mixed Arabic/English worker IDs need direction-safe rendering.
- S34-S40 (#36-42) are dense operational/account views. Their synthetic figures and dates are fixture examples, not live-data instructions. S40 pause modal explicitly warns cached device data is not erased.
- S41-S44 (#43-46) are sheets of alternate visual states. Implement them as reachable component states in the applicable flows, not standalone error galleries. S44 includes three phone outcomes side by side; screenshot appearance does not authorize revealing the private rubric before answer submission.

## Gaps and next visual task

The original selected PNGs remain unavailable, but the 47 JPEG references are stable in the project. The lead can compare all 44 selected running states against those JPEGs at matched pixel dimensions now; if original PNGs later become available, inspect them separately. Evidence paths in the feature register should remain `not run` until running-app screenshots, manual observations and fixes exist. Fonts, exact color values, SVG/icon licenses, and source PNG pixel sizes remain unverified. The archive mapping has no unresolved identity ambiguity; the remaining fidelity limit is JPEG versus unavailable PNG originals.
