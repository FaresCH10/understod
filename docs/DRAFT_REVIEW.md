# Draft review and regeneration

Latest 2026-10-06 extension: the same revision/receipt transaction accepts bounded
optional Arabic/Urdu translations. Target editing preserves source/other-target
overrides; source-review editing preserves target overrides. Automatic generated
preparation checks edited text against source/glossary before exact-text audio, while
the canonical demo rejects unsupported edits. Lost acknowledgements recover via the
existing exact receipt. UTF-8 HTTP/recovery bounds are 100 KB for reviews only; other
JSON routes keep 16 KiB. Full suite 314/311 pass/three external skips, strict build
passes. See `TRANSLATION_EDITS.md`; earlier checkpoints below are historical.

Local synthetic checkpoint, 2026-10-05. S10 remains partial.

## Contract

Active scoped owners/supervisors may confirm optional question, key-fact and private asked-fact overrides through `POST /api/briefings/:id/review`. Blank inputs request automatic preparation. Strict UUID, revision, field/array bounds and distinct entries are validated in both repositories. Workers never receive the private rubric.

A save increments the draft revision, clears preparation, cancels obsolete jobs and queues preparation atomically with an immutable scoped request receipt and audit. Exact replay returns the originally accepted revision, including after a lost commit acknowledgement or later draft edits. Conflicting IDs and stale revisions are rejected. Published snapshots, audiences and responses are unchanged. Source/title edits reset optional review inputs; historical receipts remain.

The UI resets consent after edits, rejects duplicate facts, blocks competing draft edits and locks uncertain requests for explicit unchanged retry. Confirmed requests are saved in tab-local session storage before sending, scoped by organization/site/staff identity (the same session recovery identity used by templates). Pending body, original request ID and source revision survive reload/navigation. Unsubmitted edits are not saved. It does not publish automatically.

Private `GET /api/briefing-review/receipts/:requestId` rechecks active owner/supervisor authority and returns only the scoped immutable original receipt, with no-store. Recovery checks request content, briefing identity and accepted revision, then clears the local pending record and opens/refetches the destination without a POST. No receipt permits an explicit original-ID retry, never automatic resend. All briefing detail mutation controls are absent while recovery is unresolved, including when another briefing is opened. Storage failures prevent sending; malformed receipts or acknowledgements cannot clear pending evidence. A definite rejected form save clears its pending record. The local record contains private review inputs; session storage is not encrypted and is not a closed-tab/cross-device recovery service.

## Deliberate limits

The deterministic processor supports only the canonical shelf example. Default or exactly compatible overrides can become ready; other overrides are retained but preparation fails honestly and publication remains unavailable. This is not general AI grounding, alignment, translation or speech generation. Real worker data remains off Gemini free tier. No live provider call or human approval-as-understanding claim was added.

## Verification

- Latest full suite: 183 tests, 181 pass, zero fail, two external PostgreSQL skips (63.225 seconds). Strict TypeScript/Vite build passes: 1914 modules, JS 447.15 kB / 123.10 kB gzip.
- SQLite/embedded PostgreSQL tests cover scoped authority, validation, stale revisions, immutable replay, audit rollback, lost commit acknowledgement, automatic repair, unsupported preparation, source-reset behavior and old-worker completion fencing.
- Migration 016 and synthetic backup import preserve current review and immutable request receipts. The current seventeen-migration ledger executes in embedded PostgreSQL; real PostgreSQL wire/TLS/contention remains unverified.
- Disposable memory-only browser fixture: interrupted accepted save retried to revision 2 once; unsupported question failed revision 3; clearing overrides repaired revision 4. Consent reset, editing guards, 13-fact rejection, Cancel focus, reload and 320/1440 widths checked. No publication/withdrawal/submission was made.
- Screenshots: `evidence/draft-review-recovered-1440-2026-10-05.jpg`, `draft-review-320-2026-10-05.jpg`, `draft-review-repaired-320-2026-10-05.jpg` and `draft-review-repaired-1440-2026-10-05.jpg`.
- Saved publication/assignment/attempt/receipt/case/crew/membership/audit hashes match the prior baseline. Saved review/request ledgers are empty, shelf draft remains ready revision 1, and v3 remains 30/25/22/3/5. Fixture 24945 stopped; default dev 58346 restored.

Reload recovery fixture 56366 (memory-only) checked accepted review acknowledgement loss: reload opened revision 2 with one receipt and GET only. Duplicate-fact form rejection passed. The next review was interrupted before acceptance, survived phone reload, blocked detail controls and persisted through a separate new briefing destination. Explicit original-ID retry returned to the original shelf briefing at revision 3, two receipts total, and subsequent reload cleared recovery with destination heading focus. No publication, withdrawal or answer was submitted. Pending-320 and reload-recovered-1440 screenshots inspected; result-320 saved. Pending width 320/320 and resolved phone width 305/305 have no document overflow. Fixture 56366 and prior dev 91422 stopped; default dev 5142 restored. All eight original evidence hashes match, new ledgers empty.

Closed-tab/cross-device recovery, full reference, native-language, screen-reader, physical audio, cloud/runtime cutover and production gates remain open. Reticle is not connected; no Reticle verdict is claimed.
