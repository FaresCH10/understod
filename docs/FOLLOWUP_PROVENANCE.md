# Follow-Up Provider Provenance

Checkpoint: 2026-10-11. Migration 068 requires exact input/provenance evidence on
future metered follow-ups and links actual successful delivery to its operation.
Previously unknown operation rows remain unknown and are not backfilled.

The canonical fingerprint binds tenant/site, case/assignment/publication, language,
request identity/hash, requesting actor/role, exact source, glossary hash/revision
and provider configuration. The provenance retains both text and speech models,
voice and exact prompt/schema versions; a mixed translation/speech operation is
not mislabeled as a single-model assessment. English reserves one speech request;
Arabic reserves three requests (translation, automatic check, speech).

Reservation and each dispatch recheck the fingerprint, scoped live claim,
requester, worker/deletion state, glossary and operational controls. Final delivery
checks the captured provenance against the generated private manifest. Its atomic
message/audio/delivery/audit commit stores the operation ID/input hash; the database
requires matching claim/scope/model/provenance and the exact accepted request count.
Links cannot be replaced or cleared. Normal deletion redacts source/glossary/
manifest/conversation/private audio while keeping minimal hash/operation evidence.

Unmetered synthetic test adapters retain null operation links, not invented
provider evidence. Free-tier configuration still permits synthetic data only.
This change does not enable real worker processing or hosted deployment.

## Evidence

Final focused session 83679: 54 passed, zero failed/skipped, 19.270 seconds.
Includes EN/AR metered delivery, immutable links, exact replay, glossary/source/
scope/model fingerprint changes, deletion, audio provenance, quota/pause,
evaluation and migration regressions. An earlier English denial fixture targeted
a nonexistent row; the fixture was corrected and the entire focused command rerun.

Strict TypeScript/build passes; all 62 shell hashes match. Existing bundle-size and
offline import warnings remain. No frontend files changed or browser verdict was
claimed. Original demo business evidence was not mutated.

`artifacts/pipeline-followup-provenance-2026-10-11.json` was created exclusively:
SHA-256 `2860e35815eddc0f633aa29248a1b0167e8e12e2a6faea4feaf232d286bd7f5a`.
Nine application checks, 24 scripted/zero external requests, 16 metered operations;
the report now includes actual bounded follow-up fingerprint/provenance evidence.
Earlier pipeline reports remain preserved. This is not live inference, native
language/audio quality, browser/hardware, real PostgreSQL concurrency or readiness
evidence. No live database migration, cloud provisioning, mail or real-data send.

Next major work: persist exact per-stage briefing preparation/translation/speech
input/model/prompt/schema evidence and its accepted completion linkage. Other
application, 44-reference, security/privacy, device, cloud and release gates remain.
