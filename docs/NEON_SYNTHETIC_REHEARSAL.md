# Neon Synthetic Rehearsal

2026-10-14: executed against the user-configured isolated Neon Free test database.
This is bounded native evidence, not permission to deploy or use real worker data.

Update2026-10-15: native extended races and actual owned-worker crash/recovery
also passed. `artifacts/neon-rehearsal-091c4332-517f-4efd-9dde-991d8eb75a0e.json`
records seven extension checks: one-use grant/session revocation, exact retry
receipt/generation races, expired-lease late-result rejection, actual child
process death/recovery, payment-versus-void, immutable withdrawal history and
global/key auth admission capacity. Only the newly spawned synthetic child was
killed; its exit was awaited. The test explicitly expires its synthetic lease
after death, then verifies one recovery completion/audit; it does not wait out
natural wall-clock expiry or test object-write/provider-charge crashes.
The owned schema was removed and outside identities unchanged. The six core
inventory counts are explicitly a pre-extension snapshot, not final totals.
The interrupted tool handle was reconciled through the finished journal and
absence of owned native/worker processes; no lost terminal exit code is invented.

The separate actual dedicated LOGIN/permission/runtime rehearsal also passed
with its temporary database and role removed. See `NEON_LOGIN_REHEARSAL.md`.
Native acceptance is now approximately75%; overall approximately69%, still partial.

## Executed Evidence

- Connection-only preflight passed with PostgreSQL 18, certificate-verified TLS,
  two simultaneous independent connections, zero application relations and no
  database writes. Channel binding is enabled when offered, not certified as a
  mandatory mechanism. Configuration and credentials are never printed.
- All 86 migrations passed checksum verification and a zero-change second run.
  Concurrent same-intent publication and submission each committed one result;
  two assessment workers produced one claim/completion and one checked audit.
- Cross-tenant assignment failed with SQLSTATE 23503; frozen publication and
  audit edits failed with 23514; foreign provider-history reads were unavailable.
  Provider history resolved the exact frozen publication and assignment and
  did not invent a provider journal for the synthetic adapter.
- Following explicit user authorization, two temporary NOLOGIN roles exercised
  the existing combined API/worker table policy and a no-access control role.
  All current table and sequence grants matched the scoped policy with no grant
  options. Runtime CRUD and worker row locks worked. DDL, truncation, maintenance
  deletion, future-table reads and sequence rewriting failed with 42501.
  Immutable publication/audit guards also held under the assumed runtime role.
- The production direct-login startup gate still rejected SET ROLE test
  instrumentation. NOLOGIN and assumed-role tests do not certify dedicated
  login connectivity, API/worker separation, database-wide privileges or a
  hosted production startup.
- Both owned roles and the random ownership-marked schema were removed and
  their absence checked. Outside database/schema/table/function/default ACLs,
  role attributes and unrelated memberships matched their starting fingerprint.
  Outside schema/relation/function/type catalog identities also matched. This
  comparison is catalog evidence, not a claim to hash every outside data row.

Authoritative final role run:
`artifacts/neon-rehearsal-7c172712-5b54-4d0a-b7d1-3fcb759e1599.json`,
17:30:40-17:32:12 UTC, terminal exit 0. Nine main checks and five role checks
passed; provider calls zero, real data false, production verdict false.
Earlier native runs:
`artifacts/neon-rehearsal-e208ca21-ca30-46d5-8f85-d8c65502efd9.json` and
`artifacts/neon-rehearsal-162a010e-e4fc-430b-8a68-53e86a48d263.json`.

## Safety Boundaries

The loader requires the dedicated `UNDERSTOOD_NEON_TEST_URL` and exact isolation
flag in ignored `.env`. Direct Neon hosts only; pooled endpoints, unverified TLS,
unknown URL options, ambiguous configuration and nonempty targets are rejected.
The existing localhost-only `UNDERSTOOD_PG_TEST_URL` tests remain unchanged.

The default rehearsal creates no roles. The extra
`--confirm-temporary-nologin-roles` flag is required after `--confirm-synthetic`.
No LOGIN role, password, database-wide/public ACL change or automatic future
grant is created. No production permission configurator is called. Cleanup
requires run identity, ownership markers, role attributes/memberships and
outside-state comparisons; drift or ambiguity fails closed. DROP ROLE has no
CASCADE. Lost acknowledgements require reconciliation, not automatic repetition.

Offline tests cover admission, default-off roles, cleanup marker/ACL drift,
lost schema acknowledgement, scoped permissions and unchanged direct-login
guards. PGlite serializes one session for orchestration; it is not native
concurrency evidence. Actual Neon runs provide the native concurrency evidence
listed above. Final optimized role orchestration: eight focused tests passed.
Related runtime/preflight/role checks before batching: 17 passed, zero failures.

## Still Required

Separate service profiles, broader native concurrency and other process-death
drills, native encrypted backup/restore and private-object storage,
source cutoff and activation, hosted monitoring, actual CI/fresh setup, devices,
full references/localization/accessibility and independent live AI/audio quality
remain open. Gemini Free remains synthetic-only. Neon native acceptance is
approximately 75%; overall engineering completion approximately 69%, not ready.
