# Platform operations

Implementation checkpoint: 2026-10-09. S38/S39/S40 remain partial.

2026-10-12: the previously missing scoped tenant worker-access listing now has
bounded pages/search, independent restriction/credential states and metadata-only
browser/API evidence. See `OPERATOR_TENANT_ACCESS.md`; S40 remains partial until
full reference, native concurrency and release verification.

Customer site worker-admission pause/resume is separate from platform tenant or
provider dispatch suspension: it preserves staff access and background processing.
See `SITE_WORKER_ACCESS.md`. Customer site archive/restore separately checks active
dependencies and rejects new operational admissions; privacy cleanup continues
and restore leaves worker access paused. See `SITE_LIFECYCLE.md` for evidence and
remaining wire/concurrency gates.

## Separate Access

`#operations` is independent of customer navigation and authentication. It uses
the `understood_operator` HttpOnly cookie, a one-hour session, a server-derived
exact-session context header and a separately provisioned platform identity.
Customer owners, administrators, auditors and demo profiles cannot become
operators through these endpoints. There is no impersonation or private-content
support access. The SQLite demo explicitly reports operator access unavailable.

Enable only in an isolated synthetic PostgreSQL rehearsal or explicit hosted
synthetic staging with `UNDERSTOOD_OPERATOR_ACCESS=true`. Apply migrations through 054 first. The maintenance
command `node scripts/postgres-operator.mjs --provision-operator` reads a bounded
JSON object from standard input with `id` (UUID), `name`, `email` and `password`.
It must not receive passwords through command arguments or logs. It rotates the
credential and revokes existing operator sessions. No operator is seeded or
provisioned automatically. This is not a production deployment command.

The same maintenance launcher now supports `--bootstrap-workspace` for an explicit
fresh synthetic organization/site/first-owner transaction. It is not an operator
HTTP capability and requires no browser password entry. See `WORKSPACE_BOOTSTRAP.md`.

## Controls And Evidence

The console lists tenant metadata, queue counts and paginated job metadata.
Neither raw provider errors, source text, answers, rubrics, audio nor keys appear
in operator read models. API/database response is observed. Migration 050 records
bounded worker observations before stages, between cycles and on graceful stop,
throttled to one write per five seconds. The console distinguishes responding,
degraded, stale, stopped and never-observed workers; failure evidence contains
only known stage names, not raw errors. Live AI remains unverified. Storage
response evidence is described below; privacy is not inferred from successful I/O.

Tenant suspension/resumption requires an explicit reason and confirmation,
revision matching and an immutable exact-actor request receipt. Suspension
revokes customer sessions and blocks new staff sign-in, grant redemption,
customer authority checks and operational worker dispatch/completion. Resuming
does not restore revoked sessions. It does not erase cached device data.

Global operational and AI-provider dispatch pause controls are separate. Short
shared transaction gates serialize customer/worker checks against exclusive
operator control changes. Preparation, source transcription, assessment,
exports, scheduled publications, reminders, invitation and pilot-mail claims are fenced.
An in-flight external request cannot be recalled. Already-dispatched email
results may still be journaled to avoid losing their acknowledgement. Privacy
expiry, retention, deletion and account recovery continue independently.

Eligible failed preparation/assessment/export jobs can be explicitly requeued
under the same identity, after tenant/current-state/source-authority checks.
Completed artifacts and immutable publications are not duplicated. Obsolete,
archived, regeneration-authority, expired/deletion-affected and inactive-requester
jobs are rejected where relevant. Source retries stay in the existing scoped
customer workflow; this console does not grant source authority.

All mutations retain a metadata-only command in tab storage before POST. Reload
checks receipts read-only, never automatically resends. Explicit unchanged retry
requires a verified missing receipt. Receipts and audit entries are append-only
and scoped to the current operator. The SQLite importer refuses a nonempty
operator/control target rather than silently overwriting it.

## Provider Quotas And Connection Evidence

Migration 051 adds global and per-tenant daily UTC request-slot policies. Both
default closed with a zero limit. The operator console edits them using confirmed
revision-bound commands and immutable receipts. A short database advisory lock
counts reservations across workers before admitting another operation. Lowering
a quota does not refund existing reservations or recall in-flight requests;
the separate dispatch pause stops subsequent non-cleanup requests.

The allowlisted PostgreSQL synthetic source adapter reserves four slots per
attempt: upload start, upload finalization, transcription and file deletion.
Every request rechecks current dispatch, tenant and source lease/authority.
Deletion may use its already-reserved allowance after a pause to avoid retaining
the provider file. No new allowance is allocated for cleanup. Reservations are
not refunded after failure, partial use or unknown outcomes and remain attached
to their admission UTC day, even if dispatch crosses midnight. These are local
request ceilings, not a claim to match Gemini's account-specific quota windows.

`UNDERSTOOD_PROVIDER_TESTS=gemini-free` additionally permits one explicit fixed
synthetic text-preparation test in the isolated credential rehearsal. A configured
key alone enables nothing. The test reserves one global slot, rechecks its exact
operator session before dispatch, validates the returned content and journals
HTTP acceptance separately from successful output validation. Interrupted or
uncertain tests keep their reservation and exact receipt; replay never sends
another request. Only text preparation is verified, not source/audio/language
quality or production readiness. Changing credentials invalidates displayed
connection evidence. Keys and fingerprints never enter the browser/read models.

Normal outbound Gemini calls require a request journal. Mock fetch adapters
remain usable in tests. Consequently standalone SQLite source opt-in cannot
make an unmetered provider request; the persisted quota integration currently
exists only in PostgreSQL. No general live preparation/assessment pipeline is
enabled by this milestone. Model/language metadata is declared configuration,
not evidence of account eligibility, availability or evaluated language quality.
Estimated and actual USD remain unknown, never fabricated from request counts.

Focused provider/configuration/adapter/migration checks: 24 passes. The nine
operator/runtime checks also pass, including provider route origin/context,
default-closed config, policy receipts and disabled-test rejection. TypeScript
passes. All provider HTTP responses are mocked; no credential was retrieved or
live test sent. Reticle change verification had no connected session, so there
is no passing browser-verification claim for this console.

## Storage Observations

Migration 052 journals optional synthetic storage probes before I/O. In the
isolated PostgreSQL rehearsal, `UNDERSTOOD_STORAGE_CHECKS=true` permits a probe
against its configured local private-audio directory. Defaults remain off. A
probe writes a tiny generated WAV and fixed synthetic original under its own
random ID, verifies exact readback, removes both and confirms absence. It never
reads or deletes customer references. New probes are limited to one per five
minutes per adapter. There is no cloud activation in the rehearsal launcher.

Lease recovery performs only cleanup under the original ID, never another
write. Failure to verify absence stays cleanup-pending with a five-minute retry
delay; outstanding cleanup continues even when new probes are disabled. A
completed observation is immutable. Operator readiness distinguishes unverified,
checking, cleanup pending, failed, responding and stale observations and shows
the actual adapter. Public-access policy, cloud account/privacy and production
readiness remain unverified. Process suspension/late-write and real parallel
PostgreSQL/R2 drills remain part of final reliability verification.

Three focused storage checks pass, including actual disposable local-file
write/readback/deletion, cleanup recovery/backoff, interrupted-write cleanup,
unchanged customer references, corrupt readback and stale/unknown states. This
is not evidence for a deployed cloud bucket or real worker data.

## Evidence And Remaining Work

`node --test tests/operations.test.mjs tests/postgres-runtime.test.mjs`: nine focused PGlite/local-HTTP/runtime tests pass.
They exercise separate identity, session rotation, origin/context enforcement,
tenant suspension/new access, exact replay/revision conflicts, immutable audit,
paused preparation completion/resumption and all three retry types without
private-content leakage or duplicate publication. Worker reporting also covers
unobserved/current/degraded/stale states and actual graceful worker shutdown.
`npm run typecheck` passes.

These checks do not establish comprehensive dispatch/concurrency coverage or
production readiness. Cloud storage/privacy readiness, actual provider account verification,
full-pipeline quotas/reconciliation and actual spend, full kill-switch behavior,
production runtime and deployed Neon/private
storage remain incomplete. Full regression, built-browser/reference/mobile and
accessibility review are deferred until the major requirements are implemented.
No live provider, email, cloud database/storage or real worker data was used.
