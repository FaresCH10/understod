# Synthetic assessment evidence

2026-10-11: `VERSIONED_EVALUATION.md` is the current runner/dataset/report contract.
The 43-sample catalog separates 34 semantic examples from nine mocked faults,
records exact-version/model/hash provenance, and supports read-only scoped runtime
observations. Broader local evaluation exits 1 with five disagreements and ten
unsupported semantic samples; it is not relabeled a pass. Mocked contracts pass
43/43, but their semantic responses are constructed from labels and prove no model
accuracy. The actual legacy 19-case regression remains checked. Pilot acceptance,
independent language QA, tolerances and live/audio evaluation remain unverified.
The old 19-case standalone-command description below is historical.

2026-10-10: optional local credential PostgreSQL preparation/translation/private
speech and typed/recorded assessment now use independently gated synthetic Gemini
handles. Contract fixtures include a noncanonical cartons/bay briefing, English/
Arabic generated artifacts and an Arabic answer against the exact publication
after later draft edits. Mocked outputs test plumbing, evidence validation and
failure fencing, not semantic accuracy. No live model request or real worker data
was used. The independently labeled multilingual live evaluation and false-match
tolerances remain required. See the three PIPELINE.md documents; older default
preview/evaluation statements below remain historical.

The local adapter accepts only the exact seeded English shelf-colour source. It produces fixed EN/AR/UR text and a private two-fact rubric. It does not invoke a model, transcribe audio, translate arbitrary prose, or generate audio files. Its answer checker is a narrow deterministic fixture, not a language-understanding or safety system.

`tests/domain.test.mjs` exercises exact and concise correct answers in English, Arabic and Urdu, swapped shelves, negation, missing asked facts, unrelated/empty answers, a misleading floor-near-yellow answer, and instruction-like text. No unasked walkway detail is required to match. The check is bound to the frozen publication's synthetic provenance and rubric; unsupported rubrics are unassessable. Each answer and reason is preserved without modifying the publication.

This test set is insufficient for real usage. Before a pilot, build independently labeled multilingual evaluation data including accents, paraphrases, mixed languages, background noise, silence, speech recognition uncertainty, adversarial phrasing, and false-match thresholds. Test model/provider/schema failures and changes across versions. Report false-match risk separately from response completion; a match never proves comprehension or safe work.

The standalone OpenAI adapter now has mocked transport/schema/refusal tests, and the recording processor has mocked transcription/assessment, exact-version, idempotency and retry tests. Neither is enabled in the running synthetic processor. `node scripts/evaluate-synthetic.mjs` runs 19 narrow EN/AR/UR fixture cases and reports false matches separately from false clarifications. These checks are engineering evidence only, not a live-language accuracy claim.

Gemini protocol follow-up, 2026-10-05: dedicated transcription uses the documented
Interactions endpoint, explicit verbatim/store:false and valid non-silent WAV preflight.
Eight mocked Gemini checks cover request shape, incomplete/wrong-model results,
restricted upload destinations and cleanup/failure handling. No live call or real
worker data was sent. Urdu speech/transcription support for configured models remains
unverified. See `GEMINI_PROTOCOL.md`; no model-accuracy or production claim follows.
