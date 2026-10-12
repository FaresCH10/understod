# Gemini protocol check, 2026-10-06

The adapter is server-only, mock-tested and disconnected from the running synthetic
pipeline. No provider request was made. Constructor policy still rejects any data
class other than synthetic; this is not authorization to send real worker data.

Current official sources were checked:

- [Model catalog](https://ai.google.dev/gemini-api/docs/models): configured model
  identifiers are listed. Catalog presence is not account/region/free-tier entitlement.
- [Structured output REST guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output):
  existing generateContent JSON responseFormat schema matches the documented format.
- [TTS REST guide](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation):
  the current speech voice request and WAV format match the documented example.
  Requests now explicitly select AUDIO_WAV at 16 kHz. Validation checks canonical
  mono 16-bit PCM structure, length/duration, non-silence and canonical base64, and
  rejects multiple candidate/audio parts. This is not spoken-text alignment
  verification. Language detection is not proof of correct spoken language.
- [Transcription guide](https://ai.google.dev/gemini-api/docs/transcribe) and
  [Interactions REST reference](https://ai.google.dev/api/interactions-api): dedicated
  transcription now uses /v1beta/interactions, explicit verbatim mode and store:false.
  It no longer incorrectly expects generateContent candidates from this model.

Transcription accepts server-valid mono 16 kHz PCM WAV with non-silent audio before
uploading. Resumable destinations must be on the Google API upload path with no URL
credentials/fragment; redirects are rejected. Returned file name/URI must agree.
Only a completed interaction for the configured model with one model-output step
containing text is accepted. Partial, wrong-model, empty and unrelated results fail.
Provider-file deletion is attempted after success or generation/parsing failure;
cleanup failure does not hide the original failure. This is best effort, not verified
remote deletion, and upload acceptance followed by a lost/malformed response remains
a cleanup/reconciliation gap.

The published speech and dedicated transcription language tables inspected here do
not list Urdu. That absence is not proof of actual rejection, but means Urdu support
must remain unverified rather than being assumed from a successful English mock.
The adapter now rejects Urdu speech locally before making a request.
Arabic dialect suitability also needs evaluation. No language-ready UI should infer
readiness solely from these configured models. See S31 and M5 gates.

store:false requests no retrievable interaction state; it does not change free-tier
training/privacy terms. User policy keeps all real worker content off Gemini free tier.
No new API key, account connection, billable test or real-data provider path was used.

Focused mocked checks cover the current request/response shape, valid WAV preflight,
unsafe upload destinations, incomplete/wrong-model output, provider/parsing failures,
cleanup attempts and redacted errors. They do not establish live availability,
multilingual accuracy, quota/cost accounting or production readiness.

Current focused results: ten Gemini checks and nine prepared-bundle checks pass.
Structured grounding/question and translation/terminology checks are implemented;
see `PREPARED_BUNDLES.md` for their scope and missing durable/runtime integration.
Gemini remains disconnected; no provider/account capability or accuracy gate passes
on these mocks. `BUILD_STATUS.md` records the current full-suite/runtime checkpoint.
