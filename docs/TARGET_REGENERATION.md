# Targeted Draft Regeneration

Backend and client checkpoint, 2026-10-06. This implements the scoped generation/reuse path
for S11/S18 and specification sections 10-11. It is not complete screen coverage or a
production integration. Default SQLite and saved local evidence remain unchanged.

## Request and Recovery

The isolated synthetic PostgreSQL API accepts an owner/supervisor-confirmed
`POST /api/briefings/:id/regenerate` with `requestId`, `revision`, `language`,
`kind` (`translation` or `audio`) and `confirmed: true`. Translation regeneration
is Arabic/Urdu only; audio supports English/Arabic/Urdu already in the baseline.
Client-supplied manifests, bytes, storage identities, provider configuration,
private review fields and arbitrary selection values are refused.

Migration 024 adds immutable, scoped request evidence with composite references to
the exact previous attached bundle, its briefing/revision and the new preparation
job. Request, original review, requester role/session and accepted revision are
recorded atomically with revision advancement, old-job invalidation, preparation
queueing and audit. Audit failure rolls back all changes. An exact request replay
returns its accepted revision without new work, even after preparation completes.
Changed same-ID payloads conflict. Lost acknowledgements can be reconciled by
`GET /api/briefing-regeneration/receipts/:requestId`; this private response contains
only briefing, accepted revision and normalized selection, not baseline/rubric.

The baseline must be a dependency-matching attached generated bundle. Publishing
opens the next draft with the same source revision and retained prepared snapshot;
that baseline can be regenerated without claiming the opened draft is ready.
Private current-draft playback continues to require ready state. Published snapshots,
audio, assignments and accepted answers are not rewritten.

## Selective Generation

The worker loads only the journal-bound baseline, reads actual private WAV bytes
outside database row-lock transactions and validates the whole bundle before any
provider operation. It requires exact source, preceding revision, glossary/hash,
enabled language set, provider/model/voice/prompt/schema configuration and review
compatibility. A changed dependency, missing/corrupt object or absent adapter fails
closed, not as a full-generation fallback. Existing current-claim checks run during
reads, before/after provider calls and during staging/attachment. Targeted jobs also
recheck the original active requester role and credential session when supplied.

- Translation regeneration removes only that target's optional override, translates
  its title/instruction/question and checks source faithfulness, completeness,
  language and terminology before generating its exact body/question audio.
- Audio regeneration preserves all text and performs no preparation, grounding,
  translation or translation-check calls. Only that language's body/question speech
  is generated from the frozen checked target text.
- Other languages retain exact text, successful checks and verified audio bytes.
  Their provider calls are not repeated. To fit the immutable one-bundle-per-audio
  identity contract, reused bytes are copied under fresh UUIDs in the new bundle.
  This avoids model regeneration; it does not deduplicate stored object bytes.
- Source question/facts/private asked-fact rubric remain unchanged. Same-language,
  exact-text deduplication within the new bundle still applies. Failed current jobs
  retry through the ordinary queue with the same immutable regeneration intent.

## Evidence and Limits

The Languages view exposes owner/supervisor commands only for a server-verified
current or retained generated baseline. English has audio regeneration only;
Arabic/Urdu have translation and audio commands. Publication selection and auditors
have no regeneration affordance. The scoped DTO exposes only eligible language
codes and the current targeted job's ID/status/selection, not internal baseline or
requester evidence. During confirmation, competing review edits, detail tabs,
copy/archive and version/language selection are disabled. Explicit confirmation,
Cancel/Escape and restored command focus are supported. Failed target jobs link to
the existing preparation retry view; retry keeps the immutable original intent.

Before POST, the client persists the exact confirmed selection, source revision and
request ID in principal/site-scoped sessionStorage. Failed storage prevents sends.
An uncertain response locks cancellation and selection; read-only receipt checks
or explicit unchanged-ID retry reconcile it. Reload/navigation checks the saved
receipt first, verifies briefing/revision/selection, and never automatically repeats
the POST. Malformed storage or mismatched receipts fail closed. Recovery is tab-local,
not a promise of persistence after closing the tab. The lazy view has a truthful
load-failure boundary and reload action.

`tests/prepared-bundle.test.mjs` covers selected provider call counts, exact retained
bytes/text, source/rubric preservation, override reset, baseline immutability,
dependency changes, corruption, invalid selection and authority checks. The generated
audio suite exercises actual embedded PostgreSQL transactions, private WAV reads,
publication preservation, exact receipts, failed-job retry, lost commit acknowledgement,
audit rollback, requester/session revocation, stale reads, composite foreign-scope
denial and credential/origin/query/forged-body HTTP restrictions. Migration checksum,
empty-target import and startup verification are exercised by the broader suite.

The full test totals and terminal sessions are in `BUILD_STATUS.md`. Fixture tones
prove byte integrity and selective operation counts, not spoken-language accuracy.
`tests/regeneration-recovery.test.mjs` covers bounded scope isolation, immutable
pending IDs, failed storage, forged selection and exact receipt validation. The
generated-audio tests also assert eligible/current/retained baseline DTOs and queued,
ready and failed target metadata. Full regression: 325 tests, 322 pass, zero fail,
three external PostgreSQL skips. Strict TypeScript/Vite build passes.

Disposable in-memory PostgreSQL browser checks exercised Arabic translation/audio,
lost accepted-response reload and explicit receipt reconciliation, Urdu speech
failure and same-job retry to ready, English audio-only commands, retained next-draft
baseline without falsely ready audio, immutable publication/auditor absence and
320px Urdu RTL confirmation. Cancel/Escape focus was initially lost because the
command button had been replaced; the button-ref repair was rechecked successfully.
Screenshots: `evidence/regeneration-urdu-320.jpg`,
`evidence/regeneration-retry-ready-320.jpg` and
`evidence/regeneration-recovered-1440.jpg`. They prove these synthetic UI states,
not all-reference fidelity, full accessibility or speech quality. No Reticle,
actual server concurrency or process-kill evidence is claimed.

Next: enabled-target configuration and speech alignment.
Structured durable per-stage progress/errors are now implemented and regression-tested.
Speech alignment,
quota/spend reservations, attached-object retention and independent backup/restore,
live synthetic evaluation and all remaining rollout gates stay open. Neon Free only;
no paid database, provider call, account provisioning or deployment occurred.
