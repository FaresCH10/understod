# Company glossary

S33 is partial. The scoped terminology ledger, optional overrides, version history,
draft invalidation and tab-local request recovery are implemented. General live AI
suggestions, full reference/accessibility coverage and production execution are not.

## Contract

- Active scoped owners/supervisors can create, edit an override, remove, restore or
  regenerate. Auditors can read; workers cannot. Actual staff authority is rechecked
  on the server. Caller organization/site/role/provenance fields are rejected.
- A term's source text and EN/AR/UR language pair identify an immutable entry.
  Normalized duplicate identities are rejected, including removed entries. To replace
  an identity, remove it and create a new entry; no source rename is implemented.
- Source terms are bounded to 200 characters and optional overrides to 500.
  Create/edit fields, confirmation, optimistic revision and UUID requests are strict.
- Every accepted change adds immutable content/status and request/result evidence,
  with an atomic audit event. Replay compares canonical original inputs before
  returning the original result, including after later versions or lost acknowledgements.
- Private list reads support literal source/suggestion/override search, language pair,
  status and bounded pagination. Detail/history is scoped and paged; old versions are
  read-only. HTTP responses are no-store.

SQLite and PostgreSQL repositories implement the same contract. Migration 018 creates
the PostgreSQL ledger and immutable/scope guards. The synthetic SQLite importer
preserves optional glossary evidence and accepts older backups without those tables.
Embedded PostgreSQL tests are not proof of real wire/TLS or concurrent transactions.

## Dependency behavior

Every nonarchived site draft consumes the complete active terminology snapshot.
Accepted glossary changes increment draft revisions and clear preparation. Previously
prepared/processing/failed drafts queue new preparation; never-prepared drafts stay
draft. Source and question/fact/private-rubric overrides remain, with their current
revision updated. Archived and foreign-site drafts are untouched.

The snapshot uses a cumulative version revision and a SHA-256 hash of canonical active
content, including optional overrides and suggestion provenance. Prepared provenance
retains the snapshot revision/hash and term IDs/revisions. Publication checks the
current dependency; legacy preparation is accepted only when the site has no glossary
history. Stale preparation cannot restore readiness after a newer terminology edit.
Published snapshots, assignments, attempts and original review receipts are unchanged.

Site-wide invalidation and snapshot reads are O(number of terms/drafts), with affected
drafts updated in one transaction. Large-site batching/dependency-selective invalidation
and real PostgreSQL contention still need performance evidence.

## Synthetic boundary

The local suggestion adapter only knows the canonical English blue/yellow shelf terms
in Arabic/Urdu. Its provenance says synthetic, never live AI. Other terms can retain
manual overrides but do not invent a suggestion. Unsupported regeneration fails
without an accepted change. Incompatible overrides for the canonical synthetic
briefing fail preparation honestly instead of claiming that the translation used them.
General terminology generation/application through the live provider is not wired.
No external provider call occurred. Gemini free tier remains synthetic-only.

## Recovery

Before sending, the browser saves and reads back the exact confirmed request in a
staff/organization/site-scoped sessionStorage key. A pending request cannot be replaced
by another. Interrupted/malformed acknowledgements keep the original form locked.
Reload or navigation first checks the immutable receipt using GET only. A matching,
validated result clears recovery; an absent receipt permits explicit original-ID retry.
Definite rejected form submissions leave the original version unchanged.

This is tab-local storage, not an encrypted offline outbox or a closed-tab/cross-device
guarantee. Recovery of an unaccepted request that later conflicts needs an explicit
reconciliation/discard workflow; retry alone cannot resolve that conflict.

## Evidence, 2026-10-05

- Full suite: 190 tests, 188 pass, zero fail, two external PostgreSQL skips.
- Strict TypeScript/Vite build: pass, 1917 modules after final navigation/RTL edits.
- Glossary/recovery checks cover strict inputs, authority/HTTP, immutable history,
  exact replay, audit rollback, PostgreSQL lost acknowledgement, more than one page,
  import/hash parity, retained reviews, archived/foreign drafts, stale ready/publication
  and old worker completion. General live AI and real-server execution are untested.
- Memory-only browser fixture 83802: accepted edit lost acknowledgement; reload
  recovered v2 by GET only. Original v1 remained read-only; remove v3, restore v4 and
  synthetic regenerate v5 retained history. Unaccepted create survived reload/navigation;
  explicit original-ID retry created Dispatch point once. Unsupported regeneration
  returned 409 with no new version/receipt. Final 27 terms/31 receipts, shelf revision
  32 ready; publication evidence unchanged. Fixture stopped.
- 320/1440 layouts inspected; no document overflow, heading focus and processing-nav
  selection checked. Arabic/Urdu detail text has explicit lang/RTL. Phone settled
  document width 305/305, desktop 1440/1440. Captures in evidence/browser-check.md.
- Main app restarted as dev session 97854 on 3020/3021. Eight original evidence hashes
  match; all three saved glossary tables remain empty. Saved shelf ready revision 1,
  published v3 remains 30 assigned/25 responses/22 matches/3 clarifications/5 pending,
  83% response completion. No publication, worker answer, email, cloud or live AI action.

Reticle is not connected. No Reticle, native-language correctness, full accessibility,
44-reference fidelity or production-readiness verdict is claimed.
