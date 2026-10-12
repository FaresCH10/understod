# Briefing templates

Local synthetic checkpoint, 2026-10-05. S32 remains partial pending general live preparation, closed-tab recovery and reference verification.

## Behavior

Active scoped owners/supervisors create, edit, archive, restore, duplicate and use templates. Auditors can read scoped templates/history, workers cannot. Bounded title search, status filtering and paging operate on the server. Template versions and mutation receipts are immutable; edits and lifecycle changes each create a version. Historical versions are read-only. Mutations require explicit confirmation and the current revision.

Exact request replay returns the original accepted result, not a later version. Audit and all effects commit atomically. PostgreSQL serializes matching requests and current-template changes; actual external-server contention remains unverified. Both repositories recheck active staff authority, including replay.

Use-as-new-draft copies source and optional structured question/key/asked-fact defaults into an independent revision-1, unpublished briefing. It queues fresh preparation with no prepared artifacts, audience, assignments, responses or inherited readiness. Later template edits cannot alter the briefing's copied defaults or published evidence. The deterministic shelf processor supports only canonical-compatible inputs; other defaults are stored but preparation fails honestly. Real worker data remains off Gemini free tier.

Creation/edit form bounds: title 3-120 characters, description 500, source 10-4000, question 500, at most 12 key/6 asked facts of 500 characters, distinct after trimming. Canonical mutation payload has a 14 KiB bound inside the HTTP 16 KiB limit. Blank defaults request automatic preparation. No seeded production templates, per-language templates, tags, shared cross-site catalog or AI-generated template claims were added.

## Checks and limits

- Full suite: 182 tests, 180 pass, zero fail, two external PostgreSQL skips (46.925 seconds). Strict TypeScript/Vite build passes: 1913 modules, JS 441.75 kB / 122.17 kB gzip.
- SQLite and embedded PostgreSQL cover input/scope/role denial, 22-template paging, 26-version history paging, immutability, audit rollback, lost PostgreSQL commit acknowledgement, exact post-edit/post-restore replay, unsupported/default preparation and private scoped HTTP. Synthetic backup import preserves template versions and use receipts. Migration 017 brings the embedded ledger to seventeen.
- Memory-only browser fixture 21176: 25-template/page-two filter reset; edit consent reset; interrupted accepted edit retried to v2 once; original v1 read-only; archive v3/reload/filter; restore v4; duplicate independent v1; fresh unpublished briefing prepared without inherited audience; create/reload and duplicate-fact denial. Mobile Cancel returns heading focus without a write. Document widths 305/1425 at 320/1440; labels fit.
- Screenshots: `evidence/templates-history-1440-2026-10-05.jpg`, `templates-use-320-2026-10-05.jpg`, `templates-fresh-draft-1440-2026-10-05.jpg`, `templates-created-320-2026-10-05.jpg`. History/use/created captures inspected. No publication, withdrawal or worker answer submitted.
- Fixture 21176 and prior default 58346 stopped; default dev 14756 restored. Original publication/assignment/attempt/receipt/case/crew/membership/audit hashes match. Saved template/version/request, review, settings and billing tables are empty. Shelf draft remains ready revision 1; v3 remains 30/25/22/3/5.

## Reload Recovery

Before a confirmed mutation is sent, its exact request ID, kind, target and body are validated and retained in tab-local `sessionStorage`, scoped by organization/site/staff identity. Failed storage validation/readback prevents sending. Another pending request cannot be overwritten. Uncertain responses lock edits; definite rejection clears the local pending record. On returning to Templates after reload/navigation, recovery blocks new template forms until the pending request is resolved.

Private `GET /api/templates/receipts/:requestId` rechecks current owner/supervisor authority, reads only the scoped immutable receipt and sends `no-store`. An accepted matching receipt clears the local record and opens its destination without a POST; comparison is independent of JSONB key order. No receipt means an explicit original-ID retry, never automatic resend. Malformed/mismatching records remain unresolved instead of being silently discarded. Source/default content is retained locally in this tab until resolution; this is not an encrypted offline store.

Memory fixture 37595 checked accepted edit acknowledgement loss followed by reload: v2 once, only receipt/detail GETs, v1 retained. Unaccepted use survived reload and navigation, read-only rechecks caused no writes, and explicit retry created one fresh unpublished briefing. Subsequent reload/return exposed the normal template list, not recovery. Counters: 25 templates, 26 versions; 26 receipts after edit and 27 after use. Widths 320/1440 equal scroll widths. Captures `templates-recovery-pending-320-2026-10-05.jpg` and `templates-reload-recovered-1440-2026-10-05.jpg` inspected; fresh-draft phone capture saved. Fixture 37595 and dev 14756 stopped; default dev 91422 restored. All saved evidence hashes still match, template ledgers remain empty.

Unsubmitted form edits, closed-tab/cross-device recovery, external PostgreSQL contention, real providers, physical audio, native-language, full visual/screen-reader and Reticle verification remain open. Production remains unavailable.
