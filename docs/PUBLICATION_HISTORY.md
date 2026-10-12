# Publication history

S13/S18 now use bounded scoped history rather than an eagerly loaded private
snapshot catalog. This closes a confirmed application gap, not production readiness.

## Contract

- Briefing detail returns the latest publication only. Existing current-version
  metrics, withdrawal, artifact URLs and draft/edit/recovery contracts remain.
- `GET /api/briefings/:briefingId/publications` returns metadata-only pages of
  up to 20 versions, complete counts, descending version order, and an optional
  exact numeric `version` filter. No question, rubric, snapshot or audio fields.
- `GET /api/briefings/:briefingId/publications/:publicationId` returns only that
  exact scoped immutable snapshot, metrics, withdrawal and authorized audio map.
  No fallback to the draft/latest publication when the selected read fails.
- Both SQLite and PostgreSQL reauthorize actual staff role/site/organization and
  supplied current session. Workers, administrators, forged roles, inactive staff,
  foreign sites/briefings/publications and expired/revoked sessions cannot read.
  PostgreSQL also applies its existing tenant gate and repeatable-read contract.
- Unknown/duplicate query keys and malformed/unbounded identities/numbers reject.
  HTTP uses no-store and the existing exact client-session context fence.
- Expired publication content remains redacted; the exact reader does not restore
  old facts or audio. Existing immutable snapshot/outcome evidence is unchanged.

Correction to the earlier checkpoint: PostgreSQL detail was capped at 100;
SQLite detail actually loaded every publication without a limit. Both now return
one current publication and share the paged/exact-read contract.

## Interface

Overview timeline, the new History view, Languages and Responses share version
selection. Catalog paging and version-number filtering do not silently change it.
An off-page selection remains an option; the exact publication still drives
text, question, terminology dependency, audio and response reads. Returning to
the draft Languages workflow explicitly selects the draft.

Catalog/detail reads are bounded, abortable, no-store, timeout-limited and keyed
to request/context/refresh. Changed reads cannot render prior keyed results.
Detail failure removes artifact text, rubric, audio and copy controls. Coverage
is not labeled Missing when it has not been loaded. Catalog failure removes
catalog rows; independently successful exact detail is separate evidence, not a
catalog fallback. Recheck/refresh and explicit selection remain available.

Owner/supervisor optional draft editing and regeneration retain their locks.
Published selections have no draft mutation controls. Existing confirmed
withdrawal is retained for an actually published version. Auditor browser views
have no rubric, audio or mutation controls. This is not a broader new auditor
server DTO policy claim.

## Executed evidence, 2026-10-12

- Initial new suite: three passes, two localhost EACCES failures. Authorized
  disposable rerun revealed a real PostgreSQL error-mapping omission (503 for
  malformed history input); corrected to 400 without weakening assertions.
- Final new-history/artifact-helper suite: 12 passed, zero failed/skipped.
- Existing historical audience/outcome regression: one passed. It now reads
  the older exact snapshot and verifies both independent metrics rather than
  requiring briefing detail to return the complete history.
- Full synthetic suite: 158 files, 844 tests, 840 passed, zero failed, four native
  database prerequisite skips; terminal exit 0, 236.080 seconds. External native
  database test URLs were removed from the child environment. This run began
  before final compact-label/unavailable-coverage UI adjustments and the added
  expiry-reader assertions.
- Final four-file affected regression after those adjustments: 22 passed,
  zero failed/skipped, 13.868 seconds, terminal exit 0. Includes physical expiry
  and archived exact-reader/catalog checks; it is not a new full-suite run.
- Final strict build: 2034 modules, terminal exit 0. Existing entry-size and
  mixed worker-offline import warnings remain. All 69 public shell hashes match.
- Eight original SQLite business-table hashes/counts match the prior checkpoint;
  read-only integrity check is ok and foreign-key violations are zero. No original
  preview restart or database migration occurred.
- First built memory fixture created 125 publications through actual synthetic
  publish commands before accounting browser reads. Seven catalog pages, stable
  v125 then v1 selection, number filtering without implicit selection, historical
  response recipients, exact v1 Arabic audio URL and real native tone playback
  (readyState 4, three-second duration, no media error) were checked.
- 320/390/768/1440 CSS-pixel widths have no page overflow. Native table-region
  horizontal scrolling remains intentional. Desktop page-seven detail and mobile
  historical view screenshots were inspected, not a full reference comparison.
- Forced detail failure exposed misleading Missing labels; final build fixes it.
  Final browser has zero audio/copy/coverage controls on failed detail and truthful
  unavailable/Not loaded evidence. Forced catalog failure has zero catalog rows.
- Final auditor v1 number lookup, language navigation, Urdu selection and 320px
  framing show immutable text, no rubric/audio/mutation controls. Compact native
  version labels fit the mobile selector.
- Fixtures stopped gracefully: first 22 catalog/9 exact reads, second 9 catalog/9
  exact reads; both zero HTTP POSTs, unchanged briefing/publication fingerprints
  and zero external calls. Temporary tab closed and viewport reset. Clipboard was
  not used in this checkpoint. Reticle disclosure was not retried; no verdict.

Screenshots in `artifacts/`:

- `publication-history-1440-2026-10-12.jpg`: oldest selected publication/page seven.
- `publication-history-320-2026-10-12.jpg`: first-build responsive history view.
- `publication-history-failed-detail-final-2026-10-12.jpg`: final repaired failure.
- `publication-history-auditor-ur-320-2026-10-12.jpg`: final historical language view.

## Remaining gates

Offset pagination uses a fresh consistent observation per request, not a frozen
multi-page export. Concurrent inserts can shift later pages; direct version lookup
and refresh remain explicit. Native concurrency/large-workload performance, full
reference/keyboard/accessibility acceptance, device/live speech and independent
language quality remain open. Original preview processes still run their older
loaded server modules; these new endpoints were verified on disposable fresh
servers, not promoted into those protected processes.

Full recovery/cutoff/activation, CI/release, hosted Neon Free/private storage,
privacy-approved real-data AI and authorized real-worker rollout remain unfinished.
The approximately 60% full-production estimate is not a readiness promotion.
