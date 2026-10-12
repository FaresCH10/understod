# Synthetic PostgreSQL runtime

2026-10-12: hosted API/worker/check startup now requires an explicitly restricted
service login, never a schema owner. RUNTIME_PERMISSIONS.md documents atomic
maintenance ACL setup, read-only startup inspection and persistent source runtime
write revocation. Current complete migrations are verified, not the historical
counts below. The existing local synthetic rehearsal remains separate; native
Neon Free/TLS/roles/concurrency and full production release remain unverified.

Current runtime requires migrations through 065. Default-off preparation (064)
and arbitrary frozen-rubric typed assessment (065) are connected to the awaited
worker cycle with exact reviewed synthetic input allowlists, persisted quotas
and authority/lease/tenant fences. Read-only maintenance commands `fingerprint`
and `assessment-fingerprint` output no source/answer/rubric text. See
PREPARATION_PIPELINE.md and ASSESSMENT_PIPELINE.md for setup/evidence/limits.
English/Arabic mock-provider generation/publication/assessment passes; this is
not live/cloud/Urdu speech/real-data readiness. Earlier entries follow.

Migration 063 and the optional `recording` worker stage now connect accepted
private answer WAVs to transcription and frozen-rubric assessment. The default
is disabled; `UNDERSTOOD_RECORDING_ADAPTER=gemini-free` permits only local
credential-mode synthetic rehearsals with an explicit WAV SHA-256 allowlist
and enabled persisted global/tenant quotas. Hosted activation remains rejected.
See RECORDING_PIPELINE.md for the boundaries and current evidence. All
migrations through 063 are required; no live or production readiness is claimed.

Migration 062 adds independent private voice help/replies and a provider-independent
cleanup stage. CASE_VOICE.md records scope, receipt, deletion and verification
limits. This earlier checkpoint is still synthetic-only.

Migration 061 adds private append-only case reviews and effective deadline
overrides. CASE_REVIEWS.md records invariants and focused/native evidence;
SQLite parity and full production gates remain open.

Migration 060 adds supervisor-requested repeat answers. CASE_REPEATS.md records
deadline/admission/receipt/assessment invariants and checkpoint limitations.

2026-10-10 continuation: migrations through 059 are now required. Synthetic local
queued follow-up translation/private speech, request quotas and deletion/retention
are documented in CASE_FOLLOWUPS.md; disabled by default, hosted activation still
rejected, Urdu speech unsupported and no live provider evidence claimed. New case
routing/deadline/escalation is covered in CASE_ROUTING.md. Worker site
admission pause/resume, revocation, immutable receipts and populated import are
covered in `SITE_WORKER_ACCESS.md`. Site archive/restore and read-only admission
are covered in `SITE_LIFECYCLE.md`; real wire/concurrency remains unverified. Additional-site
creation preserves the credential owner's account and current session; see
`SITE_CREATION.md`. Fresh synthetic
workspace/first-owner maintenance provisioning is in `WORKSPACE_BOOTSTRAP.md`;
hosted synthetic staging commands and proxy gates are in `HOSTED_RUNTIME.md`. Separate
operator access, tenant/global dispatch controls, worker observations and
default-closed synthetic provider quotas are available. Optional
`UNDERSTOOD_STORAGE_CHECKS=true` runs a journaled synthetic write/readback/delete
probe in the isolated local audio directory; defaults off, pending cleanup
continues after disabling new probes. It does not certify bucket privacy or
production readiness. See PLATFORM_OPERATIONS.md for current evidence. Older
checkpoint descriptions below are historical, not completed production gates.

The default app and preserved data remain SQLite. A separate loopback credential API and worker can now run against a prepared, isolated PostgreSQL schema. This is a synthetic rehearsal, not a production bypass or deployed service.

## Preparation

Use a disposable authorized test database and a schema named understood_test_ followed by lowercase letters/digits/underscores. Have the operator create that schema and apply server/postgres/migrate.mjs with UNDERSTOOD_POSTGRES_SCHEMA explicitly set. Import only a verified synthetic backup using POSTGRES_CUTOVER.md; imported credentials are intentionally omitted. Do not use the default private-audio directory, real worker data, a public schema or a production connection.

Configuration template: ../.env.rehearsal.example. Set a private .env.rehearsal file locally; .env.* secret files are excluded by .gitignore. Supply UNDERSTOOD_POSTGRES_URL privately, never in chat or command-line arguments. Remote connections require explicitly configured, certificate-verified TLS; no insecure certificate override exists. The example uses different ports (3030/3031) and private audio directory to keep the current 3020/3021 fixture untouched.

The schema must already contain the intended active staff/site/org records. The operator can provision or rotate that existing staff credential using scoped UNDERSTOOD_REHEARSAL_STAFF_ID, ORG_ID, SITE_ID, EMAIL and PASSWORD environment variables and:

```powershell
node --env-file=.env.rehearsal scripts/postgres-rehearsal-credential.mjs --rotate-staff
```

That command revokes the linked account's prior sessions. It never creates a staff/site grant or prints the password; it creates the additive credential-account/home membership when the existing staff grant is first provisioned. Rotating an imported linked grant retains its canonical credential anchor. Do not run it against someone else's credentials or a non-disposable workspace.

## Run

From the workspace, after explicit schema provisioning and synthetic import:

```powershell
node --env-file=.env.rehearsal scripts/postgres-rehearsal.mjs check
node --env-file=.env.rehearsal scripts/postgres-rehearsal.mjs api
```

In separate terminals:

```powershell
node --env-file=.env.rehearsal scripts/postgres-rehearsal.mjs worker
node --env-file=.env.rehearsal node_modules/vite/bin/vite.js
```

Do not use scripts/dev.mjs for this rehearsal: that command intentionally starts the SQLite demo. The standalone web process uses the configured loopback API port. Sign in through credential login; there is no demo-profile route.

API/worker startup verifies the complete migration checksum ledger in a read-only transaction. Runtime does not apply DDL or seed. The API has bounded header/request timeouts; SIGINT/SIGTERM stops acceptance, waits for requests and closes its pool. The worker awaits each stage and stops between stages, preventing overlapping ticks and unbounded queue draining. Each cycle attempts preparation, typed assessment, export, expired staged-audio cleanup, import expiry, export expiry, recovery expiry and one recovery mail job.

Migration 020 is required for account recovery. Rehearsal email is explicitly disabled by default. The same protected mail settings described in ACCOUNT_RECOVERY.md can be configured for web/worker, but require separately authorized provider/domain/privacy and delivery testing before activation. No real messages were sent. Synthetic SQLite import omits local credentials and recovery secrets/mail; target recovery tables must be empty. Reset clears only the rehearsal cookie and does not automatically sign in.

Migration 021 adds linked accounts/site memberships, independent site-local roles, canonical credential handling and group session/recovery revocation. The credential browser picker uses `/api/account/sites`, `/api/account/site` and GET-only session verification after uncertain selection. It was checked against the SQLite memory fixture, not a live PostgreSQL browser cutover. See STAFF_ACCOUNTS.md.

Migration 022 adds staff invitations and immutable acceptance/mutation receipts. Rehearsal HTTP includes the private staff and anonymous credential invitation contracts; awaited invitation mail/expiry stages are scheduled. Embedded tests cover signup/linking/replay/authority/cancellation/restore/cutover. Invitation screens/client recovery are implemented and checked against a SQLite memory fixture, not a PostgreSQL browser cutover. Actual server concurrency and real mail remain unverified. See STAFF_INVITATIONS.md. Neon Free is the unprovisioned database target; no paid upgrade is authorized.

Migration 023 adds scoped immutable generated-bundle/audio journals and leased orphan
cleanup. The awaited rehearsal cycle now includes `generatedAudioExpiry`. Internal
staging/readback/replay uses the current draft and prepare-job lease. An explicitly
injected synthetic `preparationAdapter`/`preparationLanguages` configuration now
runs generation through atomic readiness attachment in the scheduler; default
configuration still uses the canonical demo. There is no environment-enabled Gemini
or public artifact upload. Generated publication verification and scoped assignment
briefing/question playback execute in isolated API/browser fixtures; live runtime,
speech quality, quota/actor/tenant fences and cloud restore remain open. See
GENERATED_AUDIO.md and PREPARED_BUNDLES.md.

The rehearsal uses an HttpOnly `understood_pg_rehearsal` cookie, distinct from the SQLite app's cookie. Cookies are not isolated by port on the same hostname; this separation prevents rehearsal login/logout from replacing the default application's session. HTTP tests reject the SQLite cookie and verify rehearsal revocation.

Typed assessment uses the narrow deterministic shelf rubric only, with exact answer evidence; unsupported or oversized evidence is unassessable. No live provider has been called in verification. Voice transcription/assessment is now optionally scheduled as described above; without explicit opt-in accepted voice remains pending. Private generated briefing audio has synthetic rehearsal evidence, not live speech-quality proof. Full runtime, cloud and production release gates remain incomplete.

## Evidence And Limits

tests/postgres-runtime.test.mjs executes the standalone HTTP startup and scheduled functions against embedded PostgreSQL: verified read-only startup, credential login, scope, preparation, explicit publication, pending typed receipt and one completed synthetic assessment. Unit scheduler tests verify awaited stages, failure isolation and abort. This is not proof of a real pg connection, pool concurrency, TLS, process-kill recovery or cloud storage.

tests/postgres-concurrency.test.mjs requires an explicitly local UNDERSTOOD_PG_TEST_URL with test in its database name. It creates/drops only a randomized understood_test_ schema and checks two actual backend connections, concurrent grant redemption, publication replay, receipt acceptance, assessment claims, recovery mail claims, reset consumption, rate counters and same-cookie site selection followed by linked credential rotation. It remains skipped locally because no authorized real test connection is configured.

../.github/workflows/verify.yml prepares a disposable PostgreSQL 18 service, locked npm installation, full tests including external checks, synthetic evaluation and build. The directory is not a Git repository and no workflow has been run on GitHub. No CI-green or release claim is made. Configuration follows the [GitHub PostgreSQL service guide](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers); action pins are verified in the official [checkout workflow](https://github.com/actions/setup-node/blob/main/.github/workflows/versions.yml) and [setup-node v7 release](https://github.com/actions/setup-node/releases/tag/v7.0.0).
