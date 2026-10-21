# Case Timeline

## Contract

The S15 timeline is a staff-only, captured-session, read-only projection of real
case history. Both SQLite and PostgreSQL expose
`GET /api/clarifications/:id/timeline?page=1&pageSize=10`. Only owner,
supervisor and auditor reads within the current organization/site are allowed.
No worker/operator access, tenant override, duplicate query keys or unbounded
page size. Count and page share a consistent read transaction. A fixed ten-row
page, stable chronological timestamp/ID ordering and a 50,000-event cap keep
responses bounded. The API never changes a case, response or provider job.

The projection includes original and case-linked repeat response receipts,
recorded assessment audits, case creation, real routing/ownership/escalation/
resolution clocks, messages, queued and delivered generated follow-ups, repeat
requests, deadline reviews and disagreements. A generated delivery is not
duplicated as an ordinary message. Another case on the same assignment does
not contribute messages/reviews/repeats or unrelated attempts.

No private message, original answer, note, disagreement reason, raw provider
diagnostic, hash or storage key is projected. Original content remains in its
existing authorized panels. Actor attribution names the staff member who
recorded an event; initial routing names its destination separately. Missing
historical audit clocks are not guessed from current status, the current owner
or a retention migration. SQLite synchronous legacy assessments without an
assessment audit do not acquire a fabricated checked timestamp.

The original routing row copied the case creation date, even when routing
happened later. The first implementation exposed this wrong clock. A new
backdated-case regression reproduced it on both engines, then the query was
corrected to use the scoped `clarification.routed` audit timestamp. Audit
identity expiry removes the event's case link; the timeline does not query
operational provenance to reconstruct the erased link or identity.

## Interface

The inspected selected S15 reference places the timeline beside the original
response. That placement is implemented; original facts remain in an accessible
disclosure. All timeline titles, events, states, pagination, failure and recovery
labels support EN/AR/UR. Exact UTC instants and isolated site offsets use
`CaseTime`. Private content is not automatically translated. Timeline paging,
language changes and refreshes do not remount or clear other case drafts.

The event list is a named keyboard-focusable scroller. Loading/failing reads
remove unverified event data, explicit refresh recovers, and a wrong captured
context locks the workspace. A paging result cannot substitute for another
case, page or session. The existing original-response, private notes, owner,
repeat and review controls remain independent.

The staff in-person clarification recorder is still missing. Existing worker
voice messages must not be relabeled as staff records or counted as a worker
answer. Full S15 visual matching, independent language/AT/phone/native/hosted
acceptance and real-data provider privacy approval remain separate gates.

## Executed Evidence

Six timeline tests cover both engine projections, paging, exact client DTOs,
scope/role denials, private-text exclusion, original evidence preservation,
case-linked repeats/reviews, actual late-routing clock and audit expiry.
The initial import-path failure and then the two deliberate routing-clock
regression failures were corrected. Corrected focused run:17 tests/17 pass,
zero failures/skips,7096.0157ms, including HTTP and localization checks.
Follow-up tests verify one delivery event at the actual receipt time and no
duplicate message event. Earlier combined run:15 tests/15 pass,14469.0171ms.

Browser candidate asset set is unchanged by the server-only clock repair.
Preliminary fixture88439 and attribution fixture87668 both exited0; tabs closed
and viewport reset. Final candidate checks: all five history pages; original
answer unchanged; actual owner mutation and real audit attribution; retained
unsent notes across paging/locales/outage/malformed reads; explicit recovery;
wrong-context lock; keyboard scroller focus and40px ArrowDown scroll; all twelve
EN/AR/UR by320/390/768/1440 combinations have no document/control/timeline
horizontal overflow. This is local CUA, not Reticle or full accessibility.
The final fixture has11 timeline reads,one owner POST,one exact action receipt,
zero other mutations/provider calls and an unchanged original attempt hash.
Its14 attempts/12 reviews/13 repeats are synthetic seeded history, not new
timeline-side effects.

Saved artifacts: `case-timeline-browser-2026-10-20.json`,
`case-timeline-final-en-1585-2026-10-20.png`,
`case-timeline-panel-ar-390-2026-10-20.png`,
`case-timeline-panel-ur-320-2026-10-20.png`,
`case-timeline-context-lock-2026-10-20.png`.

Cleaned snapshoted248d49 had1,296 tests/1,292 pass/zero failures/four native
skips,306839.774ms, but correctly ended exit1 because source changed for the
routing-clock repair. It is retained as an unaccepted earlier snapshot. The
fresh corrected-source cleand1edbaef-824b-4f4b-841a-12fa19904971,exec97723,
observedexit0, finishes2026-10-20T18:19:51.060Z: offline locked install/build,
1,296 tests/1,292 pass/zero failed/four native-only skips,300785.0291ms;43 mocked
contract cases,ten scripted pipeline checks,24 scripted/zero external requests.
All896 source files unchanged, SHA
ea9d234fd38886eac83cab9bf8b65d4b431f1e57908ba45482a9e0ae1628e64c.
Its asset manifest exactly matches the attribution candidate used in browser QA.
The later server-only routing-clock repair is covered by both engine tests.

Preservation62dab9f0,exec82051 observedexit0: original eight table fingerprints
match preceding523d7e94,integrityOK/FK0,68 saved manifests valid,5,381 selected
files/zero configured-secret matches. Guarded evidence artifact:
`artifacts/production-case-timeline-2026-10-20.json`.
Overall remains79% (72-85 uncertainty); case detail/recovery88% (was85%). The
bounded local timeline slice is100%; actual in-person capture remains0%.
Schema remains94; no cloud database/storage, live provider/mail, microphone,
billing, hosting or deployment action occurred.
