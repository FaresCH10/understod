# Resolved Case Retention

Checkpoint: 2026-10-11. S36/A16 remain partial; not a production or legal verdict.

PostgreSQL migration 071 adds a separate default-disabled site policy, owner/admin
confirmation and immutable actor/site/exact-input receipts. GET/POST
`/api/retention/cases` and `/api/retention/cases/requests/:id` require credentials.
Days are 7, 30, 90, 365 or disabled. Raw audio and response text policies are separate.

Resolved cases expire only after resolution and every later message, review,
follow-up or voice receipt are older than the configured period. Historical
resolved cases start their clock at migration time, not an invented historical
resolution date. Open, recent and foreign cases remain unchanged.

Transactional purge clears case reasons/notes, help/message text, follow-up source,
translation/glossary and disagreement reasons. Receipt identities, hashes, outcome
and audit metadata remain. Audit failure rolls back all redaction. Late processing,
new review writes and voice playback cannot restore expired content; old exact
review receipts remain readable. Physical voice removal is separately leased,
retryable and requires verified absence. Disabling a policy cannot restore content.

The settings control stores exact pending intent in category/actor/site-scoped
tab storage. Unknown save or receipt reads block editing. Reload checks the old
receipt without automatic resend. The disposable response fixture recorded two
POSTs/two policy receipts. The case fixture recorded three POSTs/two receipts:
Chromium retried a lost POST, while server replay produced only two total revisions
(enable 90 days, explicitly disable). Both fixtures stopped with zero external
requests; disposable owners signed out and QA tabs closed.

Desktop and 320px mobile screenshots were inspected, with section client/scroll
widths 947/947 and 267/267. Files: `artifacts/case-retention-desktop-2026-10-11.jpg`
and `artifacts/case-retention-mobile-2026-10-11.jpg`. The final expired-case review
UI fence was built/typechecked and backend-tested after these screenshots, not
browser exercised. Reticle had no connected session; no verdict is claimed.

Related disposable suite: 52 passed, zero failed/skipped, 20.135 seconds. Later
read-model/review/clarification checks: 13 passed, 8.156 seconds. Pipeline/audio/
embedded checks: eight passed, 4.148 seconds. Strict optimized build passes with
existing entry-size and offline-import warnings. Historical seeded expiry rows
isolate database guards; they do not prove live inference or real elapsed time.

Remaining: broader briefing/activity/generated audio retention, holds, database
and private-object restore, real PostgreSQL concurrency, live/cloud, all-reference
and accessibility gates. No policy was applied to the existing SQLite preview.
Free Gemini remains synthetic-only; backups and disconnected devices are not wiped.
