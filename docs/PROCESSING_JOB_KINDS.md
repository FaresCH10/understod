# Processing Job Kinds

Checkpoint: 2026-10-14 11:26 UTC. S17 remains partial, about85% locally accepted.
This is customer processing metadata, never an operator queue or human approval.

## Contract

- Preparation remains a real `jobs` row and retains current-revision retry and
  validated per-attempt translation/speech/storage/finalization stage evidence.
- Accepted `source_audio_requests` and worker `recordings` appear under distinct
  typed IDs. Unreceived staging rows are excluded. Received/transcribed statuses
  map to queued/complete, not fabricated ready artifacts or understanding.
- PostgreSQL `assessment_jobs` show actual durable attempts/status. SQLite actual
  completed `attempts` are marked `inline-synthetic`; no asynchronous jobs invented.
  Imported historical assessments without a native job are not synthesized as
  PostgreSQL jobs; original response history remains their destination.
- Counts and rows share one scoped bounded SQL query. Kind/status/search/sort and
  stable pagination reject unrecognized options. Fresh active staff authority is
  required; worker/foreign-scope access is denied. Explicit projection hides
  source/answer text, evidence, rubric, hashes, object references and lease data.
- Published title, version and assignment come from the frozen publication, never
  a renamed current draft. Expired publication content shows an expired label.
- Strict client DTOs reject extra/private fields, wrong typed IDs, duplicate pages,
  forged readiness, missing frozen bindings and malformed timestamps/stage data.
- Own source retries reuse existing immutable receipts and explicit confirmation.
  Source JSON reads/retries require captured context; audio/original native GETs
  continue to require private cookie/actor/scope/storage verification without a
  custom header. Held/changed/unmounted views cannot adopt retry completion.
- Response details open the exact frozen publication/assignment. Background job
  polling pauses while history is open to avoid audio/read-history interruption.

## Evidence

- `tests/processing-kinds.test.mjs`: actual mixed SQLite and embedded PostgreSQL
  fixtures, received-only inclusion, typed states, exact bindings, redaction,
  paging, foreign/worker denial, own-source retry metadata and strict DTO checks.
- `tests/processing-state.test.mjs`: corruption/private fields/identity/readiness/
  inline-mode and pagination rejection. Existing HTTP tests verify encoded IDs on
  both backends. Source storage HTTP tests verify missing/stale/changed-cookie
  denials before business writes and native byte playback on both backends.
- First full suite: 974 tests, 969 pass, one old preparation-only count assertion,
  four skips. Updated test preserves original preparation assertion and additionally
  verifies completed exact-version checks. Final full suite: 974/970 pass/zero fail/
  four native skips, 270430.2005 ms, terminal36298 exit0. Focused54 pass; earlier
  mixed queue/stage tests8 pass. Logs retained, no assertions weakened.
- Final strict build2062 modules/653.49KB entry passes. Existing chunk/mixed-import
  warnings remain. Final55 shell hashes match. No provider calls this continuation.
- Built disposable browser journeys: four families visible; source explicit retry
  accepted and preserved across reload without another POST; upload history shows
  same receipt. Response transcription opens accepted voice/Urdu question and frozen
  v3 while current draft is revision2 with a different title. History stays open.
  Complete-check filter shows25 jobs, page2 five rows. Keyboard Enter and320px
  layout verified; corrected long response-button overflow. Final305 document width
  within320 viewport. Desktop and narrow screenshots in `artifacts/processing-*`.
- Final fixture38737 terminal:12 queue reads/one retry/seven inventories unchanged/
  zero external calls. Prior45548 terminal:99 reads/one retry; prior47926 terminal:
  three reads/no retries. Temporary tab closed; viewport reset.
- Eight original table fingerprints/counts match the read-only11October baseline,
  integrityOK/FK0. Current key absent from1364 nonignored source/evidence files and
  public assets; exampleblank. Original3020/3021 previews not restarted or migrated.

## Open Acceptance

- Failed voice/check customer recovery and per-run provenance beyond preparation
  require audit against existing worker/operator contracts; no unsafe retry button
  or new operator permission was added. Follow-up-generation coverage also remains.
- Broader account transitions/held authority, native SQL role/TLS/concurrency,
  real devices, codecs, audio interruption and all44-reference/a11y/RTL checks.
- Shared read helper can briefly present old data before its path-change effect
  clears it; strict queue DTO rejects it, but transient filter-error UX needs polish.
- Complete live voice pipeline, Urdu speech and independent quality still open.
  Gemini Free remains synthetic-only; actual cloud/real-worker release not approved.
- Reticle has no connected app/verdict. Browser evidence here is direct Cua, not
  a Reticle pass or a full accessibility/reference certification.

## Resumed Audit

After an actual30.0292-second pause, inspected existing PostgreSQL operator retry,
recording workers and assessment claim/completion. Operator assessment retries are
not staff authority and cannot be called by customer controls. Customer recovery
needs frozen assignment/input and pending-only completion, exact receipt-generation
identity independent of reset attempt counts, worker/deletion/content/text/audio
expiry checks, transaction/audit atomicity and unchanged dispatch/provider gates.
Recording workers combine voice transcription and checking; do not invent a second
asynchronous answer-check job for a completed voice attempt. No new retry endpoint
or mutation was added during this resumed audit.
