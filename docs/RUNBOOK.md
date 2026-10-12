# Local runbook

## PostgreSQL Recovery

Credential PostgreSQL API/worker and synthetic-only hosted launch paths are now
implemented; they are not deployed or approved for real-data production. Read
POSTGRES_BACKUP.md, PRIVACY_LEDGER.md and RESTORE_ACCEPTED_INPUTS.md for isolated
DB/private-object recovery. Retention requires the authenticated source ledger.
SOURCE_CUTOFF.md adds a read-only whole-source observation, not a release command.
Keep targets quarantined and source writers stopped. Preserve the existing local
preview and its data; these maintenance commands do not restart or migrate it.

## Start and inspect

1. Read `BUILD_STATUS.md` first, then `docs/FEATURE_REGISTER.md` and `docs/DECISIONS.md`.
2. Verify ports 3020/3021 are free, run `node scripts/dev.mjs`, and check `http://127.0.0.1:3021/api/health` for `synthetic-demo`.
3. Open the web app, sign in with a synthetic profile, and inspect the worker/staff flow. A request shown as received is not proof of understanding.
4. Run the three commands in `docs/SETUP.md` after code changes. Preserve `data/understood.sqlite` and review `data/dev.log` / `data/dev.err.log` for local failures.

## State and recovery

- `data/understood.sqlite` is the persistent local database. Additive local schemas and scope triggers are installed on open. Credential PostgreSQL paths are implemented but production rollout remains gated. Preserve the DB and private audio together; use `docs/LOCAL_BACKUP.md` for isolated SQLite backup/restore, not a source overwrite.
- The synthetic worker polls durable queued briefing jobs and report exports and expires staged CSV imports. Obsolete draft jobs fail rather than apply. Exports freeze request-time evidence, expire after 24 hours and require a current staff session. Lease recovery/fencing is unit-tested; process-termination drills remain unverified.
- Received recordings are stored privately but live recording processing is not scheduled in synthetic mode. Never report receipt as assessment. Missing/failed/expired exports do not become downloadable through retry.
- Sessions are HttpOnly and expire. Demo profiles are selectable only on the loopback demo; credential mode uses staff credentials or one-use worker grants with origin checks. Do not expose either local mode to a network.
- Repeated answer/help sends use persisted request IDs in the same browser session. Sign-out clears browser request keys; attempts and cases remain in the database.
- If the API is unreachable, do not claim an answer was uploaded. Supported worker device settings now provide scoped local drafts/outbox; see WORKER_OFFLINE.md and WORKER_AUDIO_OUTBOX.md. Unsaved previews can still be lost. Check authoritative receipt status before repeating an uncertain send, and distinguish saved-on-device from accepted-by-server.

## Stop conditions

Do not enable public deployment, live AI, paid calls, real messaging, or real worker onboarding without explicit authorization and a production readiness review. Do not interpret a matching answer as certification of safe work. No required human language-review gate should be added.
