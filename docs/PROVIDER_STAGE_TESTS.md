# Synthetic Provider Stage Tests

2026-10-10 checkpoint: dedicated technical test commands, not full M5 evaluation
or production readiness. All provider responses in this checkpoint were mocked.
Real worker data remains prohibited.

## Contract

Migration 066 extends the durable operator journal. The existing same-origin
`/api/ops/providers/verify` accepts an exact confirmed `provider-stage-verification`
command: UUID, stage, language and budget. Arabic/Urdu translation reserves two
global slots: fixed-source generation plus structured automated comparison.
English/Arabic speech reserves one: fixed-text generation plus strict nonempty
mono PCM16 16kHz WAV validation. Urdu speech and client content are rejected
before reservation. Inputs are versioned server fixtures, never worker content.

Testing requires explicit local synthetic credential runtime, server test config,
separate current operator session/context, global quota and dispatch permission.
Every dispatch rechecks authority/deadline; completion rechecks access/pause and
uses one database-time boundary to reject late evidence. Terminal journals and
command/config/fixture evidence are immutable. Uncertain/failed slots are not
refunded. Test cleanup requests are prohibited.

Receipts bind the author and exact command. Repeated delivery or explicit unchanged
retry reuses the operation without another inference. Pending receipts are read-only;
expired pending work is interrupted. Session-bound UI recovery resolves by receipt
GETs after reload. Selection changes reset consent; quota/test confirmations cannot
authorize each other's commands.

Current results privately match key/model/configuration and fixture version/hash.
Rotated config makes current tests untested without losing historical receipts.
Only bounded model/checks/output digest/audio length/timestamps/diagnostic codes
are projected. No generated text/audio, raw errors, operator identity, config/key
fingerprint or credentials escape. Scoped staff can read; inspection sends no
request. Disabled stages or mismatched models cannot be promoted.

## Evidence

Final focused command with approved disposable local socket access:

```text
node --test tests/provider-readiness.test.mjs tests/provider-stage-verification.test.mjs tests/provider-controls.test.mjs tests/operations.test.mjs tests/postgres-runtime.test.mjs tests/hosted-runtime.test.mjs tests/postgres.test.mjs tests/postgres-embedded.test.mjs
```

33 passed, zero failures/skips, 14.157 seconds: all four tests, exact requests/quota,
negative comparison/corrupt audio, transport uncertainty, replay/immutability,
rotation, late revocation/pause, expired pending work, scoped staff/HTTP separation
and existing runtime regression. Restricted HTTP execution had four loopback
EACCES failures; approved rerun passes. Early mock translation had an unrelated
`speech` field; corrected to the real schema. Denial assertion corrected to actual
`Forbidden`. Failed runs are not passes; authorization/assertions were not weakened.

Strict optimized build passes: index-5bxoc4S2.js 558.51 kB / 150.29 kB gzip;
62 shell hashes match. Existing chunk/dynamic-import warnings remain. No final
full-suite/release pass claimed.

Built disposable PGlite browser verifies Arabic translation with lost acknowledgement
and receipt outage/reload recovery, Arabic speech, confirmation separation/reset,
unsupported Urdu option, staff inspection and desktop/320px layout. Final build
script checked. At 320px, body width 305 and result rows have no containment overflow.
Terminal counts: zero external calls, three mock requests, two operations, three
accepted requests, one staff inspection, three operator POST deliveries, one lost
acknowledgement and one receipt outage. Trace shows two POST deliveries before the
outage but one translation reservation/inference pair; reload then reads receipts
with GET only. Speech accounts for the other operation/request. This proves replay
protection, not that a browser never redelivers a POST.

Fixtures stopped, tabs closed and viewport reset. Earlier recovery fixture passed;
a prematurely opened earlier-build fixture stopped at zero test writes and was
replaced after completed build. Reticle unconnected/no verdict. Screenshots:
artifacts/provider-stage-tests-desktop.jpg, provider-stage-tests-mobile.jpg and
provider-stage-tests-staff-desktop.jpg.

Main synthetic/email-disabled API intentionally restarted for the shared DTO;
eight selected business fingerprints match before/after, integrity OK/FKs zero.
Exact method/scope: artifacts/provider-stage-tests-preview-checkpoint.json.
Vite unchanged. No main business/provider/cloud/mail/deployment/real-data operation.

## Remaining Gates

These technical tests do not certify translation accuracy, spoken content,
intelligibility or safe work. Full pipeline, live account/region capabilities,
Urdu speech and approved real-data provider remain open. Neon Free/private R2,
TLS/proxy/restore/real concurrency, all-reference/device/a11y/security/performance,
fresh CI/release and handoff gates remain required.

Next major task: versioned multilingual evaluation runner/dataset for exact
question/rubric/model provenance with distinct false-match, false-clarification
and unassessable reporting. Local/mocked and authorized live evidence stay separate.
No real data or automatic external sends.
