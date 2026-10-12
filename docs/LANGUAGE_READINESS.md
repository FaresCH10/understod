# Language readiness

The readiness surface is an evidence view, not a language-approval gate. It reports three separate things for each supported language:

- worker UI support and text direction;
- complete stored content in the latest scoped publication;
- provider translation and speech evidence.

The current local and PostgreSQL rehearsal environments are synthetic-only. Their readiness check intentionally reports provider connection, translation and speech as `not_tested`; it never implies that real worker data may be sent to a free-tier provider. Urdu speech remains unverified by the Gemini adapter.

`GET /api/language-readiness` is available to site-scoped staff. `POST /api/language-readiness/test` accepts an empty JSON object and runs the bounded synthetic evidence check for owner, administrator and supervisor roles. It does not call an external provider or expose credentials.

Site generation defaults are now persisted and shown independently for each language. Selection is not a provider test or an instruction to hide historical content. The card has no unlabeled overall Ready badge. See `GENERATION_LANGUAGES.md` for capture, regeneration, migration and browser evidence.

Remaining launch work includes per-draft language selection, a worker language chooser, privacy-approved provider connection tests and independent native-language evaluation evidence.
