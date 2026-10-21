# Clarification Action Recovery

Local implementation, 20 October 2026. Requirement slices S14/S15/S24 and A13.
This checkpoint covers staff case
list/detail reads, owner changes and human resolutions. Repeat/review actions,
recorded-voice journeys and complete localization remain separate work.

20 October continuation: repeat/review captured contracts, paged histories,
draft continuity and exact recovery are now implemented locally in the separate
CASE_WORKFLOW_RECOVERY.md checkpoint. Recorded voice and wider release gates
remain open; the root-action evidence below is preserved unchanged.

## Implemented

- Root clarification JSON reads and writes require the captured staff session
  context. The client checks current account/site/role/expiry before and after
  requests and hashes. Old selections are aborted and cannot update a new page.
- Bounded exact page/detail DTOs expose scoped owner choices and retained
  original assessment reasons/evidence, without putting private notes in list
  rows or exposing the raw rubric. PostgreSQL reads use repeatable-read snapshots.
- Owner changes include the owner observed when editing began. Competing changes
  produce a durable rejection instead of silently replacing another supervisor.
  Explicit rebasing retains the desired owner and acknowledges the current one.
- Both backends store immutable original-actor action receipts with applied,
  unchanged or rejected effects. Exact retries return the original receipt even
  after later case changes. The case change, business audit and receipt audit
  commit together or roll back together.
- Scoped recovery storage contains only UUID, kind and canonical intent digest,
  never notes or owner payloads. Receipt checks are GET-only. Resending requires
  the exact original intent and explicit user action; an absent receipt does not
  erase pending metadata or authorize a different command.
- A verified older receipt cannot erase a different notes draft. Same-case
  refreshes and failed reads preserve drafts and mounted conversation/review
  components; case writes remain disabled until fresh details are verified.
- Unsent case drafts participate in navigation and unload warnings. Resetting
  them requires a Cancel-first trapped dialog and does not cancel pending work.
  Resolved case details disable new conversation sends even if its separate
  conversation history has not refreshed yet.
- Receipt metadata imports from SQLite after historical case/staff changes.
  Workers and operators receive no access to the new receipt table. No native
  database or cloud migration was performed by this local checkpoint.

## Verification Status

Focused domain/client/projection tests pass on SQLite and embedded PostgreSQL,
including atomic rollback, scope denial, original actor/role, exact replay,
conflicting notes, stale/unavailable owners, immutable receipts and hash-time
session changes. Populated historical backup/import and captured-context HTTP
tests also pass locally. Native PostgreSQL concurrency is not proved by PGlite.

The initial built browser run exercised failed refresh, draft navigation guard,
Cancel/focus trapping, owner conflict/rebase, malformed post-commit replies,
GET recovery, refusal to resend changed notes, pre-commit failure and recovery
without erasing newer notes. Its terminal counts were four explicit action
POSTs, three receipt GETs and three receipts; no other POSTs, answers, messages,
repeat/review rows or external calls. One separate fixture owner change was
intentional. Two cases and zero original attempts remained.

Initial browser QA found reset-focus loss and a stale resolved-case composer;
both were fixed and retested in customer-CFO7RqBu. Confirmed reset focuses the
remaining notes input on both open and resolved cases. A conversation draft
survives a malformed root-detail read and its send control remains disabled.
Resolving the case suppresses new conversation controls even before the child
history refreshes. Exact GET recovery keeps newer notes. Four final responsive
samples at 320/390/768/1440 have no horizontal overflow or clipped buttons.
After an eight-second delayed old-case request, the new case remains selected
at the recorded 117-second observation. A wrong returned context locks the
workspace. Final fixture exited0 with one explicit resolution POST, one receipt
GET/one receipt, zero other POSTs/messages/attempts/reviews/repeats/external
calls, two cases and no fixture owner changes. Browser tab closed and viewport
reset. This is English staff UI, not independent EN/AR/UR or AT acceptance.

Clean d5a69f1e exited0 with 1,253 tests: 1,249 passed, zero failed and four native
skips; offline install/build and both synthetic evaluations passed, with869
unchanged source files. A later compatibility fix projects historical SQLite
recorded-assessment wrappers without leaking their extra metadata. All16
focused domain/client tests pass including that case. Final clean99969805
exited0 at 2026-10-20T07:21:40.183Z: 1,254 tests/1,250 passed/zero failed/four
native-only skips, 342820.8153ms, locked offline install/build,43 mocked contract
cases and ten scripted pipeline checks. Its869 source files are unchanged,
SHA11c2518e3887ee591570047baf83e54a006a375375f847697f618acf9ee3b170.
The tested customer-CFO7RqBu preview manifest and shell exactly match this clean
build. Evaluation fault cases are deliberate; this is not live Gemini accuracy.
Preservation af456a93 exited0: original eight table fingerprints unchanged,
integrity OK/FK0,52 saved manifests valid,4,330 selected files/zero configured
secret matches. Both browser fixtures exited0; all verification sessions ended.
Overall estimate76%, staff clarification recovery85%, S20/S24 navigation89%,
voice recovery80% and broader service permissions82%. These are engineering
estimates, not a production-ready verdict.
Initial clean 4eb1109e ran 1,253 tests:
1,246 passed, three stale migration/permission-count assertions failed, and four
native-only tests skipped. It is not an accepted current clean result.

## Remaining Gates

Repeat/review transport and draft recovery, recorded voice preview/upload
acceptance, all selected reference states, independent EN/AR/UR review, full
keyboard/assistive-technology/phone coverage, current93 native role/concurrency,
privacy-approved real-worker AI, hosted operation and release drills remain.
Receipt hashes/result metadata are audit evidence, not proof of complete erasure
from provider history, backups or other devices. This is not production ready.
