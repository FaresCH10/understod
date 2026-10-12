# Preparation Provider Provenance

Checkpoint: 2026-10-11 05:00 UTC. Local synthetic evidence, not production readiness.

## Implemented

Migration 069 adds bounded preparation contexts to actual provider operations:
tenant/site/briefing/job/revision/run, immutable stage/step/language/track, exact
argument hash, full draft-input root hash, full provider fingerprint and targets.
No raw source, arguments, glossary text or credentials are stored in that context.
Stage provenance identifies the actual text or speech model and versioned prompt
and schema. Reservation and every request recheck the active authority, lease,
current source/review/glossary/target dependencies and generated stage-start event.

Attached generated bundles carry an immutable expected count and scoped immutable
operation links. Verification requires all operations from that exact claim,
exact context/provenance, one accepted non-cleanup request per operation and real
stage events. A failed grounding check followed by automatic repair stays a failed
semantic stage, even if its provider request was accepted. Accepted HTTP requests
are not mislabeled as semantic correctness.

Historical nullable evidence remains unknown, without invented backfill. Failed
transport claims retain their real journals; retry links only its new claim.
Target-only regeneration links only newly generated speech, retaining old
publication operations and audio. Private reads verify the persisted bundle links
without reinterpreting history against later draft edits. Verification uses bounded
batch queries rather than a request/stage query for each operation.

## Executed Evidence

```powershell
node --test tests/preparation-provenance.test.mjs tests/preparation-provider.test.mjs tests/pipeline-rehearsal.test.mjs tests/generated-audio.test.mjs tests/audio-provenance.test.mjs tests/postgres.test.mjs
node --test tests/pipeline-rehearsal.test.mjs
npm run build
node scripts/evaluate-rehearsal.mjs --output artifacts/pipeline-preparation-provenance-2026-10-11.json
```

The focused run passed 53 tests, zero failures/skips, 52.704 seconds. It includes
loopback HTTP and disposable embedded PostgreSQL/mock providers. An earlier
sandbox run failed three HTTP tests with loopback EACCES; those were not counted as
passes. The authorized local-only rerun completed normally. After adding report
evidence, its four regression tests passed, zero failures/skips, 3.609 seconds.
Strict build passed; existing large-bundle and ineffective offline-import warnings
remain. All 62 generated shell hashes match.

The exclusive preserved report has SHA-256
`c0f5dbc005e7924e760a7af6c75e358992ad06570d516e8656898a1238f3bf58`.
Nine normal application workflow checks use 24 scripted requests, zero external
requests and 16 operations. Eight preparation records verify exact expected
arguments, one draft root, four text stages and four English/Arabic speech tracks.
Only hashes and bounded stage/provenance fields appear in the report. Previous
reports and the independently pinned dataset are preserved.

Read-only checks of the existing SQLite preview confirm all eight original business
table fingerprints unchanged, integrity OK and zero foreign-key violations. No
worker or main-database migration was started.

## Unverified

This is not live Gemini quality, independent native-language QA, spoken audio,
microphone/browser workflow, Neon/R2/Render, multi-process concurrency or hosted
CI evidence. Urdu speech remains unsupported. Free-tier processing remains
synthetic-only; real worker data must not be sent. No release/readiness promotion.
S36/A16 full retention coverage is the next major current-code audit.
