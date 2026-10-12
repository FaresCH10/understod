# Crew Lifecycle Checkpoint

Updated 2026-10-04. Local synthetic implementation, not completed S27 or production readiness.

## Contract

- Owner/supervisor identity, active state, organization and site are rechecked in each write transaction. Workers, auditors, inactive or forged staff and foreign crews cannot mutate the directory.
- `PATCH /api/people/crews/:id` accepts only `name` and `expectedName`; names use the existing bounded Unicode directory validation. A changed current name rejects stale edits. An exact repeated rename is a no-op with no duplicate audit event.
- `POST /api/people/crews/:id/archive` accepts only `expectedName` and `confirmed: true`. Stale names and missing/false confirmations fail. Replay of an already archived crew is a no-op.
- Archive is a retained inactive row, not deletion. Existing memberships, worker active state, grants/sessions, publications, assignments, accepted receipts and assessments remain unchanged. New membership admission into the archived crew is rejected; existing members can move out to another active crew or no crew.
- Archived names are read-only. The paged destination picker retains current membership or unsent choice even outside filtered results; it is not silently changed to no crew. Only active crews are returned as new destinations; Save rechecks membership admission. Cancel restores the current crew and returns focus to destination search. There is no restore control yet.
- Mutation and one `crew.renamed` or `crew.archived` audit event commit together. SQLite audit failure rolls back the write. PostgreSQL holds a crew update lock, while membership admission holds a share lock on that same scoped crew. Embedded tests check the SQL and transactions, not real concurrent wire-level behavior.

## Verification

SQLite and embedded PostgreSQL fixtures cover mixed Arabic/Latin names, duplicate names, unknown fields, scope/role denials, stale names, explicit confirmation, exact replay, audit failure rollback and unchanged evidence/access. PostgreSQL also simulates a lost successful COMMIT acknowledgement and verifies replay without a second event. Both HTTP contracts test 401/403/404/409/400 boundaries and rejection of new membership after archive.

Full suite: 137 tests, 135 pass, zero fail, two external PostgreSQL skips. Subsequent lost-commit focused checks: two pass. Final strict TypeScript/Vite build passes.

Default SQLite browser: existing Browser QA Crew rename form accepts an unsent mixed-direction name; Cancel returns focus and retains the original name. Archive confirmation enables only after checking the impact box; Escape closes and returns focus, reopening clears confirmation. Tab and Shift+Tab wrap at the dialog boundaries. At 320px document width is 305px, dialog client/scroll width 279/279; at 1440px document width is 1425px, dialog 558/558. Screenshots:

- `evidence/crew-archive-dialog-320-2026-10-04.jpg`
- `evidence/crew-rename-dialog-1440-2026-10-04.jpg`

No existing crew was renamed or archived in the persistent fixture. Six publication/assignment/attempt/receipt/case/audit hashes match the prior checkpoint; memberships and worker access were not changed. Viewport restored. Dev session 24277 replaces stopped 58820; web remains http://127.0.0.1:3020/.

## Remaining Gates

The reactivation follow-up supersedes missing-restore statements in this historical checkpoint: confirmed crew restore and worker reenable now use immutable replay receipts. See `DIRECTORY_REACTIVATION.md` for current checks and limits. Site/supervisor management, Arabic desktop parity and production gates remain open.

S27 Arabic desktop parity, site administration and crew supervisor management remain incomplete. Archive restore policy, full visual/a11y/native-language audit, real PostgreSQL lock/concurrency tests, production runtime and deployment remain open. No cloud, provider or real-worker operation occurred.

## Paging Follow-Up

Both repositories now use `GET /api/people/crews?search=&status=all&page=1&pageSize=5`. Only these fields are accepted; page is 1..5000 and pageSize 1..100. Search is bounded literal substring matching, status all/active/inactive. Complete scoped count and stable name/id pages include empty requested pages. SQLite counts/items share a read transaction; PostgreSQL uses one statement snapshot. No unbounded list or 500-crew rejection remains. Crew creation reads its own row directly, not a list page.

People uses independent five-crew list paging/search/status and five-crew active destination search/paging. Loading retains controls; `aria-disabled` plus guarded handlers preserve keyboard focus at busy/boundary states. Result changes do not submit membership or reset a selected destination. Mutation revalidates destination and the worker; no new UI restore action.

Full suite after repository/HTTP changes: 142 tests, 140 pass, zero fail, two external PostgreSQL skips. Added >500-crew fixtures, complete/empty pages, literal underscore/percent filters, member counts, active/archived selection, invalid/forged input and inactive staff denials. Final UI build passes. Browser memory-only 16-crew fixture verifies list/destination page changes, retained out-of-page current and unsent selections, Cancel focus, archived/empty filters and boundary keyboard focus. No membership write was submitted. At 320/1440 document widths are 305/1425; narrow picker/panel widths 233/267, no document overflow. Screenshots `evidence/crew-paging-1440-2026-10-04.jpg` and `evidence/crew-paging-archived-320-2026-10-04.jpg`.

Disposable rehearsal 98691 stopped, original profile-demo and viewport restored. All eight preserved fixture hashes match. Dev 88791 replaces stopped 96742. This is local synthetic verification, not production concurrency, native-language review or completed S27.

## Member Filtering Follow-Up

Worker directory accepts a bounded `crewId`: `all` (default), `none` (unassigned), or an existing current-site crew ID. Foreign/missing crews fail as unavailable, null/invalid/oversized references fail validation. Current memberships in archived crews remain filterable; search/language/active-state/page filters combine. Publication audiences and historical assignment language do not use this current-membership filter. SQLite count/page share a transaction; PostgreSQL uses a statement snapshot.

Clicking a crew's member link selects its active workers and resets worker search/language/page; Membership can select all or unassigned, and Access can include disabled members. Renames update the selected crew label without changing its ID. Browser verified saved Browser QA Crew: one active, one disabled, two all-status members; combined unassigned/Urdu/active filter returns nine workers, and incompatible language returns an honest empty state. No directory/membership/access write occurred. At 320px document/filter widths are 305/269, no document overflow; 1440 document width 1425. Screenshots `evidence/crew-members-1440-2026-10-04.jpg` and `evidence/crew-members-unassigned-320-2026-10-04.jpg`; filters and viewport restored.

Full suite: 144 tests, 142 pass, zero fail, two external PostgreSQL skips. Strict TypeScript/Vite build passes. Archived membership/status/language/search combinations, invalid/foreign IDs, scoped HTTP contracts and unchanged frozen evidence are tested in both databases. Eight persistent hashes still match. Dev 55632 replaces stopped 88791. No completed S27, external concurrency or production readiness claim.
