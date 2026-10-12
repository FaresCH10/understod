# Typed Answer Assessment

Migration 065 connects the existing durable typed-answer worker to an optional
Gemini handle. With no explicit opt-in, the runtime retains its labelled canonical
synthetic evaluator; unsupported facts return unassessable, never a generic pass.
When Gemini is selected, failures cannot fall back to that evaluator.

For an isolated LOCAL synthetic credential rehearsal only, use
`UNDERSTOOD_ASSESSMENT_ADAPTER=gemini-free` and
`UNDERSTOOD_SYNTHETIC_ASSESSMENT_HASHES` containing exact independently reviewed
synthetic input fingerprints. A fingerprint includes answer, translated question,
asked facts, assignment language, publication ID and version. Changing any input
requires new authorization in the private server configuration. Global and tenant
provider request quotas must also be explicitly enabled. A key alone enables
nothing. Hosted staging/production, real data, wildcard/empty/duplicate/oversized
allowlists are rejected. Never connect this rehearsal to real worker records.

Keep the adapter disabled while identifying a known synthetic pending answer.
Set scoped `UNDERSTOOD_REHEARSAL_ORG_ID`, `UNDERSTOOD_REHEARSAL_SITE_ID`,
`UNDERSTOOD_REHEARSAL_ATTEMPT_ID` and `UNDERSTOOD_FINGERPRINT_SYNTHETIC=true`,
then run:

```powershell
node scripts/postgres-rehearsal.mjs assessment-fingerprint
```

The maintenance-only transaction is repeatable-read/read-only. It prints only
version, language and fingerprint, not answer/question/rubric. It is not a public
route and makes no provider call or business write. The confirmation is an operator
assertion, not a personal-data detector. Independently inspect fixture provenance
before allowlisting. Do not hash arbitrary customer content as a way to authorize it.

## Dispatch And Evidence

One request is reserved per assessment attempt. Immutable provider evidence stores
input hash, model, adapter/prompt/schema IDs and HTTP accepted/rejected/uncertain
state, never the input text or key. The completed job points to the exact scoped
operation that supplied its result. Request allowance is rechecked at actual
dispatch; pending attempt, active worker, frozen input, tenant/global/provider
controls and current lease are checked before reservation, dispatch and attachment.
Provider HTTP acceptance is not validation or correctness of its answer.

Evidence quotes must be exact answer substrings and cover every asked fact before
a match can commit. Invalid or uncertain results cannot create a false match.
Transport/schema errors retry at most three times under new bounded leases;
uncertain calls remain conservatively charged against request quotas. Once failed,
an operator must explicitly request retry. An unallowlisted input is blocked before
any provider request; a separate operator can explicitly requeue it after reviewing
synthetic configuration. Requeue does not alter the allowlist, grant content access,
or bypass worker/deletion/tenant/quota checks. Exact retry-command replay does not
reset an already running/completed assessment.

Received answer and receipt are durable before checking. Assessment uses the
accepted assignment's published rubric, not a later draft. Already accepted
historical answers can be checked after withdrawal; new answer acceptance remains
closed. Original timestamps, receipt ordering, attempts and assignment-based counts
remain unchanged. A clarification/unassessable result creates one case, except a
supervisor-requested repeat remains attached to its original case without resolving
or duplicating it. Completed outcome/evidence remain immutable.

## Evidence And Limits

Disposable embedded PostgreSQL/mock-provider tests cover noncanonical numbers and
locations, exact frozen question/rubric, read-only fingerprint, private provenance,
receipt replay, malformed evidence, empty reasons, uncertain transport, bounded
retry, closed quota, tenant/worker revocation, provider pause and expired lease.
The English/Arabic preparation fixture now generates private speech, publishes a
carton/bay briefing and checks an Arabic typed answer after a later draft edit.
Mocks are contract evidence, not native-language accuracy or live inference proof.

Real Gemini calls, approved real-data processing, full multilingual speech (including
Urdu), actual PostgreSQL multi-process races, cloud deployment, browser/device and
complete release checks remain open. Reticle is unconnected/no verdict. No saved
main workspace business data, live provider, cloud account or real worker is used
by these tests. See PREPARATION_PIPELINE.md and RECORDING_PIPELINE.md for the other
independently gated worker stages.
