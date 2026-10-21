# Invitation Request Fencing

Requirements: A06, S42 and staff invitation/access workflows. Boundary estimate:
**75%**. Whole staff request fencing: **65%**. Overall: **about 60%** (55-65%
uncertainty), not production readiness.

## Task Checklist

| To-do | Progress | Acceptance evidence |
| --- | ---: | --- |
| [x] Capture list/issue/resend/cancel/receipt/retry authority | 100% | Shared bounded private transport and context-keyed invitation view |
| [x] Guard async receipt completion and saved-record cleanup | 100% | Exact request signature rechecked; changed/held authority preserves recovery |
| [x] Require captured context before server invitation side effects | 100% | Test-first failures on both backends, then local HTTP deny/snapshot proof |
| [x] Preserve private receipts and queued-email semantics | 100% | Recipient digest/action/revision matched before cleanup; no raw bearer link |
| [x] Verify local regressions/build/preservation | 100% | Focused 40 plus neighboring 14 tests pass, strict build/69 shell hashes/eight original fingerprints |
| [x] Full post-invitation synthetic regression checkpoint | 100% | Later People checkpoint: 868 passed, zero failed/four native skips, exit 0 |
| [ ] Rendered stale-view/Strict Mode/focus/recovery acceptance | 0% | Windows browser runtime is unavailable; no rendered verdict |
| [ ] Native PostgreSQL, hosted mail and operational acceptance | 0% | Embedded and mocked mail proof does not certify native or external delivery |

These rows overlap and are not a numerical average of feature completion.

## Contract

- Existing `StaffRequestAuthority` is propagated from the real application caller
  to list, form and recovery views. Every request retains its original session;
  requests never adopt a later account into an old view.
- Reads are bounded, no-store and abortable. Directory data is cleared during
  refresh; aborted/stale completions cannot install rows or announce errors.
- Mutations are held during session verification. Success requires the existing
  acknowledgement checks plus an exact read-only receipt lookup proving action,
  target, normalized input, recipient digest and revision. Missing/invalid receipts
  preserve the saved request. Retry is explicit, never an automatic repost.
- Completion checks current authority after asynchronous digest validation and
  before clearing recovery or invoking callbacks. Cleanup verifies the saved
  request signature again, not just its request ID. A changed intent is retained.
- Shared middleware requires context on `/api/settings/invitations` routes. Public
  invitation preview/acceptance routes are not folded into staff context policy.
  Existing cookies, origin, role/site/account epochs, immutable replay and one-use
  token/mail protections remain unchanged.
- An accepted invitation request means email was queued. It does not claim inbox
  delivery, automatic account acceptance or successful sign-in. No live external
  mail or provider operation was performed.

## Evidence

- New missing-context HTTP assertions failed first on SQLite and embedded
  PostgreSQL (200 instead of 409). Both now reject absent/malformed/foreign context
  before invitation/receipt/mail/token/audit or existing ledger side effects.
- Six-file focused regression: 40 passed, zero failed/skipped, exit 0,
  13121.3507 ms. Includes exact changed-intent cleanup denial, held/changed authority
  during async receipt validation, encrypted mail, resend/cancel/expiry, one-use
  acceptance, current roles, exact replay and atomic audit rollback.
- Neighboring four-file regression: 14 passed, zero failed/skipped, exit 0,
  7946.4197 ms, including restore quarantine/cutover and both billing backends.
- Strict build: 2039 modules, 579.75 KB entry. Existing chunk and mixed dynamic/
  static offline-import warnings remain. All 69 shell hashes match; eight original
  SQLite fingerprints match, integrity OK, foreign-key violations zero.
- Earlier full suite: 163 files, 870 tests, 866 passed, zero failed/four native
  skips, exit 0. It ran after billing but BEFORE final invitation changes.
- Later combined full suite after invitation and directory source changes:
  163 files, 872 tests, 868 passed, zero failed/four native skips, terminal exit 0,
  314317.7437 ms. See PEOPLE_REQUEST_FENCING.md and its checkpoint artifact.
- All owned commands are terminal. No original restart/migration or external
  diagnostic upload occurred. Browser startup failure is recorded in the preceding
  billing checkpoint; no new browser/native/deployment verdict is claimed.

## Remaining

Rendered stale-view/Strict Mode/focus, complete language/a11y/device acceptance,
native roles/TLS/concurrency, authorized hosted/mail rollout and full release
acceptance remain open. Workers/import/access, workspace/settings/privacy,
glossary/templates, reports/exports/notifications and App-owned callbacks still
need separate request-fencing migration. No real content may go to Gemini Free.
