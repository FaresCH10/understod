# People Request Fencing

Current scope: worker/crew directory and management only. CSV import, private
worker-link controls, deletion and assigned-response views are separate upcoming
boundaries. CSV import continuation now has its own checkpoint in
IMPORT_REQUEST_FENCING.md. This is not universal People API coverage or
production readiness.

## Task Checklist

| To-do | Progress | Acceptance evidence |
| --- | ---: | --- |
| [x] Capture worker/crew list and crew detail authority | 100% | Scoped transport, abortable reads and context-keyed real caller |
| [x] Fence add/edit/move/disable/re-enable and crew lifecycle completion | 100% | Guarded callbacks, held mutation completion and original identity |
| [x] Reject missing/changed context before directory side effects | 100% | Test-first failures on both backends; scoped HTTP and snapshots now pass |
| [x] Preserve current selection across unrelated late worker mutations | 100% | Completion checks current selected worker/form before changing detail |
| [x] Verify focused directory/search/deletion/helper regressions | 100% | Seven files, 33 passed, zero failures/skips |
| [x] Full combined synthetic regression checkpoint | 100% | 163 files, 868 passed, zero failed/four native skips, terminal exit 0 |
| [ ] Rendered stale-view/Strict Mode/focus acceptance | 0% | Browser runtime startup remains unavailable |
| [ ] CSV/private access/deletion/assigned-response request migration | 0% | These existing features are explicitly excluded from this request-fencing scope |
| [ ] Native PostgreSQL/device/hosted acceptance | 0% | Embedded local proof does not certify native or hosted operation |

These are narrow overlapping implementation milestones, not an average of full
worker-management feature completion. Worker/crew request boundary: **75%**.
Whole staff request fencing: **70%**. Overall production: **about 60%** (55-65%
uncertainty), not readiness.

## Contract

- The existing immutable staff authority is propagated from the real People
  caller to directory, crew lifecycle/re-enable dialogs and membership selectors.
  Requests use shared bounded, no-store cookie-authenticated transport.
- Worker and crew reads abort on effect cleanup. Stale authority cannot install
  rows, errors or completion state. The actual directory mounts under its context
  and route, rather than silently adopting another account's session.
- Mutation completion rechecks current/held authority before resetting forms,
  selecting a worker, closing dialogs, changing filters or invoking callbacks.
  Parent worker mutations also recheck the selected worker/form before modifying
  detail, so a late result does not replace a subsequently selected worker.
- The parent mutation gate prevents repeated simultaneous dispatch. Existing
  confirmed reactivation request IDs, scope checks, input validation, audit
  atomicity, membership and publication/response preservation remain unchanged.
- Shared server policy covers worker/crew directory GETs, crew exact-detail GET,
  worker/crew PATCH, worker/crew creation, membership moves, disable/re-enable and
  archive/restore. Its predicate is deliberately narrow. Native import-error CSV
  downloads and unfinished import/access/deletion/assignment helpers are not
  silently claimed migrated.
- Staff requests need captured context; unauthorized worker cookies retain the
  existing role denial. Context headers are not authentication without cookies.

## Local Evidence

- Missing-context directory reads initially returned 200 instead of expected
  409 on both SQLite and embedded PostgreSQL. Enforcement now passes with
  unchanged worker/crew/membership/reactivation and other business/audit snapshots.
- Focused seven-file regression: 33 passed, zero failed/skipped, exit 0,
  10503.775 ms. Existing search destination, worker disable/delete restrictions,
  crew scope, archive/restore, frozen publication audience and shared async
  completion/identity/uncertainty protections remain asserted.
- TypeScript passes after correcting completion validator inference. Strict
  production build: 2039 modules, 580.75 KB entry. Existing chunk and mixed
  static/dynamic offline-import warnings remain.
- All 69 shell hashes match; eight protected original SQLite fingerprints match,
  integrity OK, foreign-key violations zero, checked read-only.
- Full combined synthetic suite after final invitation and directory changes:
  163 files, 872 tests, 868 passed, zero failed, four native prerequisite skips,
  terminal exit 0, 314317.7437 ms. Log:
  `artifacts/people-request-suite-2026-10-13.log`. Test handle 93427 and build handle
  13775 are terminal. No original preview restart/migration or external operation
  occurred. No browser/native/deployment verdict is claimed.

## Remaining

Complete CSV raw-byte transport/preview/confirm/recovery, private link and clipboard
authority, deletion request completion and assignment-history reads separately.
Unknown non-idempotent directory outcomes still require read reconciliation;
this task adds no automatic mutation replay or new universal saved receipts.
Browser, languages/a11y/devices, native/database, live AI, hosted and release
gates remain open. Real worker content stays off Gemini Free.
