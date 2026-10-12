# Source And Recorded Audio Provenance

Checkpoint: 2026-10-11. Migration 067 and the PostgreSQL workers bind future
synthetic provider results to immutable operations. This is local engineering
evidence, not live-model accuracy or production readiness.

Source transcription fingerprints bind tenant/site, receipt/authority, canonical
and original audio hashes/byte counts and the transcription MIME type. Recorded
transcription fingerprints bind accepted audio metadata, assignment, language,
publication/version and the effective frozen question/asked facts. Assessment
fingerprints additionally bind the saved transcript. Each stage records its exact
adapter, synthetic data class, model, prompt version and schema version.

Completion links require the original live claim and accepted request journal.
They cannot be replaced. Accepted recording metadata and linked transcripts cannot
be edited; the normal scoped worker-deletion path may clear a transcript while
retaining hashes and operation links. Assessment retry reuses the saved transcript
and original transcription operation, linking only the successful assessment.

Existing operations with unknown provenance remain unknown. Migration 067 does
not invent or backfill their input/model/prompt/schema evidence. Its NOT VALID
constraint enforces future inserts without reclassifying historical rows. SQLite
preview results are not represented as proven provider operations.

The read-only evaluation reader now verifies linked recorded observations using
the same exact frozen fixture rules as typed observations. The isolated pipeline
report has four completed typed cases and a separate recorded report with one
completed Arabic case and three not-run cases, not four fabricated recordings.
Source and recorded evidence contains bounded hashes/provenance, not audio,
transcript, evidence quotes or credentials.

## Evidence

```powershell
node --test tests/audio-provenance.test.mjs tests/pipeline-rehearsal.test.mjs tests/provider-controls.test.mjs tests/evaluation.test.mjs tests/postgres-evaluation.test.mjs tests/postgres-embedded.test.mjs tests/postgres.test.mjs tests/deletions.test.mjs tests/deletion-redactions.test.mjs tests/recording-config.test.mjs
npm run evaluate:rehearsal -- --output artifacts/new-audio-provenance-report.json
```

Final focused session 41450: 41 passed, zero failed/skipped, 11.550 seconds.
Strict build passed; the existing bundle-size/offline import warnings remain.
All 62 shell hashes match. Eight existing SQLite business-table fingerprints
match the prior checkpoint; integrity OK, no foreign-key violations. This does
not cover every table, session or audit entry.

Report: `artifacts/pipeline-audio-provenance-2026-10-11.json`, SHA-256
`613c8aaa8cfaf91cb0fc7f79578956b5bb5ec7e421d800825a111333a0591931`.
Nine pipeline checks, 24 scripted/zero external requests, 16 metered operations.
The earlier pipeline report remains preserved with its honest then-incomplete
provenance labels. No live database was migrated or external service contacted.

Scripted transcripts/labels and tone audio do not prove language accuracy, spoken
audio quality, microphone behavior, hosted concurrency or browser workflows.
Preparation/follow-up evidence, full release verification, approved real-data
processing and deployment remain subject to their own gates.
