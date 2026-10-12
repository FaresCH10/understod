# Site Generation Defaults

2026-10-08 17:59 UTC checkpoint. Synthetic-only implementation, not provider verification or production readiness.

## Contract

The current site's settings expose `generationLanguages`: English is required; Arabic and Urdu are optional. Canonical choices are `en`, `en/ar`, `en/ur` and `en/ar/ur`. Owner/administrator saves require confirmation, the current revision and an exact immutable request receipt. Unknown scope/input, duplicates and unsupported codes are rejected. Older clients that omit the field retain the current choice, and their original receipts still replay without reverting later changes.

SQLite upgrades existing settings in place; PostgreSQL migration 040 adds a constrained JSONB column. Backup/import preserves the selected array and supplies the previous all-language default only for legacy schemas that lack the column. No historical selection is invented.

New preparation runs capture the defaults when they start. Changing them does not rewrite active runs, prepared content, publications, assignment languages, answers or stored audio. Exact-target regeneration keeps the original bundle's languages. Publication still rejects recipients whose language has no prepared artifact, atomically and without silently dropping workers. An optional translation override for a now-excluded language can fail preparation explicitly rather than silently losing that edit.

These settings do not globally disable worker UI/content or approve provider access. The readiness page shows selection separately from stored publication content and untested translation/speech. Per-draft selection at creation was added in the later `DRAFT_GENERATION_LANGUAGES.md` checkpoint; editing saved choices and a worker language chooser remain outstanding. Settings uncertainty retains its exact retry only in the current open form; tab-durable settings recovery remains outstanding.

## Verification

- Focused related suite: 54 passed, zero failures. Final full suite 10503: 476 tests, 473 passed, zero failures, three external PostgreSQL skips; 101.857 seconds. Covers language-only saves, audit rollback, exact canonical replay, legacy omission, scope/HTTP privacy, repeatable SQLite upgrade and populated PostgreSQL cutover.
- A real synthetic adapter produces selected bundles; an in-flight defaults change cannot alter captured targets. Later runs adopt the new choice, regeneration preserves its bundle and earlier published content stays unchanged. Unsupported Urdu recipients cannot create publication/assignments from an English-only bundle.
- Strict final build passes. Entry `index-Bxj_QcrC.js` 479.52 kB / 129.79 kB gzip; readiness chunk 4.55 / 1.47; all 38 public-shell hashes independently verified. The full suite precedes only removal of an ambiguous duplicate UI-ready badge, followed by strict rebuild and native verification.
- Final built, credential-scoped memory-only fixture saves English/Arabic, reloads revision 1, cancels an unsaved English-only edit, and reports Urdu not selected while its existing content remains present. Synthetic checks leave provider evidence not tested and real-data access false. Actual 320px controls fit; desktop and mobile screenshots inspected under `artifacts/generation-languages/`.
- Fixture 27417 stopped, QA tab closed, viewport reset. Original synthetic/email-disabled preview 21405 restored at 3020/3021 and browser-verified at 30 assigned, 25 responses, 22 matches, 3 clarifications, 5 pending. Eight selected business-table hashes, integrity and foreign keys are unchanged. Main settings receipts/site settings/creation/schedule/reminder/read ledgers remain empty after the schema upgrade.

Real PostgreSQL wire/concurrency/TLS, cloud deployment, microphone/device behavior, independent EN/AR/UR evaluation and full-reference/accessibility acceptance remain open. Gemini free-tier use remains synthetic-only. Neon Free remains the chosen PostgreSQL target; no cloud account was provisioned. Reticle has no connected app and no verdict is claimed. Approximately 70% planned implementation, not production readiness.
