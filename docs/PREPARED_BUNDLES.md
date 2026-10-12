# Prepared-language generation boundary

Checkpoint: 2026-10-06. `server/ai/prepared-bundle.mjs` builds a bounded in-memory
manifest and canonical WAV bytes. An internal PostgreSQL journal now durably stages
and verifies these artifacts; see `GENERATED_AUDIO.md`. Synthetic PostgreSQL worker
readiness, immutable publication and private worker/staff playback are integrated.
Optional translated edits now bind review hashes and automatic checks before exact
edited-text speech; see `TRANSLATION_EDITS.md`. Selective regeneration/reuse now runs
through a durable synthetic PostgreSQL request/job path; see `TARGET_REGENERATION.md`.
Its screen controls and live/production integrations remain open.

## Implemented contract

- Source revision, optional question/fact/rubric edits, complete glossary snapshot,
  selected languages, provider/model/voice/prompt/schema configuration and hashes
  bind the bundle dependencies. A required caller guard runs before and after every
  provider operation and after progress callbacks; false or thrown guards fail closed.
- Preparation requires exact asked-fact membership, distinct bounded facts and
  structured source quotes covering each fact. A model checks grounding, ambiguity
  and question/rubric alignment. Misalignment permits one regeneration, then fails.
  Ambiguous or ungrounded output never becomes successful preparation.
- Target title/body/question require independent model completeness, faithfulness,
  language and terminology checks. Matching tenant EN-to-target terminology is
  supplied as data. All translation checks finish before speech generation starts.
- Body and question speech uses the exact target text. Each private UUID reference
  records its language, exact-text hash, byte hash, size and duration. Identical text
  reuses audio within the same language/configuration/bundle. Target regeneration
  also retains verified other-language audio without new model calls. No per-recipient
  generation or device-speech success marker is substituted.
- Speech must be audible canonical mono 16 kHz 16-bit PCM WAV, 0.25-90 seconds,
  with a 12 MB aggregate limit. Manifest size is capped at 100 KB. Provider errors
  are reduced to bounded stage codes; the manifest contains no bytes, key or URL.
- Gemini provenance is synthetic-only. Its current checked capability declaration
  excludes unverified Urdu speech, so selecting Urdu fails before a provider call.
  Neither script presence nor a successful mock proves language correctness.

## Verification and remaining work

`node --test tests/prepared-bundle.test.mjs tests/gemini-adapter.test.mjs`: 19 pass,
zero fail. Mocks cover successful dependencies/exact-text references, private rubric,
guard races, bounded regeneration, invalid evidence/translations/glossary, capability
and real-data denial, deduplication, corrupt/silent/tiny/wrong-rate/oversize speech,
canonical base64, structured provider checks and tenant-term request propagation.
No live request, linguistic evaluation or actual spoken-text alignment is claimed.

Synthetic PostgreSQL worker commits now attach durable artifacts, publication verifies
frozen journal/bytes and private assignment playback excludes rubric/metadata.
Default SQLite remains unchanged; see `GENERATED_AUDIO.md` for evidence and limits.

Next: selective translation/audio regeneration controls/recovery, speech alignment checks,
enabled language/requester/tenant fences, quota/cost reservations; process-kill recovery,
private deletion/backup/restore and live synthetic multilingual evaluation. Keep the
current production-startup refusal and no-live-to-demo-fallback policy in place.
