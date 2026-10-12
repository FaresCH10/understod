# Retention implementation

Latest 2026-10-11 09:28 UTC: encrypted PostgreSQL/full application-schema plus
six-family private-object backup and isolated restore are implemented, with exact
inventory verification, retired-object absence and audit-atomic access quarantine.
Physical embedded restore/54 regression passes are not native Neon/R2 proof.
Restore has no activation path: authoritative post-backup privacy requests and
now-elapsed policies still require executable reconciliation before any release.
That is the next major task. Broader briefing/activity retention remains open.
See POSTGRES_BACKUP.md; existing backup/device erasure limits still apply.

Latest 2026-10-11: generated briefing audio now has its own confirmed/default-disabled
PostgreSQL policy, exact scoped recovery, retirement and verified-absence cleanup
records (072). Current version expiry is explicitly confirmed; immutable snapshots
and text remain. Desktop/320px built-browser recovery/save/disable verified after
fixing long-command overflow. 49 focused checks and a later 24-check cutover/
retention run pass; no live/cloud verdict. GENERATED_AUDIO_RETENTION.md records
evidence/limits. Full DB/object restore and broader content/activity scope remain.

Current 2026-10-11 checkpoint: separate confirmed PostgreSQL response-text and
resolved-case policies now have settings and exact receipt recovery. Case text
expiry preserves open cases, outcomes and minimal provenance; physical voices
remain retryable. Related suite: 52 passed; final review/read-model checks: 13
passed. Disposable desktop/320px browser verification and explicit disable passed;
no Reticle/live/cloud verdict. See TEXT_RETENTION.md and CASE_RETENTION.md.
Generated briefing audio, broader activity/briefing retention and full relational/
object restore remain open. Earlier checkpoints below are historical.

Current 2026-10-11 response-text foundation: a separate default-disabled PostgreSQL
policy/API and scheduled transactional redaction now cover answer text, assessment
quotes and recording transcripts, preserving outcomes and provider hashes.
Related stored exports expire; late/requeued assessment cannot restore content.
Forty-two focused checks pass. Settings UI/recovery/browser verification and
broader clarification/activity/briefing/generated-audio retention remain open.
See TEXT_RETENTION.md. The audio-policy/history descriptions below remain separate.

The current policy controls raw worker recordings in server storage. No policy is enabled by default. Site owners and administrators can explicitly confirm 7, 30, 90 or 365 days. Reads permit active scoped staff; writes revalidate the role, site, current revision and immutable request receipt. Reusing a request ID with changed inputs fails.

SQLite and PostgreSQL workers queue expired recordings, invalidate their processing lease and deny future playback before removing the object. Local files and private R2 use the existing idempotent removal interface. The cleanup record remains queued on storage failure and retries with bounded exponential delay. Expired cleanup leases can be reclaimed; only the current token can finish the job. Successful completion has an immutable cleanup record and audit event. No transcript or response outcome is deleted by the audio policy.

The settings screen shows the actual configured policy and cleanup counts. Save requires an explicit acknowledgement. Before sending, it retains the exact request in scoped tab-local storage. Reload checks its immutable receipt read-only and clears only an exact match; absent receipts permit an explicitly confirmed retry of the original request. Corrupt storage, a mismatched receipt or a failed receipt read blocks new saves until resolved. Session switch/sign-out clears the existing `understood:` storage namespace.

Native backup/restore and synthetic SQLite-to-PostgreSQL import preserve cleanup records. New backups omit recordings already queued for cleanup, so a restored database cannot restore their raw audio. Restored in-progress cleanup leases are requeued. Older backups can still contain audio; this policy does not erase them or disconnected device copies.

Verification in this checkpoint:

- Five repository checks cover SQLite and embedded PostgreSQL scope, confirmation, revision/replay, failed private removal, playback denial, lease fencing, immutable completion and cleanup/revocation during storage reads.
- Two backup/restore checks pass, including a real synthetic WAV that is removed and remains absent after isolated restore.
- Five PostgreSQL import checks pass. A dedicated cutover case preserves completed and interrupted purges and their policy receipt, omits their audio from backup, clears the interrupted lease, and resumes cleanup on the imported database.
- The corrected migration, HTTP and runtime subset passes 22 tests; migration 026 executes in embedded PostgreSQL.
- The broader PostgreSQL domain and retention run passes 44 tests, including private playback and recording-worker behavior. The subsequent account-revalidation edit is checked separately on affected playback paths.
- Strict TypeScript/Vite build passes. The running local screen renders with an unconfigured policy and disabled Save. At 375px the measured content width is 360px; mobile screenshot capture was incomplete, so complete visual approval is not claimed.

Remaining S36 work: activity/transcript retention and pseudonymization, authorized worker deletion requests with full relational/job/export cleanup, generated briefing audio policy, retention holds, browser lost-acknowledgement recovery verification, private object backup/restore, real PostgreSQL concurrency and full accessibility/reference verification. This is partial implementation, not a completed privacy workflow or compliance certification.

## Worker deletion foundation

Repository-only acceptance is implemented for SQLite and PostgreSQL (migration 027). An active scoped owner or administrator must confirm the current worker label and a bounded reason. Immutable receipts retain a fingerprint rather than a second label copy. Acceptance atomically disables the worker, revokes grants/sessions and appends an audit event. Exact replay is idempotent; conflicts, changed labels and unauthorized scopes fail. A database fence prevents reactivation after acceptance, including after synthetic cutover.

The existing leased audio cleanup worker also selects recordings belonging to deletion requests, irrespective of age or configured retention policy. Active staging writes are excluded until their storage reconciliation settles; failed unreceived rows can then be cleaned. Object failure remains retryable. Audio completion is not overall deletion completion.

This foundation has no HTTP route or UI yet and reports only queued requests. Transcript/help/export/import cleanup, pending-job cancellation, pseudonymization, auditable final completion, receipt recovery and end-to-end controls remain required before exposing the workflow. No existing project worker has been submitted for deletion.

Deletion acceptance now also cancels recording leases, clears stored recording transcripts and blocks unfinished PostgreSQL assessment jobs in the same transaction. Staging writes remain under their existing reconciliation lifecycle. Tests inject deletion inside SQLite transcription and PostgreSQL assessment callbacks: late completion cannot restore transcript/result data or schedule a retry. Attempt text, assessment evidence, help notes, exports and import snapshots still require the separately audited database cleanup stage; cancellation is not final deletion.

Stored report exports created before a deletion request for a worker in their publication are now expired on access or during the export worker sweep. CSV, snapshot and checksum are cleared, leases are cancelled, and `export.deletion_purged` records the reason. Migration 028 allows this narrow early purge without permitting changes to immutable request identity or expiry metadata. PostgreSQL rendering completion rechecks the deletion condition before committing output. Tests cover a ready SQLite download, deletion during PostgreSQL rendering, one-time audit and preservation of an unrelated publication export. New exports and other personal data remain part of the unfinished full deletion workflow; no complete-deletion claim is made.

Saved import previews created before a deletion request and containing its current worker label are expired on access or during the import sweep. Rows and errors are cleared and `workers.import_deletion_purged` is audited once. Matching uses the organization's unique worker label, including saved previews in another site of that same organization; other organizations and unrelated labels are excluded. Migration 029 permits only the narrow early snapshot purge while keeping request identity immutable. Expired previews cannot be confirmed. Labels must not be pseudonymized before this cleanup stage finishes, or matching would lose the original reference. Filenames, content digests and other retained import metadata still require the final minimization audit; this is not a complete erasure claim.

The deletion/import/migration HTTP and cutover subset passes 18 checks after migration 029. The previous 339-pass full suite predates this migration and remains historical evidence.

## Relational Content Redaction

Migration 030 and the SQLite equivalent add an immutable, scoped redaction-stage receipt. The worker waits for all referenced recordings to have completed audio purges and for affected pre-request export/import snapshots to be cleared. It then atomically replaces accepted answer text and original help text with `[Deleted]`, empties assessment reasons/evidence and clarification notes, replaces clarification reasons, and appends `worker.content.redacted`. IDs, timestamps, historical outcomes, assessment state, case status and relationships remain unchanged. This is pseudonymous historical metadata, not proof of understanding or full deletion.

Existing immutability triggers allow only this narrow content-removal shape for assignments belonging to a persisted deletion request. They reject restored private content and changed historical outcomes. An audit failure rolls back every content update and the stage receipt; retry is idempotent. Native and PostgreSQL workers invoke the stage after snapshot/audio cleanup. Synthetic cutover preserves its receipt and redacted text. The importer also converts legacy SQLite object-shaped reasons/evidence into PostgreSQL's separate arrays without dropping non-redacted evidence.

Full suite after these changes: 345 tests, 342 passed, zero failed, three external PostgreSQL checks skipped. Strict build passes. Worker-label/legacy-reactivation pseudonymization, import metadata minimization, final completion verification and end-to-end API/UI remain unfinished. No existing worker was submitted for deletion or redacted.

## Legacy Reactivation Labels

Migration 031 and SQLite's equivalent permit only replacing a requested worker's legacy reactivation `expected_label` with `[Deleted]`. Receipt identity, organization/site, worker/crew, actor and occurrence date cannot change; deletion of receipts remains forbidden. The existing bounded deletion worker removes these copies independently of audio completion, with an atomic `worker.reactivation_labels.redacted` audit. Audit failure restores the label; subsequent sweeps do not duplicate that event. Old accepted reactivation requests cannot replay after worker deletion acceptance because the repository checks deletion before its receipt lookup.

Verification: 22 affected tests pass; the complete synthetic suite finishes with 347 tests, 344 passed, zero failed and three external PostgreSQL skips. Strict build passes. Current worker labels and remaining import metadata are not yet minimized; this is still a queued, repository-only workflow, not a completed erasure or production-readiness claim.

Follow-up: database insert guards also reject new worker reactivation receipts after deletion acceptance. A native backup-to-PostgreSQL cutover test preserves sanitized legacy labels without reviving old receipts. The affected 22-test subset passes after these final guards; the preceding complete suite predates the follow-up. SQLite only upgrades the legacy update trigger when needed, avoiding repeated schema changes during worker sweeps.

## Import Metadata Minimization

Migration 032 and the SQLite upgrade replace a deletion-matching import filename with `[Deleted].csv`, preserving a SHA-256 digest only for exact filename replay comparison. Body digests and request identity remain unchanged. Matching uses the same organization's current worker label in parsed rows or as a literal substring of the filename. It includes files uploaded after deletion acceptance and filenames retained by earlier TTL-expired imports; it does not touch another organization or unrelated imports. Matching later uploads return an expired, empty receipt rather than usable previews. Once minimized, a receipt cannot restore its filename, clear its digest or become usable again.

Row/error removal, filename minimization and deletion audit commit together. Injected audit failures roll back all fields; original filename/body replays still reconcile, while changed inputs conflict. Synthetic native backup-to-PostgreSQL cutover preserves the minimized filename and digest, and legacy backups without the new nullable column remain supported. Redaction prerequisites now include matching filenames and post-request imports, not just older parsed rows.

Full synthetic verification: 349 tests, 346 passed, zero failures, three external PostgreSQL skips (72.08 seconds); strict build passes. No connected Reticle session or browser deletion verdict. Digests and stable relationships are pseudonymous metadata, not anonymous data or a legal erasure certification. Current worker-label pseudonymization, new-export serialization, final completion verification, public API/UI, holds and external restore/concurrency remain unfinished. No existing local worker deletion was submitted.

## Worker Identity Pseudonymization

Migration 033 and SQLite's equivalent add immutable scoped pseudonym-stage receipts. The worker waits for content redaction, all raw recording purges, cleared affected export/import snapshots and filename copies, sanitized legacy reactivation receipts and revoked worker access. PostgreSQL also checks pending assessment jobs are complete or blocked. It then reserves the original worker code by SHA-256 digest, switches the inactive worker to an opaque `Deleted <UUID>` label, removes crew membership and appends `worker.identity.pseudonymized` in one transaction. Audit failure restores the original label and membership; retries do not duplicate the event. Stable IDs, relationships, timestamps, language and historical outcomes remain pseudonymous metadata.

Worker identity is frozen from request acceptance; only the exact stored pseudonym can replace the current label. Old codes remain organization-reserved to prevent ambiguous identity reuse or restored private labels. New CSV previews containing a reserved code in rows or filenames are refused without persisting that text. Filename checks enumerate only bounded substrings and compare digests. Matching PostgreSQL worker rows are locked in a stable order before reservation checks; SQLite performs validation inside an immediate write transaction. Exact earlier expired import acknowledgements still reconcile without restoring their text.

New exports for affected publications are unavailable while identity cleanup is pending. PostgreSQL export creation locks audience worker rows before checking deletion or taking the snapshot, serializing against request acceptance and the identity switch. Previously accepted exports stay expired; fresh exports after pseudonymization retain history with the opaque label. All still-live pending-stage exports, including later legacy copies, are eligible for purge.

Synthetic native backup-to-PostgreSQL cutover preserves pseudonym receipts, reservations and opaque labels. Verification: 351 tests, 348 passed, zero failed, three external PostgreSQL skips (78.18 seconds); strict build passes. This is a stage receipt, not overall deletion completion: the acceptance API still reports queued. No public deletion endpoint/UI, fresh browser verdict, real PostgreSQL multi-connection race proof, holds or external DB/object restore claim. Older independent backups and cached devices are not remotely erased. No existing local worker deletion was submitted.

Follow-up verification adds Arabic/supplementary Unicode digest matching, the worker-label length bound and organization-isolated code reuse. All nine focused pseudonym/cutover checks pass; the implementation is unchanged from the preceding full suite.

## Verified Server Completion

Migration 034 and the SQLite equivalent add immutable scoped completion receipts. The worker checks inactive opaque identity, revoked grants/sessions, removed crew membership, cleared recording transcripts/leases, completed audio purges, redacted response/help/clarification content, sanitized legacy receipts and cleared original-label snapshot copies. PostgreSQL also checks assessment jobs are complete or blocked. It verifies each private object is absent through the configured storage adapter, then rechecks database prerequisites after external I/O before recording the receipt and `worker.deletion.completed` audit atomically. Missing verification support, an existing object, a permission/timeout error or an intervening access change cannot complete the job. PostgreSQL final writers take a request-scoped advisory lock before the recheck. This has embedded PostgreSQL coverage, not proof of external multi-connection behavior.

Local file existence is checked on disk; R2 uses a scoped, bounded HeadObject operation and accepts only an HTTP 404 as missing. Other provider errors are redacted and leave completion pending. Tests cover retained objects, unavailable checks, permission errors, changes during I/O, audit rollback, immutable receipts and repeat-safe completion. Synthetic backup/cutover retains the final marker without restoring old labels or content.

GET/POST `/api/people/workers/:workerId/deletion` is owner/admin-only and site-scoped. POST requires the exact current worker label, immutable UUID request identity, a bounded reason and explicit confirmation. Exact acceptance replay returns queued or complete according to the final receipt. GET returns null before a request, then only request identity/reason and stage dates/status, without the original label, reservation digest or credentials. Private HTTP tests cover origin, authentication, cross-site access, changed inputs and replay.

The worker-detail control is available to authorized directory owners. It checks status before offering a command, requires confirmation, displays queued/completed stage evidence and supports manual read-only refresh. An uncertain submission disables another command; reopening/reloading performs no POST. Queued requests cannot be re-enabled through that control. A disposable in-memory browser fixture verifies confirmation gating/cancellation, existing queued/completed receipts and mobile fit without submitting a destructive browser action. Full interrupted-submission browser coverage and administrator privacy-settings entry remain unfinished.

Final verification at this checkpoint: 357 tests, 354 passed, zero failed, three external PostgreSQL skips; strict TypeScript/Vite build passes. Reticle has no connected session and provides no verdict. Screenshots: `artifacts/deletion-ui/confirmation-desktop.jpg`, `confirmation-mobile.jpg` and `completed-mobile.jpg`. No existing local worker deletion or policy was submitted, and the main service was not restarted. The preceding stage-only completion statements are historical.

Completion means verified cleanup of the configured application's server storage at the recorded time. Stable pseudonymous relationships/audit metadata remain; old independent backups and device caches are not remotely erased. This is neither anonymous data nor legal erasure certification. Holds, external concurrency/restore and the remaining full-production gates are still outstanding.

Follow-up: both HTTP backends pass an injected lost acknowledgement after the acceptance transaction commits. A read-only status lookup recovers the original request UUID and exact replay remains duplicate-safe. Application implementation is unchanged from the preceding full suite. After the requested checkpoint pause, absent main-service handles/listeners were reconciled and the updated synthetic preview started on 3020/3021. Read-only saved-data checks before and after launch show integrity `ok`, no foreign-key errors and zero deletion requests (zero completion markers after launch). No saved worker was submitted for deletion.

## Administrator Privacy And Recovery

Authorized owners and administrators can now find workers from privacy settings without obtaining broader directory-edit authority. GET `/api/privacy/workers` returns only scoped worker identity, active state and deletion dates/status. Literal code/ID search, state filters and stable bounded paging work past 100 records; anonymous, supervisor and foreign-site access is denied.

Client status validation requires the selected worker, valid immutable request identity and consistent stage evidence. Completion cannot render from a missing pseudonym/content marker. Acceptance validates the exact submitted UUID. After a failed or uncertain submission, no automatic retry occurs: a successful read showing no receipt permits an explicit retry of the original in-memory body, with fresh confirmation and a locked reason. Reload only reads status; it does not persist or resend that in-memory body. Existing receipts close the command and show the server's queued or completed state.

Disposable browser rejection QA proves two explicitly submitted bodies were identical, with no additional POST after refresh, cancellation or reload. Both were intercepted before any deletion write; the target remained active and the fixture retained only its two setup requests. Actual HTTP connection-loss-after-commit recovery remains a separate tested scenario, not a browser claim. Administrator queued/completed screens, disabled confirmation and 390px layout are verified. Evidence: `artifacts/deletion-ui/admin-privacy-mobile.jpg`, `admin-privacy-mobile-viewport.jpg`, `admin-confirmation-mobile.jpg`. Full suite: 359 tests, 356 passed, zero failed, three external PostgreSQL skips; strict build passes. No existing saved worker or policy was changed. Reticle has no passing verdict; external concurrency, independent restore and broader production gates remain outstanding. Legal holds are a separate policy decision rather than an assumed specification requirement.

## Pre-Recording Notice

The worker recorder now displays English, Arabic or Urdu notice text before the microphone command. It distinguishes memory-only unsent audio (leaving/reloading can lose it), explicit sending, private authorized-staff review and synthetic versus configured AI processing. It directs workers to their supervisor for retention/access/deletion policy rather than inventing a fixed period. Backup/disconnected-device limitations remain explicit. This is information, not legal-consent certification or an offline guarantee. The initial standard-only checkpoint below predates site configuration.

Disposable synthetic browser evidence verifies EN/AR/UR at 390px and Urdu at 320px/desktop without microphone permission or audio upload. Screenshots are under `artifacts/deletion-ui/recording-notice-*`. Latest full suite: 360 tests, 357 passed, zero failed, three external PostgreSQL skips (72.64 sec). Strict build passes with a 501.68 kB main-chunk warning. No real data/provider call or saved-policy change occurred.

## Site Recording Notice

GET/POST `/api/privacy/recording-notice` returns active-site settings to authorized staff and only the current worker's preferred-language text to that worker. Owner/administrator writes require all three bounded EN/AR/UR texts, explicit review confirmation, the current revision, a request UUID and the exact original organization/site/actor scope. Empty text in all three languages removes custom wording but not the standard notice. Origin, authentication, current authority, unsupported fields and foreign scope are checked; DTOs do not include credentials or another language's text for workers.

SQLite and migration 035 provide current configuration plus immutable request receipts. Policy, receipt and audit commit atomically. Exact original replay reconciles without overwriting a later policy; changed UUID intent conflicts. PostgreSQL serializes request identities and site revisions; embedded tests cover rollback and injected lost commit acknowledgement. Real multi-connection PostgreSQL concurrency is not yet verified. Native synthetic backup/cutover preserves the policy and receipts; customer wording and independent production restore remain gates.

The editor persists exact tab-local pending intent before POST and checks its original-actor receipt after an uncertain result or reload. A null receipt only enables a fresh explicit confirmation and retry with the same body. Loading, unavailable storage, malformed receipts or a changed site/actor cannot silently save. Reload/refresh never POST automatically. The worker fetches the authoritative notice before microphone activation; failure disables recording until a validated retry. Custom wording is rendered as plain text with preserved line breaks, not HTML.

Disposable browser QA verifies owner/admin editor reads and confirmation gating, rejected-save draft locking, exact two-attempt replay and reload without automatic POST. The intercepted attempts did not write a policy: revision remained 1. EN/AR/UR language-specific worker display, literal `<script>` text, failed-read gating/recovery, 390px and Urdu 320px/desktop fit pass without microphone permission or sending audio. Screenshots: `artifacts/deletion-ui/site-notice-admin-mobile.jpg`, `site-notice-failure-mobile.jpg`, `site-notice-en-mobile.jpg`, `site-notice-ar-mobile.jpg`, `site-notice-ur-narrow.jpg`, `site-notice-ur-desktop.jpg`. HTTP/repository tests, rather than browser evidence, cover actual after-commit receipt recovery.

Latest complete synthetic suite: 365 tests, 362 passed, zero failed, three external PostgreSQL skips (75.18 seconds); strict build passes, main 506.10 kB / 136.15 kB gzip with a chunk warning. The updated main preview loads the notice API with no configured policy. Existing selected data hashes match before/after restart, database integrity is ok, foreign-key errors zero and notice/deletion ledgers remain empty. No existing policy or worker deletion was submitted. Completion estimate approximately 61%, not a legal/privacy or production-readiness certification. Customer notice review, activity/transcript/generated-audio retention, durable offline/device isolation and broader deployment/security/accessibility gates remain unfinished.
