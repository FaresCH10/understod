# Six-Family Neon Application Storage Rehearsal

This is an isolated synthetic application test, not a switch of the running app,
hosted deployment or permission to send real worker data. It uses the dedicated
private Neon Free test bucket/settings in NEON_PRIVATE_STORAGE_TEST_SETUP.md.
No paid resource, access-level change, external database write, Gemini call or
real email is required. Actual live execution needs separate user authorization.

```powershell
node scripts/neon-application-storage.mjs --confirm-six-family-synthetic-storage
```

## Application Scope

The fixed credential/bootstrap pipeline creates a fresh in-memory PGlite database,
normal staff/worker sessions and a synthetic publication. It uses the actual
Neon application adapter, with a test-client wrapper adding only an ownership
marker to outgoing metadata. Normal application functions receive/read the
source, prepare translated speech, publish, receive/check an answer, deliver a
follow-up and receive/play a clarification voice reply. All provider responses
stay scripted; this is not live AI correctness or native PostgreSQL evidence.

The database's own private-object inventory must match exactly nine objects:

| Application family | Count |
| --- | ---: |
| Canonical source | 1 |
| Original source | 1 |
| Generated briefing/question speech | 4 |
| Worker answer recording | 1 |
| Generated clarification follow-up | 1 |
| Worker clarification voice reply | 1 |

All content is fixed generated tone WAVs with a strict four-hash allowlist;
each object is32044bytes,288396bytes total. Text, answers, credentials and rubric
are never uploaded to storage by this runner. Source-original is deliberately
a separate object/reference even though the synthetic input is already WAV.

The workflow checks source original/canonical playback and worker denial,
assignment scope,answer replay,follow-up scope,voice replay/exact receipt/
conflicting bytes/other-worker/auditor denial and revoked voice access. Original
answer counts/outcomes and immutable publication contents remain unchanged by
help/reply. These are backend function checks, not browser/hardware journeys.

## Storage And Cleanup Guards

- Require an explicitly isolated supported HTTPS branch endpoint, dedicated
  server-only storage credentials and an empty current-branch synthetic bucket.
  Ambient AWS/database/Gemini environment fields are not used.
- Only exact UUID application keys in one generated org/site scope may be used.
  Permit at most nine new objects; reject unrelated paths or arbitrary content.
  Before first PUT, require a definite404 and persist its exact expected key,
  size,hash and ownership marker intent. PUT retains the real adapter's
  `If-None-Match: *`,private/no-store cache policy and no public ACL.
- Require database/object-manifest equality,authenticated exact-byte readback,
  anonymous GET401/403 without credentials/redirects,duplicate conditional PUT412
  and unchanged bytes for every object. The real adapter sanitizes provider errors.
- On failure/interruption,cleanup does not retry the workflow. Check each exact
  attempted key's run marker,size,hash and full bytes before DELETE. Never sweep
  a prefix or bucket,delete unmarked content,change access settings or use a
  broad cleanup command. A lost delete acknowledgement requires definite404;
  unknown403/5xx is not absence. Changed ownership/bytes refuse deletion.
- Main requests have ten-second bounds within a three-minute main budget;
  cleanup has a separate two-minute budget and independent signals. SDK attempts
  are one. Interrupted or timed-out observation is not terminal process evidence;
  inspect the same process and saved manifest before considering another run.
- Checkpoint failure is fatal to further normal requests. Guarded cleanup still
  attempts to remove owned effects. A forced process kill can leave synthetic
  objects; reconcile exact saved keys/markers before a new run. Do not clear
  unrelated bucket contents to make the empty-bucket guard pass.

Evidence is stored in `artifacts/neon-application-storage-<UUID>.json`, including
the synthetic key/expected-hash ledger,phase,workflow report and per-object
cleanup. It never contains keys,private endpoint,raw provider errors or audio
bytes. Readiness,real data and native cloud-database verification remain false.

Neon DELETE is a current-branch soft deletion. Even a successful test with an
empty final listing does not prove permanent privacy erasure or removal from
branch history. Private-cloud backup/off-host custody,branch-history accounting,
normal retention/deletion end-to-end behavior,full native/hosted integration and
production release remain separate gates.

## Local Evidence

`artifacts/six-family-pipeline-2026-10-15.json` passes ten application checks,
nine private objects across all six families,24 scripted requests/zero external
requests and15 worker-role task invocations. Its SHA256 is
`3204fb96bba817b62f8483c9f314658ddfbe97c648670921f88c910ff86db75e`.
It uses private memory storage,not the cloud.

The runner/adapter/pipeline/probe focused group passes34 tests. The first
combined restricted run passed33 and failed the existing temporary-file config
import on Windows EPERM; the approved rerun passed unchanged. The initial
runner-only test also exposed a checkpoint-write fault being recoverable like
a lost upload acknowledgement; journal failure is now sticky and stops normal
I/O while preserving guarded cleanup. These failures are not counted as passes.
Mocked S3 coverage is not live Neon evidence.

## Executed Live Evidence

The user explicitly approved the nine-object/six-family run. Actual live evidence:
`artifacts/neon-application-storage-8eaa619c-eada-4fda-88be-231719897356.json`,
terminal exit0,finished2026-10-15 06:55:11UTC. All ten application workflow checks
passed. Each of the nine objects passed authenticated byte readback,anonymous
denial,conditional PUT412 and unchanged bytes. Each exact ownership-marked object
was removed from the current branch; final bucket inventory was empty. No cloud
database writes,external AI/mail calls,real data,billing changes,application
configuration switch or deployment. PGlite/worker-role and scripted provider
limits above remain; this is not native PostgreSQL plus cloud storage together.

After the live pass,the initial journal label changed from conservative `failed`
to `checking` until terminal evidence is known. A local assertion covers this
observability correction; it changes no storage request or acceptance condition.
The live result is not silently relabeled as a second run.

Final source runner-only10tests pass. Fresh clean snapshot
`99f90eb2-717a-4e05-ba7a-14af3522d0bc` passes locked offline install/build,
1084tests/1080pass/zero fail/four prerequisite skips,263373.657ms,43mocked
contract and ten scripted pipeline checks,798stable source files. It inherits
no cloud settings and copies no original application data. Live storage and
offline regression are distinct evidence scopes. See CLEAN_VERIFICATION.md.

The read-only provider/privacy investigation is recorded in
NEON_STORAGE_PRIVACY_GATE.md. No final erasure or real production permission
is inferred from this passing test.
