# Verification Worker Capabilities

2026-10-16. Overall estimate 71%; delegated verification 75% (was 70%);
operator isolation 80% (was 75%). These are implementation/verification estimates,
not production readiness. Real worker content remains prohibited on Gemini Free.

## Boundary

Migration 091 adds a worker-written capability registry. It stores only a worker
UUID, configuration hash, fixed model/fixture capability hash, active/stopped state
and database timestamps. It never stores a Gemini key, executable adapter, worker
content, operator identity or model output. The API role has no access. The
operator can read only hashes, state and last observation; it cannot write it or
read worker UUIDs. Invoker guards stamp timestamps with the database clock, freeze
identity/configuration/creation metadata, reject reopening stopped records and
reject deleting observations younger than 24 hours. Admission fingerprints this
guard as well as the prior authorization and queue guards.

Active observations are usable for 30 seconds. Multiple workers with the same
configuration/capability are allowed. Conflicting fresh configurations, an old
model/fixture capability, stale workers, all-stopped workers or no observation
disable new verification. The descriptor is reconstructed from fixed code, not
arbitrary metadata in the database. The worker checks matching fresh capability
before claims, every provider request and final promotion. An original accepted
command remains recoverable through its original receipt during unavailability.

The normal worker now publishes health/capability atomically using an independent
serialized five-second heartbeat, including through awaited stages and graceful
drain. Failures stop new verification dispatch/promotion; stop drains pending
writes before sampling the terminal snapshot. WORKER_HEARTBEAT.md records the
new clean1163-test evidence and real30-second-window synthetic test. This
supersedes the prior stage-boundary limitation, not the remaining native/network
stall/hosted acceptance. The browser fixture's separate heartbeat is historical
fixture machinery, not evidence of the normal runtime.

## Keyless Operator Bridge

The dedicated operator HTTP service reads the registry and queues fixed tests.
It holds no provider adapter/key. New POSTs require the configuration fingerprint
shown by the provider report in `X-Verification-Config`, before any reservation.
Changed/missing configuration fails with a bounded 409 response. The original
request's reservation/configuration stays immutable. Replaying an accepted ID
returns its original outcome without depending on fresh worker availability.
Receipts include the original configuration fingerprint for client comparison.

The browser persists that fingerprint with the exact pending command, sends it
again only on explicit unchanged retry, and validates it when reconciling a
receipt. Reload/outage recovery uses reads, not automatic repeat POSTs. A new
command clears an earlier success message. Worker status and disabled test
confirmation are visible in the existing operator provider surface.

Hosted configuration now supports opt-in fixed synthetic verification in the
staging worker only. It stays off by default. API/operator configurations reject
Gemini keys and private provider adapters; ordinary source/preparation/answer
provider dispatch remains disabled. `.env.worker-verification.example` is a blank
worker-only overlay contract, not a configured environment or deployment.
No real key was used, no hosted process was deployed and no external test ran.

## Evidence

- Focused actual-role queue/capability, authority, runtime and operator HTTP
  regression: 49 passed, no failure/skip, 39285.8959ms, session 21223 terminal 0.
- Two pure hosted configuration checks passed, including default-off worker-only
  opt-in, real/production refusal and API secret rejection. Typecheck passed.
- Initial full run `e5a1ff9f-47f0-459e-a77d-aa7dbc49c8bb` passed 1153 tests:
  1149 passed, zero failed, four native-prerequisite skips, 278879.1365ms, plus
  offline install/build and both evaluations. The saved completed report was
  revalidated after interruption. Its fixture and process handles were gone.
- Final full run `bfbca555-7889-49cc-bb77-291d1865bd77`, session 30114 terminal 0,
  2026-10-16 04:23:06-04:28:16 UTC: locked offline install/build, 1153 tests,
  1149 passed, zero failed, four native-prerequisite skips, 289429.0564ms.
  All 43 contract and ten scripted pipeline checks passed, with 24 scripted
  requests and zero external requests. 829 source files stayed unchanged:
  `331417d904eb627c72ea9b4b8cdc22c94e4192548e6f9b2f119fdac955de735e`.
- Final built browser journey: keyboard login, quota save, lost acknowledgement,
  receipt outage, pending reload, no stale success message, original receipt
  reconciliation, stopped-worker denial and keyboard logout. Exactly one test
  POST, one reserved slot, one in-process mock call and four receipt GETs. No
  customer API calls or external provider requests. See
  `artifacts/operator-worker-browser-2026-10-16.json` and its screenshots.
- Desktop 1440 and mobile 320 had no page overflow. The settled final screenshots
  are separate from the earlier interrupted 2026-10-15 captures. No full a11y,
  independent language or physical-device acceptance is claimed.
- Reticle had no connected browser and produced no passing verdict. Supported
  browser automation supplied the rendered evidence; no diagnostic upload ran.
  The owned final fixture was interrupted, its process/listener were verified
  absent, the owned tab closed and viewport reset. This is not a graceful fixture
  shutdown claim; the normal worker's local graceful drain is tested separately.

Catalog: 137 tables / 91 migrations. Application: 118 DML, 12 read-only, 7 hidden.
Worker: 98 full-DML tables plus the limited-column job table, 29 read-only, 9 hidden.
Operator: 19 some-write, 19 read-only, 99 hidden. Seven invoker functions / nine
guard bindings are inspected. No existing cloud roles or original data changed.

Preservation report `clean-backup-preservation-1f953f5c-1bc5-41b1-8395-23e77771589b.json`
matches all original eight table fingerprints, integrity OK / zero FK violations,
24 saved build manifests valid, 2518 selected files / zero configured-secret
matches. Private environment files remain ignored; both example Gemini keys are
blank and the worker example is disabled. Durable checkpoint:
`artifacts/production-verification-capabilities-checkpoint-2026-10-16.json`.

## Remaining Gates

- Independent heartbeat and bounded liveness during long awaited stages.
- Native 91 / three-login verified-TLS admission, concurrency, fencing and cleanup.
- Broader configuration-rotation, interruption, multiple-process and browser matrix.
- Separately authorized synthetic live and hosted acceptance, not real data.
- All broader privacy, backup, language, reference, a11y, device and release gates.
