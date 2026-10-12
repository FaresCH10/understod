# Language artifact inspection

2026-10-12: bounded full publication catalog/exact-version reading and shared
History/Languages/Responses selection now reach old versions beyond 100 without
loading every snapshot. Failed exact reads have truthful unavailable evidence,
not Missing fields or another version. See `PUBLICATION_HISTORY.md` for final
build/tests/browser evidence and remaining full-production gates.

2026-10-12: Text/Audio/Question/Glossary navigation, session-fenced exact copy
actions, current-versus-recorded terminology and a nullable-override preparation
repair now have local synthetic API/browser evidence. See `ARTIFACT_REVIEW_VIEWS.md`
for final counts, actual failures and unverified historical/reference/live gates.

Latest checkpoint: selected translation/audio regeneration controls now use exact
tab-local confirmed requests, server-verified eligible baselines and receipt recovery.
Lost acknowledgement/reload, Urdu failure/same-job retry, English audio-only commands,
immutable/auditor absence and Cancel/Escape/320px RTL have disposable browser evidence.
Full suite 325/322 pass/zero fail/three external skips; strict build passes.
See `TARGET_REGENERATION.md`. All live and full-reference/accessibility gates remain open.

Earlier checkpoint: optional Arabic/Urdu draft edits use revisioned review receipts,
automatic target/source/glossary checks and exact edited-text audio in the synthetic
PostgreSQL pipeline. Failure/automatic repair, interrupted accepted-save recovery,
320px RTL editing, other-target preservation and immutable/auditor restrictions have
browser evidence. Full suite 314/311 pass/zero fail/three external skips; strict build
passes. These earlier totals are historical.
See `TRANSLATION_EDITS.md`; the staff-playback-only checkpoint below is historical.

Current checkpoint: 2026-10-06. Staff private generated-audio playback is implemented
in the isolated PostgreSQL rehearsal; S11/S18 remain partial, not production-ready.

The scoped briefing DTO supplies owner/supervisor-only same-origin instruction and
question URLs after validating attached manifest/journal evidence. Current drafts
must be ready and match source, revision, review and glossary dependencies. Published
versions use their exact immutable snapshot, including superseded/withdrawn history;
this read does not reopen publication or submission rights. Auditor URLs are absent.

`GET /api/briefings/:briefingId/artifacts/draft/:revision/:language/:kind` and
`/artifacts/publication/:publicationId/:language/:kind` accept EN/AR/UR and body/question
only, reject query overrides, derive private object identity from scoped evidence,
verify actual WAV bytes, then freshly recheck staff role/session and version/dependencies.
Object reads take place outside database row-lock transactions. Responses are
no-store/nosniff/no-referrer. No arbitrary object IDs, external URLs or fallback speech.

The client accepts only URLs matching the selected briefing/version/revision/language
and both exact kinds. Native media controls use no preload, pause the other player,
cancel device preview, and stop on version/language/revision/URL/authority changes or
unmount. Load failure announces an alert and permits explicit reload without device
substitution. Synthetic provenance remains visible; stored audio does not certify
translation, speech alignment or safe work. Canonical device-demo preview remains
separately labelled and guarded, never used as a generated-audio fallback.

Verification: 21 generated-audio tests plus three language-model tests pass, including
actual credential HTTP, scope/role denials, stale dependency and post-read revocation,
corrupt bytes, frozen historical audio and strict client URL identity. Full suite:
307 tests, 304 pass, zero fail, three external PostgreSQL checks skipped. Strict
TypeScript/Vite build passes (main 498.25 kB / 133.91 kB gzip).

Disposable in-memory browser: owner ready draft instruction/question playback and
mutual exclusion, exact published selection and removal on switching to the unready
draft, storage-failure/reload without fallback, auditor absence of native audio/rubric
controls, 320px Urdu RTL text/audio and 1440px English geometry/playback. Document
widths 305/1425, player widths 269/505.5. Screenshots visually inspected in tool output,
not saved as new evidence files. Test tones prove playback only, not speech quality.
Disposable bootstrap uses synthetic sessions, not an authentication-UI proof. Ten
saved hashes match, integrity OK/FKs zero. Fixture stopped; viewport reset and QA tab
closed. Reticle unavailable; no verdict or full accessibility/reference gate claimed.

## Earlier checkpoint

2026-10-04 device-preview checkpoint below is historical and superseded for generated
playback, auditor browser evidence and current test totals.

The Languages view in briefing detail reads the existing scoped briefing DTO. It compares the current draft source/question/facts with stored English, Arabic or Urdu title/text/question. A version selector reads immutable publication snapshots instead of substituting current draft content. Draft version/revision/state and stored adapter provenance remain visible.

Coverage reports bounded field presence, missing/invalid values and missing/unverified/device-demo audio separately. It does not infer correctness, certify understanding, approve an artifact or introduce human signoff. Unsupported stored language codes are listed, not silently treated as supported. No new backend endpoint, database mutation or live provider call was introduced.

Device preview is allowed only for matching nonempty source evidence, the explicit synthetic-local-v1/live:false provenance, valid text/question and device-synthesis-demo marker. The browser must expose a matching language voice; no fallback to English for Arabic/Urdu. Selection, source/revision changes and unmount cancel speech. Obsolete utterance callbacks cannot change a newer preview's status. No private generated audio file, seek/speed or download is claimed. Arbitrary speech markers/URLs/objects never become playable media links.

Owner/supervisor affordances expose a collapsed private answer rubric. Workers do not receive this component or a new DTO; their existing private-safe content contract is unchanged. Auditor rubric absence is code inspection, not a browser persona check. Existing server-side staff DTO privacy policy has not been broadened by this view.

## Verification

- Full suite: 146 tests, 144 pass, zero failures, two external PostgreSQL checks skipped. Final focused tests pass after empty-source tightening; strict TypeScript/Vite build passes.
- Focused model checks cover EN/AR/UR, stale/empty source, missing/invalid fields, unsupported codes, unverified audio markers and exact base-language voice matching without modifying the stored object.
- Default SQLite browser: draft v4/revision 1, published v3 read-only, Arabic/Urdu selection and coverage inspected at 1440/320. Document widths 1440/305; RTL text widths remain inside their parent. Coverage table intentionally scrolls internally and has a named keyboard-focusable region.
- Arabic question preview starts and completes on the browser's available ar-EG device voice. Text preview cancels on switching to Urdu. No Urdu voice is exposed, so its preview controls are disabled. No audio-quality or translation-correctness claim. Stop-button click was not completed before the short utterance ended naturally.
- Screenshots: evidence/language-artifacts-ar-1440-2026-10-04.jpg and evidence/language-artifacts-ur-320-2026-10-04.jpg, visually inspected. Temporary viewport override reset.
- Eight persistent evidence hashes match the preceding crew-member checkpoint: publication, assignments, attempts, receipts, clarifications, audit, crews and memberships. No publish, answer/help/resolution, grant, import/export or directory mutation.

## Remaining

Target configuration, structured generation errors/progress, live preparation/evaluation and production publish readiness remain incomplete. Optional target edits rebuild the full bundle; separate selected regeneration reuses other-language evidence in the synthetic rehearsal. Private generated artifact storage/attachment/publication/playback is synthetic-rehearsal only. Remaining controls must use server-side transactions/jobs and actual artifact evidence, not browser-speech markers or a human approval queue. Native-language evaluation and full reference/accessibility audit remain open. Real worker data stays off Gemini free tier; database target stays Neon Free with no automatic paid upgrade.
