# Policy Request Fencing Checkpoint

2026-10-13. Retention/recording-notice boundary estimate: **85%**.
Whole staff request fencing: **85%**. Overall production estimate remains
**about 60%**, with a 55-65% uncertainty range. These are scoped engineering
estimates, not a test pass rate or production certification.

## Task Checklist

| To-do | Progress | Evidence / Remaining Work |
| --- | ---: | --- |
| [x] Captured, bounded staff requests for six retention policies and site notice | 100% | Actual mounted callers use shared authority; server requires matching cookie context |
| [x] Bind returned recovery scopes to the original actor/site and category | 100% | Foreign/malformed scopes rejected before storage lookup; read-only supervisor scopes corrected |
| [x] Exact immutable receipt and unchanged saved-intent cleanup | 100% | Audio now reads its receipt; all seven paths guard asynchronous completion and full intent before clearing |
| [x] Preserve earlier uncertainty after a later rejected retry | 100% | Shared recovery rule, focused tests and built browser journey for all seven policies |
| [x] Read receipt before discarding a first rejected save | 100% | Accepted receipt resolves success; only verified null permits first-rejection cleanup; unavailable or malformed evidence keeps recovery blocked |
| [x] Built browser category and reload checks | 100% | Seven categories; text reload; EN/AR/UR notice values and directions; audio recovery at 390px viewport |
| [x] Focused tests, full synthetic suite and strict build | 100% | Final focused 31/31; full 889 passed, zero failed, four native skips; build and 69 shell hashes pass |
| [x] Original database and preview preservation | 100% | Read-only eight fingerprints unchanged, integrity OK, zero FK violations; neither original preview restarted |
| [ ] Broader rendered authority-loss/held-check/keyboard/RTL matrix | 60% | Pure asynchronous fencing checks pass; all browser permutations and assistive-technology coverage remain |
| [ ] Native PostgreSQL concurrency/process-loss and private-storage acceptance | 50% | In-memory PGlite is local contract evidence, not native hosted PostgreSQL proof |
| [ ] Real devices and production release acceptance | 25% | Small viewport is not a real phone; no cloud rollout, provider call or release approval performed |

## Implementation

`usePolicySettings` replaces the duplicated load/save/recovery orchestration in
RetentionSettings, TextRetentionSettings and RecordingNoticeSettings. It uses
the existing captured-session transport and a shared guarded receipt completion.
Refresh and reload perform GETs only. Retrying an unchanged pending request
requires an explicit new confirmation. A stale view, held session check, corrupt
receipt or changed storage record cannot clear recovery or report save success.

All five PostgreSQL content categories retain the Disabled/null option and
separate policy scopes. SQLite does not gain unsupported content-policy routes.
Worker reads of the language-minimized recording notice remain cookie authorized
without a staff-only required header. No schema migration or retention cleanup
was run against the original database.

## Verification

- Initial full run: 893 tests, 888 passed, one failed, four skipped. The standalone
  runtime fixture omitted the newly required policy header. Its normal synthetic
  HTTP client was updated; assertions and domain security were not weakened.
- Final affected run: eight files, 31 passed, zero failed/skipped, exit 0,
  7876.8277 ms. Earlier broader run: ten files, 49 passed, exit 0.
- Final full run: 166 files, 893 tests, 889 passed, zero failed, four native skips,
  terminal exit 0, 240119.5337 ms. Native external database test URLs removed.
- Strict build: 2043 modules; 592.27 KB entry. Existing large-chunk and mixed
  static/dynamic offline-import warnings remain. 69 shell file hashes match.
- Built browser final fixture: 14 explicit POSTs, seven withheld acknowledgements,
  seven rejected retries, one accepted revision/receipt in each of seven policy
  ledgers, zero external requests. Text survived reload; notice field values and
  LTR/RTL direction matched all three entered synthetic strings. Small-screen
  notice fields stayed inside the viewport. Screenshots observed locally.
- The original socket-drop fixture allowed a browser transport retry on a category
  run, so it is not claimed as passing evidence. Final fixture withholds valid JSON
  acknowledgement after actual commit, preventing hidden transport resubmission.
  Actual socket-loss/native transport permutations remain an acceptance gap.
- Cua inventory and the existing tab worked; creating a separate hidden tab timed
  out. The existing tab was used temporarily. No Reticle verdict is claimed and
  no diagnostics were uploaded. Both owned fixtures and all commands are terminal.

Gemini Free remains synthetic-only. No real worker content, external provider,
mail, cloud provisioning or rollout was used. `productionReady` remains false.

Next implementation: remaining site/settings, reporting/export, glossary/template
and application-owned request helpers; then complete the wider rendered and
native acceptance gates recorded in PROGRESS_BOARD.md.
