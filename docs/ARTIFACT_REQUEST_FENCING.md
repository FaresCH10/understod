# Template and Glossary Request Checkpoint

Date: 2026-10-13. Boundary progress: **85%**. Whole staff request fencing:
**92%**. Overall production estimate remains **about 60%** (55-65% uncertainty).
These estimates include remaining acceptance work; they are not test pass rates.

## Per-Task Checklist

| To-do | Progress | Completed evidence | Still required |
| --- | ---: | --- | --- |
| [ ] Template creation recovery | 85% | Captured request, exact receipt, reload and receipt outage | Wider authority/device/native acceptance |
| [ ] Template editing recovery | 85% | Frozen intent, rejected retry retained, reload resolves v2 | Wider authority/device/native acceptance |
| [ ] Template archive recovery | 85% | Interrupted acceptance resolves v3 archived | Wider authority/device/native acceptance |
| [ ] Template restore recovery | 85% | Interrupted acceptance resolves v4 active | Wider authority/device/native acceptance |
| [ ] Template duplication recovery | 85% | Exact receipt opens one new v1 copy | Wider authority/device/native acceptance |
| [ ] Template use-as-draft recovery | 85% | One fresh unpublished processing draft, no inherited readiness | Wider authority/device/native acceptance |
| [ ] Glossary creation recovery | 85% | Exact scoped receipt survives reload and outage | Wider authority/device/native acceptance |
| [ ] Glossary editing recovery | 85% | Arabic override preserved after rejected retry and reload | Wider authority/device/native acceptance |
| [ ] Glossary removal recovery | 85% | Interrupted acceptance resolves removed v3 | Wider authority/device/native acceptance |
| [ ] Glossary restoration recovery | 85% | Interrupted acceptance resolves active v4 | Wider authority/device/native acceptance |
| [ ] Glossary regeneration recovery | 85% | Synthetic provenance, exact v5 receipt, drafts invalidated | Wider authority/device/native/live acceptance |
| [ ] Reports/export request continuation | 10% | Existing client request/poll/retry boundaries inspected | Implement captured reads and durable exact export recovery |

## Implemented

- Actual mounted screens use the bounded captured staff transport. Reads abort on
  cleanup; mutations and completion remain fenced by original identity and guard.
  The root keys include the full staff binding, not just site or session context.
- Both backends require captured context on artifact JSON reads, receipts and all
  eleven mutations. Cookie, origin, role, site and domain guards still apply.
  Native private byte routes are not changed.
- Both immutable receipt ledgers are original-actor scoped. Another authorized
  colleague cannot read a receipt or replay its request ID. No schema migration.
- Acknowledgements must match canonical identity, revision, status/state and
  counts; an exact immutable receipt must agree before saved intent is cleared.
  Changed storage or held/stale authority cannot clear the original request.
- Recovery is read-only until the user explicitly retries a verified missing
  original request. Earlier uncertainty survives a later known rejection. A
  first known rejection requires a missing-receipt lookup before discarding.
- Read-only staff can inspect templates but cannot enter either creation form,
  including manual routes. The denied template route has a usable back button.
- Published versions remain immutable. Glossary changes invalidate current
  drafts, not publications. Template use starts fresh preparation rather than
  inheriting readiness, assignments, audio or responses.

## Verification

- Full synthetic suite: 168 files, 912 tests, 908 passes, zero failures, four
  native prerequisite skips, terminal exit 0, 339208.9189 ms. Log:
  `artifacts/artifact-controls-suite-2026-10-13.log`.
- Final seven-file regression: 34 passes, zero failures/skips, terminal exit 0,
  8334.7155 ms. Full-suite execution preceded the final one-line denied-route
  back-button fix; this regression, strict build and final browser smoke followed.
- Strict build passes: 2048 modules, 634.53 KB entry, all 55 public-shell hashes
  match. Existing chunk-size and mixed offline-import warnings remain.
- Built browser: all eleven first mutation acknowledgements withheld after
  commit; all eleven first receipt lookups fail. Both edit journeys also receive
  a false missing result and a rejected explicit retry, then recover the original
  committed version on reload. No automatic mutation replay occurred.
- Main fixture: 14 explicit POSTs, 11 accepted UI receipts, two injected later
  edit rejections and one real duplicate-term rejection. Template receipt count
  is seven including one seed; glossary receipt count is five. Publications
  unchanged. The fresh draft remained processing with no prepared content; its
  revision advanced to six through the five subsequent glossary invalidations.
- Glossary historical v1 preserves its empty override and removes current-edit
  controls. Arabic text remains RTL. At 390px and 320px the page widths were
  375px and 305px; narrow form controls stayed inside the page. This is a local
  responsive smoke, not full accessibility, localization or real-phone acceptance.
- Final auditor smoke denies both creation routes and exposes no detail mutation
  controls. The final back-button smoke returns to the readable list. Disposable
  secondary fixtures recorded zero mutation POSTs and unchanged publications.
- All owned fixtures and command sessions stopped. Temporary tabs closed and
  viewport reset. Browser blocked the optional QA-close navigation; no alternate
  navigation bypass was attempted. Memory-only servers were stopped gracefully.
- Eight protected original SQLite fingerprints match; integrity OK, no foreign
  key violations. Original previews 3020/3021 were not restarted or migrated.
- No external diagnostics, mail, provider or cloud calls. No Reticle verdict,
  native PostgreSQL, actual device, live-model or deployment pass is claimed.

## Next

Finish reports/export, notifications, onboarding/usage and application-owned
request helpers. Then complete wider authority-loss, all-reference, EN/AR/UR,
accessibility/device, native database and authorized live/deployment acceptance.
Gemini Free remains synthetic-only; real worker content must not be sent there.
