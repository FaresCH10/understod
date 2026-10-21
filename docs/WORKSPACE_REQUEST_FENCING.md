# Workspace And Site Request Checkpoint

2026-10-13. Workspace/site boundary estimate: **85%**. Whole staff request
fencing: **90%**. Overall production estimate remains **about 60%** (55-65%
uncertainty). Percentages are scoped implementation and acceptance estimates,
not certification that the complete feature or release is ready.

## Task Checklist

| To-do | Progress | Evidence / Remaining Work |
| --- | ---: | --- |
| [x] Organization/site metadata and contact requests capture the original session | 100% | Bounded transport, abortable reads, original org/site validation and guarded parent callbacks |
| [x] Organization/site saves expose actor-scoped immutable receipts | 100% | Both backends; wrong actor/kind cannot read or replay another save; no schema migration needed |
| [x] Exact saved-intent recovery across reload and rejected retries | 100% | Both actual forms use guarded policy recovery; canonical fields and full stored intent checked before cleanup |
| [x] Receipt-route integration | 100% | Browser found incorrect default requests path; custom receipts route fixed and a regression added |
| [x] Site catalog, creation, dependencies and access/lifecycle requests are fenced | 100% | Actual mounted callers use authority; private JSON reads require matching cookie context |
| [x] Site creation, access and lifecycle receipt completion preserves uncertainty | 100% | Generation guards, selected-target checks, confirmed storage removal; later rejection cannot enable unsafe discard |
| [x] Other-site archive/restore and worker-access pause acceptance | 100% | Built UI lost-acknowledgement/receipt-outage checks; pause recovered across reload; restore keeps worker access paused |
| [x] Signed-in-site archive/restore acceptance | 100% | Linked account switched to the empty site; archive disabled edit/create controls, restore re-enabled staff editing without resuming worker access |
| [x] Settings retry uses refreshed revision and current contact/default metadata | 100% | Loaded baseline drives edits; no fabricated contact availability; stale success cleared when a new edit starts |
| [x] Local tests and strict build | 100% | 42 focused passes; 167-file full suite: 894 passes, zero failures, four native skips |
| [x] Narrow-screen table readability | 100% | 700px internal scrolling table and nowrap status labels; 390px page remains contained; fields and one keyboard Tab checked |
| [x] Original evidence and process preservation | 100% | Eight readonly fingerprints unchanged, integrity OK, no FK violations; originals not migrated/restarted, all owned commands terminal |
| [ ] Complete rendered role-loss/held-check/cross-tab/unsent-edit matrix | 65% | Pure/HTTP fencing and listed built journeys pass; remaining permutations and Strict Mode rendered acceptance open |
| [ ] Native PostgreSQL restricted roles, TLS, concurrency and process-loss acceptance | 50% | SQLite/PGlite proof is not a native hosted deployment verdict |
| [ ] Full keyboard, RTL, assistive technology and actual-device acceptance | 45% | Listed narrow-screen smoke checks do not certify all references or devices |

## Implementation

Existing settings_requests records now have a private receipt GET route at
`/api/settings/{organization|site}/receipts/{requestId}`. Organization saves
require owner authority, site saves owner/administrator authority. Receipts are
restricted to the original organization, site, actor and settings kind. Replays
also check the original actor. No original database/schema was changed.

The actual settings forms reuse the existing bounded captured-session transport
and exact-receipt policy orchestration. Shared recovery now supports a separate
metadata endpoint and receipt endpoint, while retention continues using its
existing requests route. Read-only forms do not inspect another writer's pending
ledger. Saved fields remain frozen until exact receipt evidence or an explicit,
unchanged retry; refresh and reload never repeat POSTs automatically.

Site creation and access/lifecycle retain their existing ledgers and API shapes.
Current session, mount generation and selected target guard completion. The
stored original request must still match before removal, and removal is verified.
Unknown earlier outcomes survive later known rejection. Only a first known
rejection with a verified missing receipt enables explicit dismissal.

## Verification

- Final focused run: six files, 42 passed, zero failed/skipped, terminal exit 0,
  9416.1013 ms. Earlier four-file 25-pass run preceded browser integration fixes.
- Full synthetic run: 167 files, 898 tests, 894 passed, zero failed, four native
  skips, terminal exit 0, 259101.095 ms. This follows all functional changes;
  the final two-line responsive CSS fix was subsequently rebuilt and checked
  in the built browser. Native external database URLs were removed.
- Final strict build: 2044 modules, 632.92 KB entry; 55 shell hashes match.
  Large entry and mixed static/dynamic offline imports remain optimization work.
- The first browser run found a receipt-route integration bug and was not a pass.
  It preserved the pending request. The route was corrected, then organization
  and site recovery were replayed against the rebuilt fixture.
- Final functional fixture: organization/site each had two explicit POSTs, one
  withheld acknowledgement, one later synthetic rejection and one accepted
  receipt. Site creation: one POST, one new receipt (two total including the
  preseeded empty site). Worker access: one POST/receipt. Lifecycle: four explicit
  POSTs/receipts, including archive/restore before and after switching to that site.
  No automatic repeated mutations or external requests occurred.
- Organization pending intent survived reload; site timezone/languages and a
  scoped primary contact were recovered. Signed-in-site archive showed the archived
  notice with edit/create disabled; restore made editing available and kept worker
  access paused. Screenshots observed locally after the catalog settled.
- 390px viewport: controls stayed within the page, keyboard Tab reached timezone;
  the final CSS build produced a 700px internally scrolling table, single-line
  status labels and no page-wide overflow. The viewport was reset.
- Final CSS smoke fixture made zero UI mutation POSTs, then stopped. All four
  owned fixtures and the full-suite command are terminal; temporary tab closed.
- Approval review temporarily failed on account usage before the build executed.
  It was retried only after the reported reset time had passed, with the same
  approval path, and succeeded. No approval bypass or external diagnostic upload.

Original database: organizations 2, sites 2, workers 34, briefings 2,
publications 1, assignments 30, attempts 26, clarifications 4. All eight
fingerprints match the protected baseline; integrity OK, zero FK violations.

No provider, mail, cloud provisioning or real-worker data was used. Gemini Free
remains synthetic-only; productionReady is false. Next: remaining report/export,
notification, glossary/template, onboarding/usage and application-owned helpers,
then complete native, language, accessibility, device and deployment acceptance.
