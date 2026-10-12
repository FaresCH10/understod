# Draft Generation Languages

2026-10-08 18:20 UTC checkpoint. Synthetic implementation only, not live-provider or production approval.

New briefings can use site defaults or explicitly select English (required), Arabic and Urdu. The canonical optional creation field is `generationLanguages`. Explicit choices are immutable original creation configuration, preserved across source edits and subsequent preparation. Omission selects site defaults at preparation start. Exact-target regeneration retains its original bundle. Copies/templates currently create fresh source-only drafts using site defaults; changing a saved draft's target configuration remains outstanding.

The creation request hash binds explicit choices. Older omitted-field hashes and receipts remain unchanged. Exact retries cannot silently change targets or fabricate a historical choice for legacy drafts. Scoped detail reads expose the selected array or null, not internal receipt metadata. SQLite upgrades receipts additively; PostgreSQL migration 041 adds constrained nullable JSONB. Backup/import preserves explicit selections and leaves legacy intent null.

Bounded identity-keyed tab recovery retains the original selection, UUID and request body. Reload and lost acknowledgement reconcile accepted receipts read-only; explicit retry after an absent receipt resends unchanged intent. Source edits cannot change the immutable creation choice. Publications, assignments, responses, earlier audio and active runs are not rewritten.

## Verification

- Full suite 22447: 480 tests, 477 passed, zero failures, three external PostgreSQL skips, 108.141 seconds. Covers canonical validation, replay/conflicts, immutable choice after edits/default changes, SQLite legacy upgrade, actual synthetic preparation, client recovery and populated PostgreSQL cutover. Final UI label/layout adjustments follow the suite, with strict build and native verification afterward.
- Strict build passes: entry `index-CgGRfqYd.js` 479.68 kB / 129.83 kB gzip; lazy new briefing 7.30 / 2.59. All 38 public-shell hashes independently match.
- Built credential-scoped memory fixture 17060: English/Urdu lost accepted acknowledgement and reload reconcile one creation with one POST; actual preparation produces only EN/UR. A separate English/Arabic pre-acceptance interruption retries two identical bodies with one UUID and creates one additional draft. No providers, email or persistent main data are used.
- Final memory fixture 23084 verifies the actual 320px form and saved English/Arabic choice after reload at desktop size. A distorted full-page screenshot was rejected; the corrected viewport screenshot shows correctly sized fields and controls. Proof under `artifacts/generation-languages/custom-new-mobile.jpg` and `custom-detail-desktop.jpg`.
- Both fixtures stopped, temporary tabs closed and viewport reset. Main synthetic/email-disabled preview 43805 remains at 3020/3021, browser-verified at 30 assigned, 25 responses, 22 matches, 3 clarifications and 5 pending. Eight selected business-table hashes remain unchanged, integrity is OK, foreign-key errors zero; main creation/settings/schedule/reminder/read ledgers remain empty.

Real PostgreSQL wire/concurrency/TLS, cloud rollout, hardware recording, independent EN/AR/UR evaluation, worker language selection and full-reference/accessibility acceptance remain open. Gemini free tier remains synthetic-only. Neon Free remains the database target; no account was provisioned. Reticle has no connected app; no verdict is claimed. Approximately 70% planned implementation, not readiness.
