# Provider readiness

2026-10-10 supplement: dedicated budgeted translation/speech tests and durable
technical results now exist. See PROVIDER_STAGE_TESTS.md and current BUILD_STATUS.md.
The inspection-only checkpoint below is historical; live/quality/full release
gates remain open.

The authenticated language-readiness and separate operator provider views now
share a server-generated projection of the actual configured PostgreSQL runtime
handles. Seven stages cover source transcription, preparation, translation,
generated speech, typed assessment, recorded assessment and clarification
follow-up. Disabled or incomplete handles do not become configured merely
because a credential or environment flag exists.

## Evidence Boundaries

Configuration is not dispatch permission, a successful connection, accuracy or
production readiness. Stages remain `not_tested`; the existing fixed synthetic
text connection journal can report `verified` without changing any stage result.
The projection includes only known model IDs and adapter-declared coverage:
text EN/AR/UR, speech EN/AR. Transcription language coverage remains undeclared
and unverified. Configured Urdu speech is explicitly unavailable. Neither
projection nor inspection permits real data.

`Inspect readiness` checks stored content and server configuration without
sending a provider request. A timestamp records inspection, not live verification.
Stored complete published text is independent evidence, not provider readiness.
Input allowlists, keys, key-derived fingerprints, adapter functions, private
answers and rubrics are never projected. Clients cannot supply stage settings.
Staff scope and roles are revalidated; auditors can read but not run inspection.
Operators require their separate session and page context. Customer credentials
cannot access operator provider controls.

## Verification

`node --test tests/provider-readiness.test.mjs tests/usage-model.test.mjs
tests/provider-controls.test.mjs tests/settings.test.mjs
tests/postgres-runtime.test.mjs tests/hosted-runtime.test.mjs` passes 25 checks,
zero failures/skips, with approved local loopback access. The earlier restricted
run had five socket-access failures. Fixture UUID/session-context setup errors
were corrected without weakening operator validation or changing auth.
No provider endpoint was contacted. Tests cover immutable safe projection,
partial/incorrect handles, configuration versus stored/test evidence,
authenticated HTTP wiring, no-store, override rejection and role separation.

Strict optimized build passes; 62 generated shell manifest hashes match.
The first read-only hash verifier used incorrect field names; its corrected
`path`/`hash` verifier passes. Existing oversized entry and ineffective offline
dynamic-import warnings remain.

The disposable built browser fixture uses memory-only PGlite, no worker, closed
quotas and rejects every Node external fetch. Both views were inspected at
1440 and 320 pixels; stage text containment checks at 320 report no overflow.
One staff inspection POST, zero operator POSTs/provider calls/reservations/
verification jobs. Fixture stopped and temporary tab closed, viewport reset.
Earlier fixture lacked the required staff credential account; corrected fixture
uses existing authentication. Reticle was unconnected and produced no verdict.
Screenshots: `artifacts/provider-readiness-desktop.jpg`,
`artifacts/provider-readiness-mobile.jpg`, `artifacts/provider-operations-desktop.jpg`.

## Remaining Gates

Dedicated budgeted translation/speech tests with durable results, live protocol
and language-quality evaluations, Urdu speech and an approved real-data provider
are still required. Neon Free, private R2, TLS/proxy, restore, multi-process
concurrency, all-reference accessibility/device/security/performance and fresh
release verification remain open. This is not production readiness.
