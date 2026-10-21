# Application Cleanup Evidence Scope

2026-10-15. This implements the API/UI portion of the open
NEON_STORAGE_PRIVACY_GATE.md. It does not establish provider-history,backup,
device-cache or irreversible-erasure completion and does not enable real hosted
data or production rollout.

## Contract

Both SQLite and PostgreSQL privacy-directory items,deletion-detail receipts and
initial/duplicate request acknowledgements now include:

```json
{
  "cleanupEvidence": {
    "scope": "application_current_view",
    "providerHistory": "not_verified",
    "backups": "not_verified",
    "deviceCaches": "not_verified",
    "irreversibleErasure": "not_verified"
  }
}
```

This is a conservative projection of what existing application checks prove,
not a newly manufactured external receipt. It applies to old and new requests.
The existing `queued`/`complete` values,request IDs,original creation/completion
times,redaction/pseudonym records and immutable audit history are preserved.
No migration,new table,external attestation or completion timestamp is created.
Repeated GETs perform no cleanup or receipt rewrites. Exact-intent retries retain
their original identity and authority checks.

`server/deletion-scope.mjs` owns the shared projection. The browser validates the
exact evidence shape for directory/detail/acceptance. Missing or malformed scope,
private extra fields and unsupported `verified` assertions are rejected. Existing
stage/date/worker/request/actor/session checks remain. Directory bounds,unique
identities,stage/date consistency and private-field exclusion are also checked
before display. This is not proof against every future authority/account race.

The UI labels completion as application cleanup and separately displays the four
unverified categories. Confirmation and audio/generated/text/case/activity/
briefing retention wording now describe the current application/storage view,
not universal permanent erasure. Disabling a policy still does not restore
already removed application content. No new automatic deletion is introduced.

## Compatibility

API and UI builds must be rolled out together with normal version/session and
unsent-work protections. Strict older clients can refuse the additive response;
new clients refuse a response without the new scope. That is fail-closed,not a
silent downgrade or proof that a rolling release has already been tested.
Do not strip the scope or loosen response validation to hide version mismatch.
Original preview services/build assets are not restarted or replaced by this
local source change. Hosted configuration still rejects non-synthetic staging.

## Evidence And Limits

Fifteen focused local tests pass across receipt guards,scoped dual-backend HTTP,
request/audit rollback,access revocation,transcription/assessment/export races,
pseudonymization and completion idempotence. They assert the full new response,
not a subset that discards the added fields. Actual completion journals remain
byte-identical across repeated detail reads in both database fixtures.

The initial fresh run `4deefb4c-5094-460b-8bc5-875a507d6424` passed install/build
but failed one older exact-response expectation:1086tests/1081pass/one fail/four
skips,321634.5373ms. It remains a failed run. Its expected payload was updated to
strictly include all five scope fields;the final focused15-test group passes.

The next fresh run `5ca8c673-e3ac-481f-a83d-ffca8ca0f3f8` was interrupted.
After resume its tool handle was missing and OS process inspection confirmed no
clean verifier/test process remained;the log had stopped07:22:19UTC. Its
`running` journal is not a pass. One new independent verification run was started
only after that reconciliation. See current BUILD_STATUS.md for the final result.

Final fresh verification `40c75c5e-8e6b-468a-831d-d3cb4bdced31` passed,terminal0,
2026-10-15 07:33:41-07:38:14UTC:locked offline install/build,1086tests/1082pass/
zero fail/four native-prerequisite skips,256062.8081ms;43mocked contract and ten
scripted pipeline checks. All800 selected source hashes stayed stable. No cloud
configuration inherited or original data copied. This does not run live Neon,
GitHub/Linux CI or physical devices. Earlier failed/interrupted attempts remain
preserved,not relabeled as passes.

Built in-app-browser checks used the first fresh snapshot's unchanged runtime/
UI build and a disposable in-memory credential fixture on3186/3187. The final
source differs only in the corrected test expectation,not its runtime/UI.
Completed and queued receipts show distinct application stages plus four
unverified external categories. At1440px document width1425;at320px document
width305 and dialog width281. Dialog initially focuses Close,Shift+Tab wraps to
Cancel,and Escape closes with focus returned to Request worker deletion. Confirm
is disabled without authorization. The visible fixture evidence reports zero
deletion POSTs,two pre-created requests and untouched QA Worker New.

Screenshots:
- artifacts/privacy-cleanup-scope-desktop-2026-10-15.png
- artifacts/privacy-cleanup-scope-mobile-2026-10-15.png
- artifacts/privacy-cleanup-scope-dialog-320-2026-10-15.png

The Reticle lease connected but disconnected before its consequential check;
form-fill `no-fault` responses are not passes. Lease was released and session
yielded;no external diagnostic report was sent. The supported in-app browser
provided the later visible checks. The QA tab was closed,viewport reset and owned
fixture stopped;3186/3187 had no listeners on resume. This is not full AT,
native-language,physical-device,native cloud or deployment acceptance.

Provider-supported history/branch/backup disposition,independently verified
external evidence,restore/privacy-ledger integration and truthful final erasure
release accounting remain open. Do not make a final-erasure claim from this DTO.
