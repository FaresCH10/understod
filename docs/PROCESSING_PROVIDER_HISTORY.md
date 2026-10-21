# Processing Provider History

Local checkpoint: 2026-10-14 16:09 UTC. Full production goal remains active.
Overall about67% (60-73% uncertainty); this task's acceptance about85%.

## Contract

GET `/api/processing/:typedJobId/provenance?page=1&pageSize=10` requires captured
staff session context, scoped active owner/supervisor/auditor authority and an
existing exact site job. Unknown/duplicate scope filters are rejected. Pages
are bounded to20 operations and64 receipts per reservation. PostgreSQL reads
use a repeatable snapshot; reads create no business/journal/schema entries.
SQLite has no provider journal and reports unsupported, not fabricated success.

Public DTOs expose operation/run IDs, safe model and adapter/prompt/schema
versions, synthetic data class, request allowance and recorded receipt states,
HTTP status/time, preparation stage and recorded result-reference type. Private
hashes, lease/claim tokens, provider credentials, request/result bodies, full
contexts, transcript/rubric and object references are excluded. Stable run IDs
are operation IDs grouped by the existing scoped claim; paging does not expose
the claim itself. Missing legacy input provenance remains unknown.

Accepted HTTP response is not validated output, completed assessment, evidence
of understanding or safe work. A generated-bundle reference may precede
attachment; the view says only that a reference was recorded. Current claim
requires actual processing status and an unexpired matching lease. No retry,
provider dispatch, outcome editing or new permission is offered by this view.

## Evidence

- Focused tests:27 pass/zero fail,35713.1055ms. Actual scripted source, voice,
  typed and preparation processors supply journal/result-link integration
  assertions. Projection/client/HTTP tests cover scope, exact publication,
  cross-site/tenant isolation, context, bounded pages, malformed metadata,
  unknown provenance and honest SQLite absence.
- Full `artifacts/provider-history-suite-2026-10-14.log`:996 tests,992 pass,
  zero fail,four native skips,358508.2645ms;90327 terminal exit0.
- Strict build2067 modules/669.55KB entry passes; existing chunk/mixed-import
  warnings remain. Diff whitespace check passes.
- Built page1/page2, keyboard paging and native table focus, refresh503/recovery,
  reservation without receipt, accepted/rejected/unfinished/unknown receipts,
  current/historical claims and auditor read-only view verified. At320px,
  document305px and internally scrollable tables233px/670px prevent page overflow.
  Frozen pending response remains unchanged alongside provider metadata.
- First fixture55568 terminal:85 reads,13 synthetic failed reads,zero mutation
  requests. Final72273 terminal:7 reads,zero mutation requests. Both ten protected
  table inventories unchanged andzero external calls. Fixture metadata is
  constructed, not evidence of Google quality or live requests. Initial encoded
  hash shortcut corrected only in fixture; normal application queue worked.
- Screens: `provider-history-desktop-2026-10-14.png`,
  `provider-history-320-2026-10-14.png`,
  `provider-history-outage-2026-10-14.png`,
  `provider-history-auditor-2026-10-14.png` under artifacts. Final desktop shot
  shows an accepted HTTP receipt with no result reference, plus keyboard focus.
  Temporary tabs closed and viewport reset; all owned fixture/test/build sessions
  terminal. Original3020/3021 previews were not restarted or migrated.
- Original eight readonly fingerprints/counts unchanged,integrityOK/FK0;55 shell
  hashes match.1454 source/evidence/public files scanned:zero current-key matches,
  exampleblank. No actual worker/provider/diagnostic/cloud transmission.

## Remaining Acceptance

Native PostgreSQL restricted-role/concurrent reads/lease transitions; actual
historical upgrade readback beyond pure unknown-provenance projection; wider
staff expiry/cross-tab/site-change/held reads; full EN/AR/UR/reference/a11y/device
acceptance. Frequent active-job polling briefly shows history loading; remaining
read-key continuity must not retain earlier page or authority data. Reticle has
no connected-app verdict. Live voice/Urdu/independent quality and privacy-approved
real-data AI remain open. Nothing here authorizes public or paid deployment.
