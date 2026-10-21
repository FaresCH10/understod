# Private Worker Control Fencing

Scope: private worker grants/list/issue/revoke/clipboard, worker deletion reads/
submission/completion from both actual callers, privacy worker directory, and
worker/publication response reads. Retention-policy saves and their other child
settings remain separate, unfinished request-migration boundaries.

## Task Checklist

| To-do | Progress | Acceptance evidence |
| --- | ---: | --- |
| [x] Capture grant/list/issue/revoke authority | 100% | Shared bounded transport, aborted reads and guarded completion |
| [x] Bind grant data to the selected worker and keep bearer values private | 100% | Strict issue/list/revoke projections; link lives only in memory |
| [x] Check original identity and selection before private clipboard writes | 100% | Fresh scoped session read, immutable snapshots, role/scope/expiry/held checks |
| [x] Require fresh status before replacing access after uncertainty | 100% | Unknown outcomes clear stale list and disable issue until a scoped read succeeds; never auto-issue |
| [x] Fence deletion receipt/post/queued/lock callbacks | 100% | Exact submitted ID/reason, guarded completion, versioned abortable reads |
| [x] Wire both People and privacy-settings deletion callers | 100% | Actual authority props compile; privacy list uses captured transport |
| [x] Capture assignment/publication response reads | 100% | Shared scoped response hook and all list/detail callers migrated |
| [x] Reject stale/missing context before server side effects | 100% | Test-first dual-backend failures, then HTTP/snapshot proof |
| [x] Full synthetic regression checkpoint | 100% | 165 files, 879 passed, zero failed/four native skips, terminal exit 0 |
| [ ] Rendered modal/clipboard/expiry/reload/Strict Mode acceptance | 0% | Browser inventory failed at process security environment startup (0x80070020) |
| [ ] Native roles/TLS/concurrency/devices/deployment acceptance | 0% | Local embedded proof is not native or hosted certification |

These are overlapping narrow implementation milestones, not an arithmetic
average or production-readiness claim. Private worker/response request boundary:
**75%**. Whole staff request fencing: **80%**. Overall production: **about 60%**
(55-65% uncertainty).

## Contract

- Private grant requests retain the original staff authority and cannot adopt
  another account or site into an earlier view. Lists abort on cleanup; unknown
  outcomes cannot leave stale list data enabled for replacement issuance.
- Issue results must match the selected worker, valid bearer shape and future
  expiry. Metadata lists reject duplicate IDs, foreign workers, impossible
  statuses and bearer/private fields. Revocation remains explicit and audit-atomic.
- A private link stays in component memory, not storage. It is cleared when the
  modal closes, the link is dismissed, or its link/session lifetime ends. Replacement
  is never automatic; an uncertain result requires a fresh scoped status read.
- Clipboard writes re-read the session through captured transport and compare
  full original identity, role, scope, mode, site state and expiry. Both expected
  session and grant are copied into immutable snapshots. Dismissal/selection or
  authority changes before the write stop it; changes during a write cannot
  report successful copying. Actual browser clipboard/permission behavior is unproved.
- Deletion has separate unsent-review and submitted-intent references. A review
  nonce is not treated as a submitted request. Pending status must match the
  actual submitted UUID and reason before clearing the in-view intent or invoking
  queued callbacks. Unrelated, stale, held, aborted or invalid receipt evidence
  cannot announce success or reset another selected worker.
- Both People and PrivacyWorkers receive authority through their real callers.
  RetentionSettings only forwards it to this privacy child in this checkpoint;
  its own retention/notice/text-policy requests are NOT claimed migrated.
- Publication recipient/detail and worker assignment/detail reads now use the
  shared captured transport, not optional raw fetch headers. Native private audio
  playback retains cookie authentication and current role/scope checks.
- Shared middleware covers these private-control/privacy/response JSON routes.
  Existing origin, cookie, actual role, tenant/site, immutable deletion, revoke,
  publication history and audio restrictions remain. No schema migration is needed.

## Local Evidence

- Missing-context privacy reads initially returned 200 instead of 409 on both
  SQLite and embedded PostgreSQL. The complete enumerated private route matrix
  now denies before grant/session/deletion/directory/business/audit side effects.
  Correct-authority grant issue/list/revoke, assignment/privacy reads and exact
  deletion acceptance/receipt continue to work in both local backends.
- Initial focused eight-file regression: 33 passed, zero failed/skipped, exit 0,
  4844.1197 ms. It preceded the final submitted-vs-review intent distinction and
  immutable clipboard snapshot adjustment.
- Final affected four-file regression: 18 passed, zero failed/skipped, exit 0,
  3720.048 ms. Covers private projection/identity/selection, original snapshot
  mutation, exact deletion evidence and current dual-backend HTTP protections.
- Strict build: 2041 modules, 592.26 KB entry. Existing large-chunk and mixed
  static/dynamic offline-import warnings remain. All 69 shell hashes match;
  eight original SQLite fingerprints match, integrity OK, zero FK violations.
- Final full synthetic suite after all source changes: 165 files, 883 tests,
  879 passed, zero failed, four native prerequisite skips, terminal exit 0,
  326512.5017 ms. Log: `artifacts/worker-controls-suite-2026-10-13.log`.
  Handle 5166 and all other owned required commands are terminal. No owned
  server was launched. Original fingerprints and shell hashes match again after
  the terminal full result.
- Current browser inventory failed at `CreateProcessSecurityEnvironment`
  (0x80070020). No browser actions/verdict, original restart/migration, live API/
  mail/cloud operation or external diagnostic upload occurred.

## Remaining

Rendered status-after-uncertainty, modal dismissal/expiry, clipboard permissions,
keyboard/RTL/mobile, Strict Mode and real devices remain unverified. Deletion
submitted intent is retained in the current mounted view; reload reads authoritative
worker progress, but a full original unsent/unknown-body reload matrix is not
certified here. Browser/native gates and remaining retention/privacy/settings,
glossary/templates, reports/export/notifications and App-owned callbacks remain.
Full reference/language/a11y, live AI, hosted and release acceptance stays open.
Real worker content stays off Gemini Free.
