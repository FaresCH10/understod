# Site archive and restore

Credential-owner workflow, separate from worker access pause and platform tenant
suspension. This is implemented for synthetic local/staging operation; it is not
a production-readiness declaration.

## Contract

`GET /api/settings/sites` includes lifecycle, lifecycleRevision and
canManageLifecycle. `GET /api/settings/sites/:siteId/lifecycle` returns current
state/revision and active dependency counts to a credential owner with an active
owner membership linked to the same account, organization and target site.

`POST /api/settings/sites/lifecycle` requires exact session context, same origin,
UUID requestId, siteId, current revision, state (active/archived), allowlisted
reason (pilot_review/operational/security) and confirmed:true. Unknown fields,
foreign targets, stale revisions and unchanged transitions are rejected.

Archive refuses published briefings, queued schedules/reminders, pending staff
invitations, unresolved cases, active preparation/assessment/export jobs and
unsettled recording/source-audio work. It does not silently discard dependencies.
State/revision, immutable receipt, worker-session/link revocation, paused worker
access and audit commit atomically. Audit failure rolls everything back.

Staff remain able to read saved history and switch into the archived site. New
operational HTTP writes and guarded database admissions are rejected. Retention,
worker deletion and privacy cleanup remain available. Already cached device data
is not remotely erased. Restore permits new operational work but leaves worker
access paused; old grants/sessions never revive.

PostgreSQL takes an exclusive target-site lock for lifecycle changes and shared
site locks for operational admission. Policy is read in a separate statement
after lock acquisition. Migration 056 and the SQLite sidecar preserve minimal
control/receipt evidence. Cutover imports operational history before installing
the archived control state, preserving archived records and exact replay.

`GET /api/settings/sites/lifecycle/receipts/:requestId` is read-only, limited to
the original currently authorized owner and origin site. Exact replay returns
the old result without reverting later state. Changed intent cannot reuse it.

## Client recovery

Settings uses the existing access-change recovery component with separate
identity-keyed bounded tab metadata. Dependency preflight, reason and impact
checkbox precede dispatch. Metadata is written and read back before POST.
Uncertain outcomes lock changes; reload reads only the original receipt, never
automatically resubmits. A verified missing receipt permits an explicit unchanged
retry. Dismissal requires an explicit rejection plus a verified missing receipt.
Restoring the current site refreshes session state without switching identity.

## Evidence

2026-10-10 UTC: 27 site/import/migration checks passed, zero failures or skips
(11.106 seconds). Both repositories cover job dependency rejection, revocation,
operational write barriers, preserved source, exact replay, restore remaining
worker-paused, HTTP read-only current-site behavior and transactional rollback.
Populated cutover preserves archived controls and receipts. Another 100 focused
auth/domain/settings/templates/glossary/retention/deletion/schedule/reminder tests
passed (59.538 seconds). An initial restricted run had 29 loopback EACCES failures;
the successful rerun enabled local sockets, without changing those assertions.

Strict optimized build passed; the 513.04 kB entry warning remains for the final
performance pass. Built memory-only native browser checks proved published/case
dependency blocking even with impact checked, cancel, lost archive acknowledgement
plus failed receipt read, reload recovery with one command/receipt, archived staff
read-only view, and current-site restore with two commands/receipts while worker
access stayed paused. Desktop screenshot inspected in tool output; no saved image,
mobile or Reticle passing verdict claimed. Disposable identity signed out, tab
closed and fixture stopped. No external provider, cloud, mail or real data used.

## Remaining

Actual PostgreSQL wire/concurrency, every individual dependency category, privacy
cleanup end-to-end on an archived populated site, complete read-only UX,
44-reference/mobile/RTL/accessibility, full regression and hosted Neon/R2/TLS
verification remain release gates. Gemini Free remains synthetic-only.
