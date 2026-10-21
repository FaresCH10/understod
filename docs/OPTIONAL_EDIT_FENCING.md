# Optional Edit And Regeneration Fencing

Requirements: A06, S10-S13, S18 and S42. These remain OPTIONAL controls, not
human approval or a new publication gate.

## Implemented

- Source/question/facts/private asked-facts and translated edit controls now use
  the captured full staff authority through BriefingDetail and LanguageArtifacts.
- Target translation/audio regeneration and all review/regeneration receipt,
  explicit retry and expired-review verification calls use the scoped transport.
- Receipt reads are abortable and no-store; verify POSTs remain bounded and
  current-view checked. The existing exact hash, translation, revision and
  immutable-publication validators remain unchanged.
- Guarded completion rechecks after asynchronous validation before clearing
  saved records or invoking success/navigation/refresh callbacks. Changed or
  unmounted views cannot adopt the latest callback into another identity.
- A context denial is not a disposable business rejection. Earlier uncertain
  review outcomes survive a later known retry rejection, matching regeneration's
  existing retention behavior. Shared retention-policy tests cover that defect.
- Shared SQLite/PostgreSQL middleware requires matching context for optional
  review/regenerate POSTs, their receipt GETs and review verify POSTs. Ordinary
  private audio URLs still do not require a custom header from an audio element.

## Evidence

- Test-first route extensions failed on both backends (200 instead of required
  409 on review receipt GET), then pass after middleware enforcement.
- Full synthetic suite: 163 files, 866 tests, 862 passed, zero failed, four native
  database prerequisite skips, terminal exit 0, 297657.5534 ms. Log:
  `artifacts/optional-edit-full-test-2026-10-13.log`. This began before the final
  uncertainty-retention adjustment.
- Final affected four-file regression after that adjustment: 14 passed, zero
  failed/skipped, exit 0, 5111.7968 ms. Covers both HTTP backends, exact recovery,
  captured transport/async completion and earlier-uncertainty preservation.
- Final strict build: pass, 2038 modules, 579.56 KB entry; existing size/import
  warnings remain. All 68 shell hashes match. Eight protected SQLite fingerprints
  match, integrity OK, FK violations 0. All owned commands are terminal.
- Inline source rewrite was rejected by tool review; it made no source changes.
  Direct apply_patch edits succeeded without retrying or bypassing that method.
- No browser verdict added: the prior browser-runtime startup problem remains
  unresolved. No original restart/migration, external provider/mail/deployment
  operation or diagnostic upload occurred.

## Remaining

Rendered stale-view/Strict Mode/expiry/keyboard/RTL acceptance, independent
language/live audio checks, native database/device acceptance and full release
proof remain open. Billing, invitations, people/import/access, settings/privacy,
templates/glossary, reports/exports/notifications and App-owned callbacks still
need complete captured-context auditing and migration.

Task estimates: optional edit/regeneration boundary 75%, whole staff request
fencing 50%, overall production scope about 60% (55-65% uncertainty).
